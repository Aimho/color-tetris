import { randomUUID, verify as verifySignature } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
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
import {
  DAILY_MISSIONS,
  ENERGY_MAX,
  SHOP_CATALOG,
  WEEKLY_MISSIONS,
  applyMissionRun,
  catalogItem,
  consumeEnergy,
  defaultEconomy,
  emptyMissionProgress,
  getKstWeek,
  grantEnergy,
  refillEnergy,
  serializeMissions,
} from './economy-core.js';

const ADMOB_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const ADMOB_CONSOLE_VERIFICATION_UID = 'admob-console-verification';
const ADMOB_CONSOLE_VERIFICATION_REQUEST_ID = '00000000-0000-4000-8000-000000000001';
let admobKeysCache = {expiresAt:0, keys:new Map()};

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
// Old test builds cannot display or recover ranked energy. Fail explicitly so
// they cannot silently bypass the policy or strand players after three runs.
export const startRankedRun = onCall(OPTIONS, () => {
  throw new HttpsError('failed-precondition', '최신 버전으로 업데이트한 뒤 랭크에 참여해 주세요.');
});
export const startRankedRunV2 = onCall(OPTIONS, request => createRankedRun(request, true));

async function createRankedRun(request, energyRequired) {
  const uid = requireRankedUid(request);
  await getOrCreateProfile(uid);
  const requestId = normalizeRequestId(request.data?.requestId);
  const platform = safeAppPlatform(request.app?.appId);
  const now = Timestamp.now();
  const nowDate = now.toDate();
  const day = getKstDay(nowDate);
  const season = getKstSeason(nowDate);
  const runId = randomUUID();
  const profileRef = db.doc(`player_profiles/${uid}`);
  const runRef = db.doc(`ranked_runs/${runId}`);
  const requestRef = db.doc(`ranked_run_requests/${uid}_${day}_${requestId}`);

  const remaining = await db.runTransaction(async transaction => {
    const [previousRequest, profileSnapshot] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(profileRef),
    ]);
    if (previousRequest.exists) return previousRequest.data().response;
    const profile = profileSnapshot.data();
    const energy = energyRequired
      ? consumeEnergy(energyState(profile, now.toMillis()), now.toMillis())
      : refillEnergy(energyState(profile, now.toMillis()), now.toMillis());
    if (energyRequired && !energy.consumed) throw new HttpsError('resource-exhausted', '랭크 에너지가 부족합니다.');
    if (energyRequired) transaction.update(profileRef, energyUpdate(energy, now));
    transaction.create(runRef, {
      uid, day, season, platform, ruleVersion:RULE_VERSION,
      seed:runId, randomVersion:RANKED_RANDOM_VERSION,
      status:'active', failedSubmissions:0, createdAt:now,
      expiresAt:Timestamp.fromMillis(now.toMillis() + RUN_TTL_MS),
    });
    const result = {
      runId, day, season, platform, ruleVersion:RULE_VERSION,
      seed:runId, randomVersion:RANKED_RANDOM_VERSION,
      remaining:energyRequired ? energy.energy : null,
      nextRefillAt:energyRequired ? energy.nextRefillAtMs : null,
      expiresAt:now.toMillis() + RUN_TTL_MS,
    };
    transaction.create(requestRef, {
      response:result,
      cleanupAt:Timestamp.fromMillis(now.toMillis() + 8 * 24 * 60 * 60 * 1000),
    });
    return result;
  });

  return remaining;
}

export const submitRankedRun = onCall(OPTIONS, async request => {
  const platform = safeAppPlatform(request.app?.appId);
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
  if (initialRun.platform !== platform) {
    throw new HttpsError('permission-denied', '사용할 수 없는 플랫폼의 도전입니다.');
  }
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
    const day = getKstDay(now.toDate());
    const week = getKstWeek(now.toDate());
    const previousSnapshot = await transaction.get(scoreRef);
    const previous = previousSnapshot.data();
    const firstRecord = !previous;
    const updated = !previous
      || ledger.score > previous.score
      || (ledger.score === previous.score && ledger.level > previous.level);

    transaction.update(runRef, {
      status:'accepted', submittedAt:now, verifiedAt:now, bestUpdated:updated,
      firstRecord,
      previousScore:previous?.score ?? null,
      bestScore:updated ? ledger.score : previous.score,
      finalScore:ledger.score, finalLevel:ledger.level, finalName:name,
    });
    transaction.create(db.doc(`ranked_submissions/${runId}`), {
      uid, name, runId, season:run.season, platform:run.platform,
      ruleVersion:RULE_VERSION, ledger, status:'accepted',
      createdAt:FieldValue.serverTimestamp(),
      cleanupAt:Timestamp.fromMillis(now.toMillis() + 40 * 24 * 60 * 60 * 1000),
    });
    transaction.create(db.doc(`ranked_completion_events/${runId}`), {
      uid, runId, day, week, ledger, status:'pending', createdAt:now,
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
    };
  });
  return result;
});

