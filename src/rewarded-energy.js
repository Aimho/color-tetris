import { httpsCallable, getFunctions } from 'firebase/functions';
import { app, appCheck, ensureAuthUser } from './firebase-client.js';

const functions = getFunctions(app, 'asia-northeast3');
const createRewardRequest = httpsCallable(functions, 'createRewardedEnergyRequest', {
  limitedUseAppCheckTokens:true,
});
const getRewardRequestStatus = httpsCallable(functions, 'getRewardedEnergyRequestStatus', {
  limitedUseAppCheckTokens:true,
});
const markRewardRequestShown = httpsCallable(functions, 'markRewardedEnergyRequestShown', {
  limitedUseAppCheckTokens:true,
});
const cancelRewardRequest = httpsCallable(functions, 'cancelRewardedEnergyRequest', {
  limitedUseAppCheckTokens:true,
});
const completeRewardRequest = httpsCallable(functions, 'completeRewardedEnergyRequest', {
  limitedUseAppCheckTokens:true,
});
const TEST_REWARDED_AD_ID = 'ca-app-pub-3940256099942544/5224354917';
const PENDING_REWARD_KEY = 'color-bomb:rewarded-energy-pending';
let initialized = false;
let preparedReward = null;
let preparingReward = null;

function isNativeAndroid() {
  return globalThis.Capacitor?.getPlatform?.() === 'android';
}

export function rewardedEnergyAvailable() {
  return isNativeAndroid() && Boolean(import.meta.env.DEV || import.meta.env.VITE_ADMOB_REWARDED_AD_UNIT_ID);
}

async function getAdMob() {
  if (!isNativeAndroid()) throw new Error('보상형 광고는 Android 앱에서만 이용할 수 있습니다.');
  const {AdMob} = await import('@capacitor-community/admob');
  if (!initialized) {
    await AdMob.initialize({initializeForTesting:import.meta.env.DEV});
    const consent = await AdMob.requestConsentInfo();
    if (consent.isConsentFormAvailable && !consent.canRequestAds) await AdMob.showConsentForm();
    initialized = true;
  }
  return { AdMob };
}

export async function prepareRewardedEnergyAd() {
  if (preparedReward && Number(preparedReward.expiresAt) > Date.now()) return preparedReward;
  if (preparingReward) return preparingReward;
  preparingReward = prepareRewardedEnergyAdRequest();
  try {
    const reward = await preparingReward;
    preparedReward = reward.awaitingVerification || reward.alreadyVerified ? null : reward;
    return reward;
  } finally {
    preparingReward = null;
  }
}

async function prepareRewardedEnergyAdRequest() {
  if (!appCheck) throw new Error('광고 보상 서버 보호 설정이 필요합니다.');
  await ensureAuthUser();
  const stored = readPendingReward();
  if (stored) {
    const status = await getRewardedEnergyStatus(stored.requestId);
    if (status.status === 'verified') return {...stored, alreadyVerified:true, granted:status.granted};
    if (status.status === 'shown' && stored.earned) {
      const completion = (await completeRewardRequest({requestId:stored.requestId})).data;
      forgetPendingReward();
      return {...stored, alreadyVerified:true, granted:completion.granted, profile:completion.profile};
    }
    if (status.status === 'shown') {
      await cancelRewardRequest({requestId:stored.requestId});
      forgetPendingReward();
    }
    if (status.status === 'pending') {
      await cancelRewardRequest({requestId:stored.requestId}).catch(() => {});
    }
    forgetPendingReward();
  }
  let request = (await createRewardRequest()).data;
  if (request.shown) {
    await cancelRewardRequest({requestId:request.requestId});
    request = (await createRewardRequest()).data;
  }
  const { AdMob } = await getAdMob();
  const adId = import.meta.env.DEV ? TEST_REWARDED_AD_ID : import.meta.env.VITE_ADMOB_REWARDED_AD_UNIT_ID;
  if (!adId) throw new Error('보상형 광고 단위가 설정되지 않았습니다.');
  await AdMob.prepareRewardVideoAd({
    adId,
    isTesting:import.meta.env.DEV,
    immersiveMode:true,
    ssv:{userId:request.userId, customData:request.requestId},
  });
  return request;
}

export async function showRewardedEnergyAd() {
  const request = await prepareRewardedEnergyAd();
  preparedReward = null;
  if (request.alreadyVerified || request.awaitingVerification) return request;
  const { AdMob } = await getAdMob();
  await markRewardRequestShown({requestId:request.requestId});
  rememberPendingReward(request);
  let dismissedListener;
  let failedListener;
  try {
    let resolveDismissed;
    let rejectDismissed;
    const dismissed = new Promise((resolve, reject) => {
      resolveDismissed = resolve;
      rejectDismissed = reject;
    });
    dismissedListener = await AdMob.addListener('onRewardedVideoAdDismissed', resolveDismissed);
    failedListener = await AdMob.addListener('onRewardedVideoAdFailedToShow', rejectDismissed);
    const rewarded = AdMob.showRewardVideoAd().then(reward => {
      // Persist the earned event before waiting for the app to return. If the
      // process is killed on the ad screen, the next launch restores the
      // energy without auto-starting a game.
      rememberPendingReward({...request, earned:true});
      return reward;
    });
    await Promise.all([rewarded, dismissed]);
    await waitForAppForeground();
  } catch (error) {
    await cancelRewardRequest({requestId:request.requestId}).catch(() => {});
    forgetPendingReward();
    throw error;
  } finally {
    await dismissedListener?.remove?.();
    await failedListener?.remove?.();
  }
  // The native SDK resolves only after it emits the earned-reward event. Grant
  // immediately here; SSV remains an idempotent audit/fallback callback.
  const completion = (await completeRewardRequest({requestId:request.requestId})).data;
  forgetPendingReward();
  return {...request, immediatelyVerified:true, granted:completion.granted, profile:completion.profile};
}

async function waitForAppForeground() {
  const { App: CapacitorApp } = await import('@capacitor/app');
  if ((await CapacitorApp.getState()).isActive) return;
  let listener;
  try {
    await new Promise((resolve, reject) => {
      CapacitorApp.addListener('appStateChange', state => {
        if (state.isActive) resolve();
      }).then(handle => { listener = handle; }, reject);
    });
  } finally {
    await listener?.remove?.();
  }
}

export async function getRewardedEnergyStatus(requestId) {
  if (!appCheck) throw new Error('광고 보상 서버 보호 설정이 필요합니다.');
  await ensureAuthUser();
  const status = (await getRewardRequestStatus({requestId})).data;
  if (!['pending', 'shown'].includes(status.status)) forgetPendingReward();
  return status;
}

function readPendingReward() {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_REWARD_KEY) || 'null');
    if (!pending?.requestId || Number(pending.expiresAt) <= Date.now()) {
      forgetPendingReward();
      return null;
    }
    return pending;
  } catch {
    forgetPendingReward();
    return null;
  }
}

function rememberPendingReward(request) {
  try {
    localStorage.setItem(PENDING_REWARD_KEY, JSON.stringify({
      requestId:request.requestId,
      expiresAt:Number(request.expiresAt) || 0,
      earned:Boolean(request.earned),
    }));
  } catch { /* 서버 shown 상태가 재생 중복을 계속 방지합니다. */ }
}

function forgetPendingReward() {
  try { localStorage.removeItem(PENDING_REWARD_KEY); } catch { /* best effort */ }
}

export async function showPrivacyOptions() {
  const { AdMob } = await getAdMob();
  await AdMob.showPrivacyOptionsForm();
}
