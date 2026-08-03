import { httpsCallable, getFunctions } from 'firebase/functions';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  GoogleAuthProvider,
  linkWithCredential,
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
const getEnergy = httpsCallable(functions, 'getRankedEnergy', {limitedUseAppCheckTokens:true});

export function isSocialAccountConnected() {
  return Boolean(auth.currentUser?.providerData?.some(provider => provider.providerId !== 'anonymous'));
}

export async function rankedServiceStatus() {
  await ensureAuthUser();
  if (!appCheck) return {ready:false, reason:'랭킹 서버 보호 설정이 필요합니다.'};
  await flushPendingRankedRun().catch(() => {});
  const result = await getEnergy();
  return {
    ready:result.data.balance > 0,
    reason:result.data.balance > 0
      ? '익명 플레이어 ID로 랭킹에 참여합니다.'
      : '에너지가 충전 중입니다.',
    energy:result.data,
  };
}

export async function connectGoogleAccount() {
  await auth.authStateReady();
  if (isSocialAccountConnected()) return auth.currentUser;
  if (Capacitor.getPlatform() === 'android') return connectNativeGoogleAccount();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  if (!auth.currentUser?.isAnonymous) return (await signInWithPopup(auth, provider)).user;
  try {
    return (await linkWithPopup(auth.currentUser, provider)).user;
  } catch (error) {
    if (error?.code === 'auth/credential-already-in-use') throw accountAlreadyConnectedError();
    throw error;
  }
}

async function connectNativeGoogleAccount() {
  const result = await FirebaseAuthentication.signInWithGoogle({skipNativeAuth:true});
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error('Google 계정 인증 정보를 받지 못했습니다.');
  const credential = GoogleAuthProvider.credential(idToken);
  if (!auth.currentUser?.isAnonymous) {
    return (await signInWithCredential(auth, credential)).user;
  }
  try {
    return (await linkWithCredential(auth.currentUser, credential)).user;
  } catch (error) {
    if (error?.code === 'auth/credential-already-in-use') throw accountAlreadyConnectedError();
    throw error;
  }
}

function accountAlreadyConnectedError() {
  const error = new Error('이미 다른 플레이어에 연결된 Google 계정입니다. 현재 랭킹 데이터를 보호하기 위해 계정을 전환하지 않았습니다.');
  error.code = 'auth/credential-already-in-use';
  return error;
}

export async function startRankedRun(options = {}) {
  const {requestId = crypto.randomUUID()} = typeof options === 'string'
    ? {requestId:options}
    : options;
  if (!appCheck) throw new Error('랭킹 서버 보호 설정이 필요합니다.');
  await ensureAuthUser();
  const result = await startRun({requestId});
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
