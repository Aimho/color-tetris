import { httpsCallable, getFunctions } from 'firebase/functions';
import { app, appCheck, ensureAuthUser } from './firebase-client.js';

const functions = getFunctions(app, 'asia-northeast3');
const createRewardRequest = httpsCallable(functions, 'createRewardedEnergyRequest', {
  limitedUseAppCheckTokens:true,
});
const TEST_REWARDED_AD_ID = 'ca-app-pub-3940256099942544/5224354917';
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
  const AdMob = await getAdMob();
  const adId = import.meta.env.DEV ? TEST_REWARDED_AD_ID : import.meta.env.VITE_ADMOB_REWARDED_AD_UNIT_ID;
  if (!adId) throw new Error('보상형 광고 단위가 설정되지 않았습니다.');
  await AdMob.prepareRewardVideoAd({
    adId,
    isTesting:import.meta.env.DEV,
    immersiveMode:true,
    ssv:{userId:request.userId, customData:request.requestId},
  });
  await AdMob.showRewardVideoAd();
  return request;
}

export async function showPrivacyOptions() {
  const AdMob = await getAdMob();
  await AdMob.showPrivacyOptionsForm();
}
