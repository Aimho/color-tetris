import { getKstDay } from './game-session.js';

export { getKstDay } from './game-session.js';

export const PROFILE_KEY = 'color-tetrix-profile-v1';
export const REACTOR_MAX = 100;

export function getReactorChargeRate(level) {
  const normalized = Math.min(1, (Math.max(1, level) - 1) / 19);
  return Math.round((1 - normalized * .55) * 100) / 100;
}

export function getKstWeek(date = new Date()) {
  const day = getKstDay(date);
  const utc = new Date(`${day}T00:00:00Z`);
  const weekday = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - weekday);
  return getKstDay(utc);
}

export function defaultProfile() {
  return {
    games:0,
    bestScore:0,
    bestLevel:1,
    totalClears:0,
    bombsEarned:0,
    reactorUses:0,
    bestChain:0,
    bestChainPower:0,
    theme:'default',
    lastSyncedAt:0,
  };
}

export function readProfile(storage = globalThis.localStorage) {
  try { return { ...defaultProfile(), ...JSON.parse(storage.getItem(PROFILE_KEY) || '{}') }; }
  catch { return defaultProfile(); }
}

export function finishRun(profile, {
  score = 0,
  level,
  clears,
  bombsEarned = 0,
  reactorUses = 0,
  maxChain,
  maxChainPower = 0,
}) {
  return {
    ...profile,
    games: profile.games + 1,
    bestScore:Math.max(profile.bestScore, score),
    bestLevel: Math.max(profile.bestLevel, level),
    totalClears: profile.totalClears + clears,
    bombsEarned:profile.bombsEarned + bombsEarned,
    reactorUses:profile.reactorUses + reactorUses,
    bestChain: Math.max(profile.bestChain, maxChain),
    bestChainPower:Math.max(profile.bestChainPower, maxChainPower),
  };
}

export function unlockedThemes(profile) {
  return [
    { id: 'default', label: '기본', caption: 'COLOR BOMB 오리지널' },
    { id: 'pixel', label: '픽셀', caption: '8-BIT 아케이드' },
    { id: 'neon', label: '네온', caption: '에너지 글로우' },
  ];
}

export function normalizeTheme(theme) {
  return ['default', 'pixel', 'neon'].includes(theme) ? theme : 'default';
}

export function chargeReactor(current, removedCount, chain, level = 1) {
  const earned = (removedCount * 1.5 + Math.max(0, chain - 1) * 2) * getReactorChargeRate(level);
  return Math.min(REACTOR_MAX, current + Math.round(earned));
}