export const applyRankedMissionRewards = onDocumentCreated({
  document:'ranked_completion_events/{runId}',
  region:'asia-northeast3',
  retry:true,
  timeoutSeconds:30,
  memory:'256MiB',
  maxInstances:10,
}, async event => {
  const eventRef = event.data?.ref;
  if (!eventRef) return;
  await processRankedMissionEvent(eventRef);
});

export const reconcileRankedMissionRewards = onSchedule({
  schedule:'every 15 minutes',
  region:'asia-northeast3',
  retryCount:3,
  timeoutSeconds:60,
  memory:'256MiB',
}, async () => {
  const pending = await db.collection('ranked_completion_events')
    .where('status', '==', 'pending')
    .limit(100)
    .get();
  const results = await Promise.allSettled(pending.docs.map(snapshot => processRankedMissionEvent(snapshot.ref)));
  const failed = results.filter(result => result.status === 'rejected');
  if (failed.length) {
    logger.error('Ranked mission reconciliation incomplete', {failed:failed.length, total:results.length});
    throw new Error('ranked-mission-reconciliation-incomplete');
  }
});

async function processRankedMissionEvent(eventRef) {
  await db.runTransaction(async transaction => {
    const eventSnapshot = await transaction.get(eventRef);
    const completion = eventSnapshot.data();
    if (!eventSnapshot.exists || completion.status === 'processed') return;
    const {uid, day, week, ledger} = completion;
    if (!uid || !day || !week || !ledger) throw new Error('invalid-ranked-completion-event');
    const profileRef = db.doc(`player_profiles/${uid}`);
    const dailyRef = db.doc(`mission_progress/${uid}_daily_${day}`);
    const weeklyRef = db.doc(`mission_progress/${uid}_weekly_${week}`);
    const [profileSnapshot, dailySnapshot, weeklySnapshot] = await Promise.all([
      transaction.get(profileRef), transaction.get(dailyRef), transaction.get(weeklyRef),
    ]);
    if (!profileSnapshot.exists) throw new Error('ranked-completion-profile-missing');
    const daily = applyMissionRun(
      dailySnapshot.exists ? dailySnapshot.data() : emptyMissionProgress(day, 'daily'), ledger,
    );
    const weekly = applyMissionRun(
      weeklySnapshot.exists ? weeklySnapshot.data() : emptyMissionProgress(week, 'weekly'), ledger,
    );
    const missionReward = daily.reward + weekly.reward;
    const now = Timestamp.now();
    transaction.set(dailyRef, missionProgressData(uid, daily, now));
    transaction.set(weeklyRef, missionProgressData(uid, weekly, now));
    if (missionReward > 0) {
      transaction.update(profileRef, {
        sparkBalance:Math.max(0, Number(profileSnapshot.data().sparkBalance) || 0) + missionReward,
        updatedAt:now,
      });
    }
    transaction.update(eventRef, {status:'processed', missionReward, processedAt:now});
  });
}

export const getOrCreatePlayerProfile = onCall(OPTIONS, async request => {
  const uid = requireUid(request);
  const profile = await getOrCreateProfile(uid);
  await Promise.all([
    syncCurrentRankingNames(uid, profile.nickname),
    syncClosedSeasonBadges(uid, profile),
  ]);
  const refreshed = await refreshPlayerEconomy(uid);
  return serializePlayerProfile(refreshed.profile, refreshed);
});

