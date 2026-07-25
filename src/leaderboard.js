import { signInAnonymously } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore/lite';
import { auth, db } from './firebase-client.js';
import { getKstSeason } from './game-session.js';
import { RULE_VERSION } from './rule-version.js';
const scores = collection(db, 'best_scores');
const PENDING_SCORE_KEY = 'color-bomb-pending-best-score-v1';
export const MAX_RECORDED_LEVEL = 999_999;
export { RULE_VERSION } from './rule-version.js';
let authPromise;

export function normalizePlayerName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 12);
}

export function normalizeScore(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.min(99_999_999, Math.round(numericValue)));
}

export function normalizeLevel(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 1;
  return Math.max(1, Math.min(MAX_RECORDED_LEVEL, Math.round(numericValue)));
}

export function shouldReplaceBestScore(previousScore, nextScore) {
  return !Number.isFinite(previousScore) || normalizeScore(nextScore) > previousScore;
}

export function selectPendingScore(previous, candidate) {
  if (!previous || shouldReplaceBestScore(previous.score, candidate.score)) return candidate;
  return previous;
}

function readPendingScore(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(PENDING_SCORE_KEY) || 'null');
    if (!value || typeof value.name !== 'string' || !Number.isFinite(value.score) || !Number.isFinite(value.level)) return null;
    const name = normalizePlayerName(value.name);
    if (!name) return null;
    return {
      name,
      score: normalizeScore(value.score),
      level: normalizeLevel(value.level),
      ruleVersion: Number.isInteger(value.ruleVersion) ? value.ruleVersion : RULE_VERSION,
    };
  } catch {
    return null;
  }
}

function rememberPendingScore(candidate, storage = globalThis.localStorage) {
  const pending = selectPendingScore(readPendingScore(storage), candidate);
  try { storage?.setItem(PENDING_SCORE_KEY, JSON.stringify(pending)); } catch { /* private mode */ }
  return pending;
}

function clearPendingScore(score, storage = globalThis.localStorage) {
  const pending = readPendingScore(storage);
  if (!pending || pending.score > score) return;
  try { storage?.removeItem(PENDING_SCORE_KEY); } catch { /* private mode */ }
}

async function currentUser() {
  if (auth.currentUser) return auth.currentUser;
  authPromise ||= signInAnonymously(auth).then(result => result.user).finally(() => {
    authPromise = undefined;
  });
  return authPromise;
}

async function writeBestScore(user, candidate) {
  const scoreRef = doc(scores, user.uid);
  let updated = false;

  await runTransaction(db, async transaction => {
    updated = false;
    const snapshot = await transaction.get(scoreRef);
    if (snapshot.exists() && !shouldReplaceBestScore(snapshot.data().score, candidate.score)) return;

    const timestamp = serverTimestamp();
    transaction.set(scoreRef, {
      ...candidate,
      createdAt: snapshot.exists() ? snapshot.data().createdAt : timestamp,
      updatedAt: timestamp,
    });
    updated = true;
  });

  return updated;
}

async function flushPendingScore(user) {
  const pending = readPendingScore();
  if (!pending) return false;
  const updated = await writeBestScore(user, pending);
  clearPendingScore(pending.score);
  return updated;
}

export async function submitScore(name, score, level) {
  const normalizedName = normalizePlayerName(name);
  if (!normalizedName) throw new Error('플레이어 이름을 입력해주세요.');

  const candidate = rememberPendingScore({
    name: normalizedName,
    score: normalizeScore(score),
    level: normalizeLevel(level),
    ruleVersion: RULE_VERSION,
  });

  try {
    const user = await currentUser();
    const updated = await writeBestScore(user, candidate);
    clearPendingScore(candidate.score);
    return { name: candidate.name, updated };
  } catch (cause) {
    throw new Error('오프라인입니다. 연결되면 최고 점수를 다시 기록합니다.', { cause });
  }
}

export async function loadTopScores(platform = 'desktop', season = getKstSeason()) {
  const user = await currentUser();
  const seasonScores = collection(db, `season_rankings/${season}_${platform}/scores`);
  const [snapshot, mySnapshot] = await Promise.all([
    getDocs(query(
      seasonScores,
      orderBy('score', 'desc'),
      orderBy('level', 'desc'),
      orderBy('achievedAt', 'asc'),
      limit(50),
    )),
    getDoc(doc(seasonScores, user.uid)),
  ]);
  return {
    entries:snapshot.docs.map(scoreDoc => ({playerId:scoreDoc.id, ...scoreDoc.data()})),
    myBest:mySnapshot.exists() ? {playerId:mySnapshot.id, ...mySnapshot.data()} : null,
    season,
    platform,
  };
}
