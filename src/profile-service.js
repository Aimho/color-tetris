import { signOut } from 'firebase/auth';
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
const claimAttendance = httpsCallable(functions, 'claimDailyAttendance', {limitedUseAppCheckTokens:true});

export async function claimPlayerAttendance() {
  if (!appCheck) throw new Error('출석 서버 보호 설정이 필요합니다.');
  await ensureAuthUser();
  const result = await claimAttendance();
  return enrichProfile(result.data);
}
const prepareAccountDeletion = httpsCallable(functions, 'preparePlayerAccountDeletion', {limitedUseAppCheckTokens:true});
const requestAccountDeletion = httpsCallable(functions, 'requestPlayerAccountDeletion', {limitedUseAppCheckTokens:true});

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

export async function preparePlayerAccountDeletion() {
  if (!appCheck) throw new Error('계정 삭제 서버 보호 설정이 필요합니다.');
  await ensureAuthUser();
  const result = await prepareAccountDeletion();
  if (!result.data?.challenge) throw new Error('계정 삭제 확인을 시작하지 못했습니다.');
  return result.data.challenge;
}

export async function requestPlayerAccountDeletion(challenge) {
  if (!appCheck) throw new Error('계정 삭제 서버 보호 설정이 필요합니다.');
  const result = await requestAccountDeletion({challenge});
  if (!result.data?.accepted) throw new Error('계정 삭제 요청을 접수하지 못했습니다.');
  await signOut(auth).catch(() => {});
  return true;
}

function enrichProfile(profile) {
  return {...profile, connected:isSocialAccountConnected(), provider:providerLabel()};
}


function providerLabel() {
  const providerIds = auth.currentUser?.providerData?.map(provider => provider.providerId) || [];
  return providerIds.includes('google.com') ? 'Google 연결됨' : '게스트 플레이';
}