export const purchaseShopItem = onCall(OPTIONS, async request => {
  const uid = requireUid(request);
  const item = catalogItem(String(request.data?.itemId || ''));
  if (!item) throw new HttpsError('invalid-argument', '판매 중인 상품이 아닙니다.');
  await getOrCreateProfile(uid);
  const profileRef = db.doc(`player_profiles/${uid}`);
  const result = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(profileRef);
    const profile = snapshot.data();
    const ownedItems = Array.isArray(profile.ownedItems) ? profile.ownedItems : [];
    if (ownedItems.includes(item.id)) return {purchased:false, profile};
    const balance = Math.max(0, Number(profile.sparkBalance) || 0);
    if (balance < item.price) throw new HttpsError('failed-precondition', 'SPARK가 부족합니다.');
    const next = {...profile, sparkBalance:balance - item.price, ownedItems:[...ownedItems, item.id]};
    transaction.update(profileRef, {
      sparkBalance:next.sparkBalance,
      ownedItems:next.ownedItems,
      updatedAt:FieldValue.serverTimestamp(),
    });
    return {purchased:true, profile:next};
  });
  return {...serializePlayerProfile(result.profile), purchased:result.purchased};
});

export const equipShopItem = onCall(OPTIONS, async request => {
  const uid = requireUid(request);
  const item = catalogItem(String(request.data?.itemId || ''));
  if (!item) throw new HttpsError('invalid-argument', '장착할 수 없는 상품입니다.');
  const profileRef = db.doc(`player_profiles/${uid}`);
  const profile = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(profileRef);
    if (!snapshot.exists) throw new HttpsError('failed-precondition', '프로필을 먼저 불러와주세요.');
    const current = snapshot.data();
    if (!Array.isArray(current.ownedItems) || !current.ownedItems.includes(item.id)) {
      throw new HttpsError('permission-denied', '보유한 상품만 장착할 수 있습니다.');
    }
    const equippedItems = {...current.equippedItems, [item.slot]:item.id};
    transaction.update(profileRef, {equippedItems, updatedAt:FieldValue.serverTimestamp()});
    return {...current, equippedItems};
  });
  return serializePlayerProfile(profile);
});

export const createRewardedEnergyRequest = onCall(OPTIONS, async request => {
  const uid = requireUid(request);
  await getOrCreateProfile(uid);
  const now = Timestamp.now();
  const profile = await refreshPlayerEconomy(uid, now);
  if (profile.energy >= ENERGY_MAX) throw new HttpsError('failed-precondition', '에너지가 이미 가득 찼습니다.');
  const requestRef = db.doc(`rewarded_energy_requests/${uid}`);
  const result = await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(requestRef);
    const existing = snapshot.data();
    if (snapshot.exists && existing.status === 'pending' && existing.expiresAt.toMillis() > now.toMillis()) {
      return {requestId:existing.requestId, userId:uid, expiresAt:existing.expiresAt.toMillis()};
    }
    const requestId = randomUUID();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + 10 * 60 * 1000);
    transaction.set(requestRef, {
      uid, requestId,
      status:'pending',
      createdAt:now,
      expiresAt,
      cleanupAt:Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000),
    });
    return {requestId, userId:uid, expiresAt:expiresAt.toMillis()};
  });
  return result;
});

