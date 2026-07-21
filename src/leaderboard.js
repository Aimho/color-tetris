const SCORE_KEY = 'color-bomb-scores-v1';
const MAX_SCORES = 50;

export function normalizePlayerName(value) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 12);
}

function readScores(storage) {
  try {
    const value = JSON.parse(storage.getItem(SCORE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function submitScore(name, score, level, storage = globalThis.localStorage) {
  const normalizedName = normalizePlayerName(name);
  if (!normalizedName) throw new Error('이름을 입력해주세요.');
  const entry = {
    name: normalizedName,
    score: Math.max(0, Math.round(Number(score) || 0)),
    level: Math.max(1, Math.round(Number(level) || 1)),
    createdAt: Date.now(),
  };
  const entries = [...readScores(storage), entry]
    .sort((a, b) => b.score - a.score || a.createdAt - b.createdAt)
    .slice(0, MAX_SCORES);
  storage.setItem(SCORE_KEY, JSON.stringify(entries));
  return normalizedName;
}

export async function loadTopScores(storage = globalThis.localStorage) {
  return readScores(storage)
    .filter(entry => entry && typeof entry.name === 'string' && Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score || a.createdAt - b.createdAt)
    .slice(0, MAX_SCORES);
}
