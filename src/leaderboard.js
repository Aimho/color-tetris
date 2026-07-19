import { initializeApp } from 'firebase/app';
import { addDoc, collection, getDocs, getFirestore, limit, orderBy, query, serverTimestamp } from 'firebase/firestore/lite';

const app = initializeApp({
  apiKey: 'AIzaSyA_I9lW88ldisBstWrZ4rjCasSEgsC1QRg',
  authDomain: 'color-tetrix-aimho.firebaseapp.com',
  projectId: 'color-tetrix-aimho',
  storageBucket: 'color-tetrix-aimho.firebasestorage.app',
  messagingSenderId: '138832269891',
  appId: '1:138832269891:web:f0236e6bc1a25972adbaf6',
});

const db = getFirestore(app);
const scores = collection(db, 'scores');

export function normalizePlayerName(value) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 12);
}

export async function submitScore(name, score, level) {
  const normalizedName = normalizePlayerName(name);
  if (!normalizedName) throw new Error('이름을 입력해주세요.');
  await addDoc(scores, { name: normalizedName, score, level, createdAt: serverTimestamp() });
  return normalizedName;
}

export async function loadTopScores() {
  const snapshot = await getDocs(query(scores, orderBy('score', 'desc'), orderBy('createdAt', 'asc'), limit(50)));
  return snapshot.docs.map(doc => doc.data());
}
