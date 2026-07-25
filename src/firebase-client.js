import { getApp, getApps, initializeApp } from 'firebase/app';
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore/lite';

const config = {
  apiKey:'AIzaSyA_I9lW88ldisBstWrZ4rjCasSEgsC1QRg',
  authDomain:'color-tetrix-aimho.firebaseapp.com',
  projectId:'color-tetrix-aimho',
  storageBucket:'color-tetrix-aimho.firebasestorage.app',
  messagingSenderId:'138832269891',
  appId:'1:138832269891:web:f0236e6bc1a25972adbaf6',
};

export const app = getApps().length ? getApp() : initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app);
let authPromise;

export async function ensureAuthUser() {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  authPromise ||= signInAnonymously(auth).then(result => result.user).finally(() => {
    authPromise = undefined;
  });
  return authPromise;
}

const appCheckSiteKey = import.meta.env?.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
export const appCheck = appCheckSiteKey
  ? initializeAppCheck(app, {
      provider:new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled:true,
    })
  : null;
