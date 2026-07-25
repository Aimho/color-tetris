import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  DAILY_ATTEMPT_LIMIT,
  RULE_VERSION,
  RUN_TTL_MS,
  getKstDay,
  getKstSeason,
  platformForAppId,
  validateLedger,
  validateReplay,
} from './ranking-core.js';
import { RANKED_RANDOM_VERSION } from './shared/ranked-random.js';

initializeApp();
const db = getFirestore();
const OPTIONS = {
  region:'asia-northeast3',
  enforceAppCheck:true,
  consumeAppCheckToken:true,
  timeoutSeconds:15,
  memory:'256MiB',
  maxInstances:10,
};

export const startRankedRun = onCall(OPTIONS, async request => {
  const uid = requireRankedUid(request);
  const requestId = normalizeRequestId(request.data?.requestId);
  const platform = safeAppPlatform(request.app?.appId);
  const now = Timestamp.now();
  const nowDate = now.toDate();
  const day = getKstDay(nowDate);
  const season = getKstSeason(nowDate);
  const runId = randomUUID();
  const usageRef = db.doc(`ranked_attempt_usage/${uid}_${day}`);
  const runRef = db.doc(`ranked_runs/${runId}`);
  const requestRef = db.doc(`ranked_run_requests/${uid}_${day}_${requestId}`);

  const remaining = await db.runTransaction(async transaction => {
    const previousRequest = await transaction.get(requestRef);
    if (previousRequest.exists) return previousRequest.data().response;
    const usage = await transaction.get(usageRef);
    const used = usage.exists ? usage.data().used : 0;
    if (used >= DAILY_ATTEMPT_LIMIT) throw new HttpsError('resource-exhausted', '오늘의 랭킹 도전을 모두 사용했습니다.');
    transaction.set(usageRef, {
      uid, day, used:used + 1, updatedAt:FieldValue.serverTimestamp(),
      cleanupAt:Timestamp.fromMillis(now.toMillis() + 8 * 24 * 60 * 60 * 1000),
    });
    transaction.create(runRef, {
      uid, day, season, platform, ruleVersion:RULE_VERSION,
      seed:runId, randomVersion:RANKED_RANDOM_VERSION,
      status:'active', failedSubmissions:0, createdAt:now,
      expiresAt:Timestamp.fromMillis(now.toMillis() + RUN_TTL_MS),
    });
    const result = {
      runId, day, season, platform, ruleVersion:RULE_VERSION,
      seed:runId, randomVersion:RANKED_RANDOM_VERSION,
      remaining:DAILY_ATTEMPT_LIMIT - used - 1,
      expiresAt:now.toMillis() + RUN_TTL_MS,
    };
    transaction.create(requestRef, {
      response:result,
      cleanupAt:Timestamp.fromMillis(now.toMillis() + 8 * 24 * 60 * 60 * 1000),
    });
    return result;
  });

  return remaining;
});

