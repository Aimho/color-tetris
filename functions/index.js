import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import {
  RULE_VERSION,
  RUN_TTL_MS,
  getKstDay,
  getKstSeason,
  platformForAppId,
  validateLedger,
  validateReplay,
} from './ranking-core.js';
import {
  calculateRankedEnergy,
  rewardRankedEnergy,
  spendRankedEnergy,
} from './shared/ranked-energy.js';
import { RANKED_RANDOM_VERSION } from './shared/ranked-random.js';
import {
  canChangeNickname,
  createFunnyNickname,
  nicknameReservationId,
  normalizeNickname,
} from './profile-core.js';
import {
  appendSeasonResult,
  createSeasonBadgeIds,
  getUnprocessedClosedSeasons,
} from './shared/season-badges.js';

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
  await getOrCreateProfile(uid);
  const requestId = normalizeRequestId(request.data?.requestId);
  const platform = safeAppPlatform(request.app?.appId, request.data?.platform);
  const now = Timestamp.now();
  const nowDate = now.toDate();
  const day = getKstDay(nowDate);
  const season = getKstSeason(nowDate);
  const runId = randomUUID();
  const energyRef = db.doc(`ranked_energy/${uid}`);
  const runRef = db.doc(`ranked_runs/${runId}`);
  const requestRef = db.doc(`ranked_run_requests/${uid}_${day}_${requestId}`);

  const remaining = await db.runTransaction(async transaction => {
    const previousRequest = await transaction.get(requestRef);
    if (previousRequest.exists) return previousRequest.data().response;
    const energySnapshot = await transaction.get(energyRef);
    const energy = spendRankedEnergy(energySnapshot.data(), now.toMillis());
    if (!energy.spent) {
      throw new HttpsError('resource-exhausted', '에너지가 충전 중입니다.', {
        energy:serializeRankedEnergy(energy),
      });
    }
    transaction.set(energyRef, energyDocument(uid, energy, now));
    transaction.create(runRef, {
      uid, day, season, platform, ruleVersion:RULE_VERSION,
      seed:runId, randomVersion:RANKED_RANDOM_VERSION,
      status:'active', failedSubmissions:0, createdAt:now,
      expiresAt:Timestamp.fromMillis(now.toMillis() + RUN_TTL_MS),
    });
    const result = {
      runId, day, season, platform, ruleVersion:RULE_VERSION,
      seed:runId, randomVersion:RANKED_RANDOM_VERSION,
      energy:serializeRankedEnergy(energy),
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
  const playerProfile = await getOrCreateProfile(uid);
  const name = playerProfile.nickname;
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
        firstRecord:initialRun.firstRecord,
        previousScore:initialRun.previousScore,
        bestScore:initialRun.bestScore,
        score:initialRun.finalScore,
        level:initialRun.finalLevel,
        name:initialRun.finalName || name,
        energyRewarded:Boolean(initialRun.energyRewarded),
        energy:initialRun.energyAfter || null,
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
  } catch (error) {
    logger.warn('Ranked ledger validation failed', {
      runId,
      reason:String(error?.message || 'unknown').slice(0, 80),
    });
    await recordFailedSubmission(runRef);
    throw new HttpsError('invalid-argument', '게임 기록을 검증할 수 없습니다.');
  }

  const result = await db.runTransaction(async transaction => {
    const runSnapshot = await transaction.get(runRef);
    const run = runSnapshot.data();
    assertUsableRun(run, uid);
    if (run.status === 'accepted') {
      return {
        accepted:true,
        updated:run.bestUpdated,
        firstRecord:run.firstRecord,
        previousScore:run.previousScore,
        bestScore:run.bestScore,
        score:run.finalScore,
        level:run.finalLevel,
        name:run.finalName || name,
        energyRewarded:Boolean(run.energyRewarded),
        energy:run.energyAfter || null,
      };
    }
    const now = Timestamp.now();

    const scoreRef = db.doc(`season_rankings/${run.season}_${run.platform}/scores/${uid}`);
    const energyRef = db.doc(`ranked_energy/${uid}`);
    const [previousSnapshot, energySnapshot] = await Promise.all([
      transaction.get(scoreRef),
      transaction.get(energyRef),
    ]);
    const previous = previousSnapshot.data();
    const firstRecord = !previous;
    const updated = !previous
      || ledger.score > previous.score
      || (ledger.score === previous.score && ledger.level > previous.level);

    const energy = updated
      ? rewardRankedEnergy(energySnapshot.data(), now.toMillis())
      : calculateRankedEnergy(energySnapshot.data(), now.toMillis());

    transaction.update(runRef, {
      status:'accepted', submittedAt:now, verifiedAt:now, bestUpdated:updated,
      firstRecord,
      previousScore:previous?.score ?? null,
      bestScore:updated ? ledger.score : previous.score,
      finalScore:ledger.score, finalLevel:ledger.level, finalName:name,
      energyRewarded:updated && energy.rewarded,
      energyAfter:serializeRankedEnergy(energy),
    });
    transaction.set(energyRef, energyDocument(uid, energy, now));
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
    return {
      accepted:true,
      updated,
      firstRecord,
      previousScore:previous?.score ?? null,
      bestScore:updated ? ledger.score : previous.score,
      score:ledger.score,
      level:ledger.level,
      name,
      energyRewarded:updated && energy.rewarded,
      energy:serializeRankedEnergy(energy),
    };
  });
  return result;
});

