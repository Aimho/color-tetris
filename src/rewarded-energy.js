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
const TEST_REWARDED_AD_ID = 'ca-app-pub-3940256099942544/5224354917';
const PENDING_REWARD_KEY = 'color-bomb:rewarded-energy-pending';
let initialized = false;

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
  return AdMob;
}

export async function showRewardedEnergyAd() {
  if (!appCheck) throw new Error('광고 보상 서버 보호 설정이 필요합니다.');
  await ensureAuthUser();
  const request = (await createRewardRequest()).data;
  const stored = readPendingReward();
  if (request.shown || stored?.requestId === request.requestId) return request;
  const AdMob = await getAdMob();
  const adId = import.meta.env.DEV ? TEST_REWARDED_AD_ID : import.meta.env.VITE_ADMOB_REWARDED_AD_UNIT_ID;
  if (!adId) throw new Error('보상형 광고 단위가 설정되지 않았습니다.');
  await AdMob.prepareRewardVideoAd({
    adId,
    isTesting:import.meta.env.DEV,
    immersiveMode:true,
    ssv:{userId:request.userId, customData:request.requestId},
  });
  await markRewardRequestShown({requestId:request.requestId});
  rememberPendingReward(request);
  try {
    await AdMob.showRewardVideoAd();
  } catch (error) {
    await cancelRewardRequest({requestId:request.requestId}).catch(() => {});
    forgetPendingReward();
    throw error;
  }
  return request;
}

export async function getRewardedEnergyStatus(requestId) {
  if (!appCheck) throw new Error('광고 보상 서버 보호 설정이 필요합니다.');
  await ensureAuthUser();
  const status = (await getRewardRequestStatus({requestId})).data;
  if (status.status !== 'pending') forgetPendingReward();
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
    }));
  } catch { /* 서버 shown 상태가 재생 중복을 계속 방지합니다. */ }
}

function forgetPendingReward() {
  try { localStorage.removeItem(PENDING_REWARD_KEY); } catch { /* best effort */ }
}

export async function showPrivacyOptions() {
  const AdMob = await getAdMob();
  await AdMob.showPrivacyOptionsForm();
}