export const submitRankedRun = onCall(OPTIONS, async request => {
  const uid = requireRankedUid(request);
  const runId = String(request.data?.runId || '');
  const name = normalizeName(request.data?.name);
  if (JSON.stringify(request.data?.ledger ?? null).length > 512_000) {
    throw new HttpsError('invalid-argument', '게임 기록이 허용 크기를 초과했습니다.');
  }
  if (!/^[0-9a-f-]{36}$/.test(runId)) throw new HttpsError('invalid-argument', '실행 토큰이 올바르지 않습니다.');
  const runRef = db.doc(`ranked_runs/${runId}`);
  const initialSnapshot = await runRef.get();
  if (!initialSnapshot.exists) throw new HttpsError('not-found', '랭킹 도전을 찾을 수 없습니다.');
  const initialRun = initialSnapshot.data();
  assertUsableRun(initialRun, uid);
  if (initialRun.status === 'accepted') {
    return {
      accepted:true,
      updated:initialRun.bestUpdated,
      score:initialRun.finalScore,
      level:initialRun.finalLevel,
    };
  }
  const verifiedAt = Timestamp.now();
  let ledger;
  try {
    ledger = validateLedger(request.data?.ledger, {
      ...initialRun,
      createdAtMs:initialRun.createdAt.toMillis(),
    }, verifiedAt.toMillis());
    validateReplay(ledger, initialRun);
  } catch {
    await recordFailedSubmission(runRef);
    throw new HttpsError('invalid-argument', '게임 기록을 검증할 수 없습니다.');
  }

  const result = await db.runTransaction(async transaction => {
    const runSnapshot = await transaction.get(runRef);
    const run = runSnapshot.data();
    assertUsableRun(run, uid);
    if (run.status === 'accepted') {
      return {accepted:true, updated:run.bestUpdated, score:run.finalScore, level:run.finalLevel};
    }
    const now = Timestamp.now();

    const scoreRef = db.doc(`season_rankings/${run.season}_${run.platform}/scores/${uid}`);
    const previousSnapshot = await transaction.get(scoreRef);
    const previous = previousSnapshot.data();
    const updated = !previous
      || ledger.score > previous.score
      || (ledger.score === previous.score && ledger.level > previous.level);

    transaction.update(runRef, {
      status:'accepted', submittedAt:now, verifiedAt:now, bestUpdated:updated,
      finalScore:ledger.score, finalLevel:ledger.level,
    });
    transaction.create(db.doc(`ranked_submissions/${runId}`), {
      uid, name, runId, season:run.season, platform:run.platform,
      ruleVersion:RULE_VERSION, ledger, status:'accepted',
      createdAt:FieldValue.serverTimestamp(),
      cleanupAt:Timestamp.fromMillis(now.toMillis() + 40 * 24 * 60 * 60 * 1000),
    });
    if (updated) {
      transaction.set(scoreRef, {
        uid, name, score:ledger.score, level:ledger.level,
        platform:run.platform, season:run.season, ruleVersion:RULE_VERSION,
        achievedAt:now, updatedAt:FieldValue.serverTimestamp(),
      });
    }
    return {accepted:true, updated, score:ledger.score, level:ledger.level};
  });
  return result;
});

function assertUsableRun(run, uid) {
  if (!run) throw new HttpsError('not-found', '랭킹 도전을 찾을 수 없습니다.');
  if (run.uid !== uid) throw new HttpsError('permission-denied', '사용할 수 없는 도전입니다.');
  if (run.status !== 'active' && run.status !== 'accepted') {
    throw new HttpsError('permission-denied', '이미 종료되었거나 사용할 수 없는 도전입니다.');
  }
  if (run.status === 'active' && run.expiresAt.toMillis() <= Date.now()) {
    throw new HttpsError('deadline-exceeded', '랭킹 도전 시간이 만료됐습니다.');
  }
}

async function recordFailedSubmission(runRef) {
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(runRef);
    const run = snapshot.data();
    if (!snapshot.exists || run.status !== 'active') return;
    const failedSubmissions = (run.failedSubmissions || 0) + 1;
    transaction.update(runRef, {
      failedSubmissions,
      status:failedSubmissions >= 3 ? 'rejected' : 'active',
      lastFailedAt:FieldValue.serverTimestamp(),
    });
  });
}

function requireRankedUid(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  if (request.auth.token?.firebase?.sign_in_provider === 'anonymous') {
    throw new HttpsError('failed-precondition', '랭킹 도전은 소셜 계정 연결이 필요합니다.');
  }
  return request.auth.uid;
}

function safeAppPlatform(appId) {
  const mobileAppIds = String(process.env.MOBILE_APP_IDS || '').split(',').filter(Boolean);
  try { return platformForAppId(appId, mobileAppIds); }
  catch { throw new HttpsError('failed-precondition', '등록되지 않은 앱입니다.'); }
}

function normalizeRequestId(value) {
  const requestId = String(value || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new HttpsError('invalid-argument', '요청 ID가 올바르지 않습니다.');
  }
  return requestId.toLowerCase();
}

function normalizeName(value) {
  const name = String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 12);
  if (!name) throw new HttpsError('invalid-argument', '닉네임을 확인해주세요.');
  return name;
}
