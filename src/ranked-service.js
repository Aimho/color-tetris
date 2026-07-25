import { httpsCallable, getFunctions } from 'firebase/functions';
import {
  GoogleAuthProvider,
  linkWithPopup,
  signInWithCredential,
  signInWithPopup,
} from 'firebase/auth';
import { app, appCheck, auth } from './firebase-client.js';

const functions = getFunctions(app, 'asia-northeast3');
const startRun = httpsCallable(functions, 'startRankedRun', {limitedUseAppCheckTokens:true});
const submitRun = httpsCallable(functions, 'submitRankedRun', {limitedUseAppCheckTokens:true});

export function isRankedAccountReady() {
  const provider = auth.currentUser?.providerData?.[0]?.providerId;
  return Boolean(auth.currentUser && provider && provider !== 'anonymous');
}

export function isRankedServiceReady() {
  return Boolean(appCheck && isRankedAccountReady());
}

export async function rankedServiceStatus() {
  await auth.authStateReady();
  if (!appCheck) return {ready:false, reason:'랭킹 서버 보호 설정이 필요합니다.'};
  if (!isRankedAccountReady()) return {ready:true, reason:'시작할 때 Google 계정을 연결합니다.'};
  return {ready:true, reason:'Google 계정으로 랭킹에 참여합니다.'};
}

export async function ensureRankedAccount() {
  await auth.authStateReady();
  if (isRankedAccountReady()) return auth.currentUser;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  if (!auth.currentUser?.isAnonymous) return (await signInWithPopup(auth, provider)).user;
  try {
    return (await linkWithPopup(auth.currentUser, provider)).user;
  } catch (error) {
    const credential = GoogleAuthProvider.credentialFromError(error);
    if (error?.code === 'auth/credential-already-in-use' && credential) {
      return (await signInWithCredential(auth, credential)).user;
    }
    throw error;
  }
}

export async function startRankedRun(requestId = crypto.randomUUID()) {
  if (!appCheck) throw new Error('랭킹 서버 보호 설정이 필요합니다.');
  await ensureRankedAccount();
  const result = await startRun({requestId});
  return result.data;
}

export async function submitRankedRun(runId, name, ledger) {
  if (!isRankedAccountReady()) throw new Error('랭킹 도전은 소셜 계정 연결이 필요합니다.');
  const result = await submitRun({runId, name, ledger});
  return result.data;
}