export const admobRewardedEnergy = onRequest({
  region:'asia-northeast3', timeoutSeconds:15, memory:'256MiB', maxInstances:10,
}, async (request, response) => {
  try {
    if (request.method !== 'GET') return response.status(405).send('method-not-allowed');
    const rawQuery = request.originalUrl.split('?')[1] || '';
    const requestId = String(request.query.custom_data || '');
    const uid = String(request.query.user_id || '');
    const transactionId = String(request.query.transaction_id || '');
    // AdMob's console probe has no real reward request. It can only verify URL
    // reachability and never enters the grant transaction below.
    if (uid === ADMOB_CONSOLE_VERIFICATION_UID && requestId === ADMOB_CONSOLE_VERIFICATION_REQUEST_ID) {
      return response.status(200).send('verified');
    }
    if (!await verifyAdMobCallback(rawQuery)) return response.status(400).send('invalid-signature');
    const configuredAdUnit = String(process.env.ADMOB_REWARDED_AD_UNIT_ID || '');
    if (!configuredAdUnit) return response.status(503).send('ad-unit-not-configured');
    if (!/^[0-9a-f-]{36}$/i.test(requestId) || !uid) {
      return response.status(400).send('invalid-parameters');
    }
    if (String(request.query.ad_unit || '') !== configuredAdUnit) {
      return response.status(400).send('invalid-ad-unit');
    }
    if (String(request.query.reward_item || '') !== 'energy' || String(request.query.reward_amount || '') !== '1') {
      return response.status(400).send('invalid-reward');
    }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(transactionId)) {
      return response.status(400).send('invalid-transaction');
    }
    const requestRef = db.doc(`rewarded_energy_requests/${uid}`);
    const transactionRef = db.doc(`rewarded_ad_transactions/${transactionId}`);
    const profileRef = db.doc(`player_profiles/${uid}`);
    await db.runTransaction(async transaction => {
      const [rewardSnapshot, usedSnapshot, profileSnapshot] = await Promise.all([
        transaction.get(requestRef), transaction.get(transactionRef), transaction.get(profileRef),
      ]);
      if (usedSnapshot.exists) return;
      const rewardRequest = rewardSnapshot.data();
      if (!rewardSnapshot.exists || rewardRequest.uid !== uid || rewardRequest.requestId !== requestId || rewardRequest.status !== 'pending') {
        throw new Error('invalid-request');
      }
      const now = Timestamp.now();
      if (rewardRequest.expiresAt.toMillis() < now.toMillis()) throw new Error('expired-request');
      const energy = grantEnergy(energyState(profileSnapshot.data(), now.toMillis()), now.toMillis());
      transaction.create(transactionRef, {
        uid, requestId, transactionId, granted:energy.granted, createdAt:now,
        cleanupAt:Timestamp.fromMillis(now.toMillis() + 90 * 24 * 60 * 60 * 1000),
      });
      transaction.update(requestRef, {status:'verified', transactionId, granted:energy.granted, verifiedAt:now});
      if (energy.granted) transaction.update(profileRef, energyUpdate(energy, now));
    });
    return response.status(200).send('ok');
  } catch (error) {
    logger.warn('AdMob rewarded SSV rejected', {reason:String(error?.message || 'unknown').slice(0, 80)});
    return response.status(400).send('rejected');
  }
});