export const getRankedEnergy = onCall(OPTIONS, async request => {
  const uid = requireRankedUid(request);
  const now = Timestamp.now();
  const snapshot = await db.doc(`ranked_energy/${uid}`).get();
  const energy = calculateRankedEnergy(snapshot.data(), now.toMillis());
  return serializeRankedEnergy(energy);
});

export const getOrCreatePlayerProfile = onCall(OPTIONS, async request => {
  const uid = requireUid(request);
  const profile = await getOrCreateProfile(uid);
  await Promise.all([
    syncCurrentRankingNames(uid, profile.nickname),
    syncClosedSeasonBadges(uid, profile),
  ]);
  return serializePlayerProfile((await db.doc(`player_profiles/${uid}`).get()).data());
});

function currentSeasonScoreRefs(uid, season = getKstSeason()) {
  return [
    db.doc(`season_rankings/${season}_mobile/scores/${uid}`),
    db.doc(`season_rankings/${season}_desktop/scores/${uid}`),
  ];
}

async function syncCurrentRankingNames(uid, nickname) {
  const scoreRefs = currentSeasonScoreRefs(uid);
  const snapshots = await Promise.all(scoreRefs.map(scoreRef => scoreRef.get()));
  const changed = snapshots
    .map((snapshot, index) => ({snapshot, ref:scoreRefs[index]}))
    .filter(({snapshot}) => snapshot.exists && snapshot.data().name !== nickname);
  if (!changed.length) return;
  const batch = db.batch();
  changed.forEach(({ref}) => batch.update(ref, {name:nickname, updatedAt:FieldValue.serverTimestamp()}));
  await batch.commit();
}

async function getOrCreateProfile(uid) {
  const profileRef = db.doc(`player_profiles/${uid}`);
  const existing = await profileRef.get();
  if (existing.exists) return existing.data();

  for (let attempt = 0; attempt < 12; attempt++) {
    const nickname = createFunnyNickname();
    const reservationRef = db.doc(`nickname_reservations/${nicknameReservationId(nickname)}`);
    const created = await db.runTransaction(async transaction => {
      const [profileSnapshot, reservationSnapshot] = await Promise.all([
        transaction.get(profileRef),
        transaction.get(reservationRef),
      ]);
      if (profileSnapshot.exists) return profileSnapshot.data();
      if (reservationSnapshot.exists) return null;
      const now = Timestamp.now();
      const profile = {
        uid,
        nickname,
        isCustom:false,
        createdAt:now,
        updatedAt:now,
        lastNicknameChangeAt:null,
      };
      transaction.create(reservationRef, {uid, nickname, createdAt:now});
      transaction.create(profileRef, profile);
      return profile;
    });
    if (created) return created;
  }
  throw new HttpsError('resource-exhausted', '닉네임을 만들지 못했습니다. 잠시 후 다시 시도해주세요.');
}

export const updatePlayerNickname = onCall(OPTIONS, async request => {
  const uid = requireUid(request);
  const nickname = normalizeNickname(request.data?.nickname);
  if (!nickname) throw new HttpsError('invalid-argument', '닉네임은 한글·영문·숫자로 2~12자까지 입력해주세요.');
  const now = Timestamp.now();
  const season = getKstSeason(now.toDate());
  const profileRef = db.doc(`player_profiles/${uid}`);
  const reservationRef = db.doc(`nickname_reservations/${nicknameReservationId(nickname)}`);
  const currentScoreRefs = currentSeasonScoreRefs(uid, season);

  const updated = await db.runTransaction(async transaction => {
    const [profileSnapshot, reservationSnapshot, ...scoreSnapshots] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(reservationRef),
      ...currentScoreRefs.map(scoreRef => transaction.get(scoreRef)),
    ]);
    if (!profileSnapshot.exists) throw new HttpsError('failed-precondition', '프로필을 먼저 불러와주세요.');
    const profile = profileSnapshot.data();
    if (nicknameReservationId(profile.nickname) === nicknameReservationId(nickname)) return profile;
    const change = canChangeNickname({
      isCustom:profile.isCustom,
      lastNicknameChangeAtMs:profile.lastNicknameChangeAt?.toMillis?.() || 0,
    }, now.toMillis());
    if (!change.allowed) {
      throw new HttpsError('resource-exhausted', '닉네임은 직접 변경한 뒤 24시간 후 다시 바꿀 수 있습니다.');
    }
    if (reservationSnapshot.exists && reservationSnapshot.data().uid !== uid) {
      throw new HttpsError('already-exists', '이미 사용 중인 닉네임입니다.');
    }
    const previousReservationRef = db.doc(`nickname_reservations/${nicknameReservationId(profile.nickname)}`);
    transaction.delete(previousReservationRef);
    transaction.set(reservationRef, {uid, nickname, createdAt:now});
    const nextProfile = {
      ...profile,
      nickname,
      isCustom:true,
      lastNicknameChangeAt:now,
      updatedAt:now,
    };
    transaction.set(profileRef, nextProfile);
    scoreSnapshots.forEach((snapshot, index) => {
      if (snapshot.exists) transaction.update(currentScoreRefs[index], {name:nickname, updatedAt:now});
    });
    return nextProfile;
  });
  return serializePlayerProfile(updated);
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
  return requireUid(request);
}

