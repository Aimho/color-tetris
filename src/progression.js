export const PROFILE_KEY = 'color-tetrix-profile-v1';
export const REACTOR_MAX = 100;

export function getReactorChargeRate(level) {
  const normalized = Math.min(1, (Math.max(1, level) - 1) / 19);
  return Math.round((1 - normalized * .55) * 100) / 100;
}

export function getKstDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function getKstWeek(date = new Date()) {
  const day = getKstDay(date);
  const utc = new Date(`${day}T00:00:00Z`);
  const weekday = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - weekday);
  return getKstDay(utc);
}

export function defaultProfile() {
  return { games: 0, bestLevel: 1, totalClears: 0, bestChain: 0, theme: 'reactor' };
}

export function readProfile(storage = globalThis.localStorage) {
  try { return { ...defaultProfile(), ...JSON.parse(storage.getItem(PROFILE_KEY) || '{}') }; }
  catch { return defaultProfile(); }
}

export function finishRun(profile, { level, clears, maxChain }) {
  return {
    ...profile,
    games: profile.games + 1,
    bestLevel: Math.max(profile.bestLevel, level),
    totalClears: profile.totalClears + clears,
    bestChain: Math.max(profile.bestChain, maxChain),
  };
}

export function unlockedThemes(profile) {
  return [
    { id: 'reactor', label: 'REACTOR', unlocked: true },
    { id: 'ember', label: 'EMBER', unlocked: profile.totalClears >= 500 },
    { id: 'aurora', label: 'AURORA', unlocked: profile.totalClears >= 2000 },
  ].filter(theme => theme.unlocked);
}

export function getPace(profile) {
  if (profile.bestLevel >= 12) return { id: 3, label: 'EXPERT', multiplier: 1.2 };
  if (profile.bestLevel >= 6) return { id: 2, label: 'RAPID', multiplier: 1.1 };
  return { id: 1, label: 'STANDARD', multiplier: 1 };
}

export function chargeReactor(current, removedCount, chain, level = 1) {
  const earned = (removedCount * 1.5 + Math.max(0, chain - 1) * 2) * getReactorChargeRate(level);
  return Math.min(REACTOR_MAX, current + Math.round(earned));
}
