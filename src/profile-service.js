import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, appCheck, auth, ensureAuthUser } from './firebase-client.js';
import { connectGoogleAccount, isSocialAccountConnected } from './ranked-service.js';
export { formatSeasonBadge } from '../functions/shared/season-badges.js';

const functions = getFunctions(app, 'asia-northeast3');
const getOrCreateProfile = httpsCallable(functions, 'getOrCreatePlayerProfile', {
  limitedUseAppCheckTokens:true,
});
const updateNickname = httpsCallable(functions, 'updatePlayerNickname', {
  limitedUseAppCheckTokens:true,
});
const purchaseItem = httpsCallable(functions, 'purchaseShopItem', {limitedUseAppCheckTokens:true});
const equipItem = httpsCallable(functions, 'equipShopItem', {limitedUseAppCheckTokens:true});

export async function loadPlayerProfile() {
  if (!appCheck) throw new Error('프로필 서버 보호 설정이 필요합니다.');
  await ensureAuthUser();
  const result = await getOrCreateProfile();
  return enrichProfile(result.data);
}

export async function changePlayerNickname(nickname) {
  if (!appCheck) throw new Error('프로필 서버 보호 설정이 필요합니다.');
  await ensureAuthUser();
  const result = await updateNickname({nickname});
  return enrichProfile(result.data);
}

export async function connectPlayerGoogleAccount() {
  await ensureAuthUser();
  await connectGoogleAccount();
  return loadPlayerProfile();
}

export async function purchasePlayerItem(itemId) {
  if (!appCheck) throw new Error('상점 서버 보호 설정이 필요합니다.');
  await ensureAuthUser();
  await purchaseItem({itemId});
  return loadPlayerProfile();
}

export async function equipPlayerItem(itemId) {
  if (!appCheck) throw new Error('상점 서버 보호 설정이 필요합니다.');
  await ensureAuthUser();
  await equipItem({itemId});
  return loadPlayerProfile();
}

function enrichProfile(profile) {
  return {...profile, connected:isSocialAccountConnected(), provider:providerLabel()};
}


function providerLabel() {
  const providerIds = auth.currentUser?.providerData?.map(provider => provider.providerId) || [];
  return providerIds.includes('google.com') ? 'Google 연결됨' : '게스트 플레이';
}