function requireUid(request) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  return request.auth.uid;
}

function serializePlayerProfile(profile) {
  const lastNicknameChangeAtMs = profile.lastNicknameChangeAt?.toMillis?.() || 0;
  const change = canChangeNickname({
    isCustom:profile.isCustom,
    lastNicknameChangeAtMs,
  });
  return {
    nickname:profile.nickname,
    isCustom:Boolean(profile.isCustom),
    lastNicknameChangeAtMs,
    nextNicknameChangeAt:change.nextChangeAt,
    canChangeNickname:change.allowed,
    seasonBadges:Array.isArray(profile.seasonBadges) ? profile.seasonBadges : [],
    seasonResults:Array.isArray(profile.seasonResults) ? profile.seasonResults : [],
  };
}

async function syncClosedSeasonBadges(uid, profile) {
  const profileRef = db.doc(`player_profiles/${uid}`);
  const claim = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(profileRef);
    const currentProfile = snapshot.data() || profile;
    const now = Timestamp.now();
    if (currentProfile.badgeProcessingUntil?.toMillis?.() > now.toMillis()) return null;
    const [nextSeason] = getUnprocessedClosedSeasons({
      createdAt:currentProfile.createdAt?.toDate?.() || new Date(),
      processed:currentProfile.badgeSeasonsProcessed || [],
      limit:1,
    });
    if (!nextSeason) return null;
    transaction.update(profileRef, {
      badgeProcessingSeason:nextSeason,
      badgeProcessingUntil:Timestamp.fromMillis(now.toMillis() + 60_000),
    });
    return {
      season:nextSeason,
      seasonResults:Array.isArray(currentProfile.seasonResults) ? currentProfile.seasonResults : [],
    };
  });
  if (!claim) return;
  const {season, seasonResults} = claim;
  try {
    const badges = [];
    const platforms = {};
    for (const platform of ['mobile', 'desktop']) {
      const scores = db.collection(`season_rankings/${season}_${platform}/scores`);
      const ownScore = await scores.doc(uid).get();
      if (!ownScore.exists) {
        platforms[platform] = null;
        continue;
      }
      const top = await scores
        .orderBy('score', 'desc')
        .orderBy('level', 'desc')
        .orderBy('achievedAt', 'asc')
        .limit(50)
        .get();
      const rank = top.docs.findIndex(score => score.id === uid) + 1;
      const ownRecord = ownScore.data();
      platforms[platform] = {
        score:Number(ownRecord.score || 0),
        level:Number(ownRecord.level || 1),
        rank,
      };
      badges.push(...createSeasonBadgeIds(season, platform, rank, true));
    }
    await profileRef.update({
      badgeSeasonsProcessed:FieldValue.arrayUnion(season),
      ...(badges.length ? {seasonBadges:FieldValue.arrayUnion(...badges)} : {}),
      seasonResults:appendSeasonResult(seasonResults, {season, platforms}),
      badgeProcessingSeason:FieldValue.delete(),
      badgeProcessingUntil:FieldValue.delete(),
      updatedAt:FieldValue.serverTimestamp(),
    });
  } catch (error) {
    await profileRef.update({
      badgeProcessingSeason:FieldValue.delete(),
      badgeProcessingUntil:FieldValue.delete(),
    }).catch(() => {});
    throw error;
  }
}

function safeAppPlatform(appId, requestedPlatform) {
  const mobileAppIds = String(process.env.MOBILE_APP_IDS || '').split(',').filter(Boolean);
  try { return platformForAppId(appId, mobileAppIds, requestedPlatform); }
  catch (error) {
    if (error?.message === 'invalid-platform') {
      throw new HttpsError('invalid-argument', '플랫폼 정보가 올바르지 않습니다.');
    }
    throw new HttpsError('failed-precondition', '등록되지 않은 앱입니다.');
  }
}

function normalizeRequestId(value) {
  const requestId = String(value || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new HttpsError('invalid-argument', '요청 ID가 올바르지 않습니다.');
  }
  return requestId.toLowerCase();
}

function energyDocument(uid, energy, now) {
  return {
    uid,
    balance:energy.balance,
    chargedAt:Timestamp.fromMillis(energy.chargedAtMs),
    updatedAt:now,
  };
}

function serializeRankedEnergy(energy) {
  return {
    balance:energy.balance,
    max:energy.max,
    nextRechargeAt:energy.nextRechargeAt,
    serverNow:energy.serverNow,
  };
}