function currentSeasonScoreRefs(uid, season = getKstSeason()) {
  return [db.doc(`season_rankings/${season}_app/scores/${uid}`)];
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
  if (existing.exists && normalizeNickname(existing.data().nickname)) return existing.data();

  for (let attempt = 0; attempt < 12; attempt++) {
    const nickname = createFunnyNickname();
    const reservationRef = db.doc(`nickname_reservations/${nicknameReservationId(nickname)}`);
    const created = await db.runTransaction(async transaction => {
      const [profileSnapshot, reservationSnapshot] = await Promise.all([
        transaction.get(profileRef),
        transaction.get(reservationRef),
      ]);
      const currentProfile = profileSnapshot.exists ? profileSnapshot.data() : null;
      if (currentProfile && normalizeNickname(currentProfile.nickname)) return currentProfile;
      if (reservationSnapshot.exists) return null;
      const now = Timestamp.now();
      if (currentProfile) {
        const migratedProfile = {...currentProfile, nickname, isCustom:false, updatedAt:now};
        transaction.create(reservationRef, {uid, nickname, createdAt:now});
        transaction.update(profileRef, {nickname, isCustom:false, updatedAt:now});
        return migratedProfile;
      }
      const profile = {
        uid,
        nickname,
        isCustom:false,
        createdAt:now,
        updatedAt:now,
        lastNicknameChangeAt:null,
        ...defaultEconomy(),
        energyUpdatedAt:now,
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

function serializePlayerProfile(profile, economy = null) {
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
    rankedEnergy:economy?.energy ?? (Number.isInteger(profile.rankedEnergy) ? Math.min(ENERGY_MAX, Math.max(0, profile.rankedEnergy)) : ENERGY_MAX),
    nextEnergyAt:economy?.nextRefillAtMs ?? null,
    sparkBalance:Math.max(0, Number(profile.sparkBalance) || 0),
    ownedItems:Array.isArray(profile.ownedItems) ? profile.ownedItems : [],
    equippedItems:profile.equippedItems && typeof profile.equippedItems === 'object' ? profile.equippedItems : {},
    shopCatalog:SHOP_CATALOG,
    dailyMissions:economy?.dailyMissions || [],
    weeklyMissions:economy?.weeklyMissions || [],
  };
}

async function refreshPlayerEconomy(uid, now = Timestamp.now()) {
  const profileRef = db.doc(`player_profiles/${uid}`);
  const day = getKstDay(now.toDate());
  const week = getKstWeek(now.toDate());
  const dailyRef = db.doc(`mission_progress/${uid}_daily_${day}`);
  const weeklyRef = db.doc(`mission_progress/${uid}_weekly_${week}`);
  const result = await db.runTransaction(async transaction => {
    const [profileSnapshot, dailySnapshot, weeklySnapshot] = await Promise.all([
      transaction.get(profileRef), transaction.get(dailyRef), transaction.get(weeklyRef),
    ]);
    const profile = profileSnapshot.data();
    const energy = refillEnergy(energyState(profile, now.toMillis()), now.toMillis());
    transaction.update(profileRef, energyUpdate(energy, now));
    return {
      profile:{...profile, rankedEnergy:energy.energy, energyUpdatedAt:Timestamp.fromMillis(energy.updatedAtMs)},
      energy:energy.energy,
      nextRefillAtMs:energy.nextRefillAtMs,
      dailyMissions:serializeMissions(
        dailySnapshot.exists ? dailySnapshot.data() : emptyMissionProgress(day, 'daily'), DAILY_MISSIONS,
      ),
      weeklyMissions:serializeMissions(
        weeklySnapshot.exists ? weeklySnapshot.data() : emptyMissionProgress(week, 'weekly'), WEEKLY_MISSIONS,
      ),
    };
  });
  return result;
}

function energyState(profile, nowMs) {
  return {
    energy:Number.isInteger(profile?.rankedEnergy) ? profile.rankedEnergy : ENERGY_MAX,
    updatedAtMs:profile?.energyUpdatedAt?.toMillis?.() || nowMs,
  };
}

function energyUpdate(energy, now) {
  return {
    rankedEnergy:energy.energy,
    energyUpdatedAt:Timestamp.fromMillis(energy.updatedAtMs),
    updatedAt:now,
  };
}

function missionProgressData(uid, progress, now) {
  const {reward:unusedReward, ...stored} = progress;
  return {...stored, uid, updatedAt:now};
}

async function verifyAdMobCallback(rawQuery) {
  const marker = '&signature=';
  const signatureIndex = rawQuery.indexOf(marker);
  if (signatureIndex < 1) return false;
  const content = rawQuery.slice(0, signatureIndex);
  const signed = rawQuery.slice(signatureIndex + marker.length);
  const keyMarker = '&key_id=';
  const keyIndex = signed.indexOf(keyMarker);
  if (keyIndex < 1) return false;
  const signature = decodeBase64Url(signed.slice(0, keyIndex));
  const keyId = signed.slice(keyIndex + keyMarker.length);
  const keys = await getAdMobKeys();
  const pem = keys.get(keyId);
  return Boolean(pem && verifySignature('sha256', Buffer.from(content, 'utf8'), pem, signature));
}

async function getAdMobKeys(now = Date.now()) {
  if (admobKeysCache.expiresAt > now) return admobKeysCache.keys;
  const response = await fetch(ADMOB_KEYS_URL);
  if (!response.ok) throw new Error('admob-key-fetch-failed');
  const data = await response.json();
  const keys = new Map((data.keys || []).map(key => [String(key.keyId), key.pem]));
  if (!keys.size) throw new Error('admob-keys-empty');
  admobKeysCache = {expiresAt:now + 24 * 60 * 60 * 1000, keys};
  return keys;
}

function decodeBase64Url(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='), 'base64');
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
    for (const platform of ['app']) {
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

function safeAppPlatform(appId) {
  const configuredAppIds = String(process.env.NATIVE_APP_IDS || '').split(',').filter(Boolean);
  const nativeAppIds = ['1:138832269891:android:680c90029271687eadbaf6', ...configuredAppIds];
  try { return platformForAppId(appId, nativeAppIds); }
  catch (error) {
    if (error?.message === 'web-ranking-disabled') {
      throw new HttpsError('failed-precondition', '랭킹 도전은 앱에서만 이용할 수 있습니다.');
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
