import { httpsCallable, getFunctions } from 'firebase/functions';
import {
  GoogleAuthProvider,
  linkWithPopup,
  signInWithCredential,
  signInWithPopup,
} from 'firebase/auth';
import { app, appCheck, auth, ensureAuthUser } from './firebase-client.js';
import {
  clearPendingRankedRun,
  isRetryableRankedError,
  readPendingRankedRun,
  rememberPendingRankedRun,
} from './pending-ranked.js';

const functions = getFunctions(app, 'asia-northeast3');
const startRun = httpsCallable(functions, 'startRankedRun', {limitedUseAppCheckTokens:true});
const submitRun = httpsCallable(functions, 'submitRankedRun', {limitedUseAppCheckTokens:true});

export function isSocialAccountConnected() {
  return Boolean(auth.currentUser?.providerData?.some(provider => provider.providerId !== 'anonymous'));
}

export async function rankedServiceStatus() {
  await ensureAuthUser();
  if (!appCheck) return {ready:false, reason:'랭킹 서버 보호 설정이 필요합니다.'};
  await flushPendingRankedRun().catch(() => {});
  return {ready:true, reason:'익명 플레이어 ID로 랭킹에 참여합니다.'};
}

export async function connectGoogleAccount() {
  await auth.authStateReady();
  if (isSocialAccountConnected()) return auth.currentUser;
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

export async function startRankedRun(options = {}) {
  const {platform, requestId = crypto.randomUUID()} = typeof options === 'string'
    ? {requestId:options}
    : options;
  if (!appCheck) throw new Error('랭킹 서버 보호 설정이 필요합니다.');
  await ensureAuthUser();
  const result = await startRun({requestId, platform});
  return result.data;
}

export async function submitRankedRun(runId, ledger) {
  rememberPendingRankedRun({runId, ledger});
  try {
    await ensureAuthUser();
    const result = await submitRun({runId, ledger});
    clearPendingRankedRun(runId);
    return result.data;
  } catch (error) {
    if (!isRetryableRankedError(error)) clearPendingRankedRun(runId);
    throw error;
  }
}

export async function flushPendingRankedRun(storage = globalThis.localStorage) {
  const pending = readPendingRankedRun(storage);
  if (!pending) return null;
  const result = await submitRankedRun(pending.runId, pending.ledger);
  clearPendingRankedRun(pending.runId, storage);
  return result;
}
