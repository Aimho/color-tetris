import { getKstDay, getKstSeason } from './game-session.js';

export const DAILY_RANKED_ATTEMPTS = 3;

// Display-only estimate. The server transaction owns the actual reservation.
export function remainingRankedAttempts(usage, date = new Date(), limit = DAILY_RANKED_ATTEMPTS) {
  const day = getKstDay(date);
  const used = usage?.day === day && Number.isInteger(usage.used) ? usage.used : 0;
  return {
    day,
    used:Math.min(limit, Math.max(0, used)),
    remaining:Math.max(0, limit - used),
  };
}

export function compareRankEntries(left, right) {
  return right.score - left.score
    || right.level - left.level
    || toMillis(left.achievedAt) - toMillis(right.achievedAt)
    || String(left.playerId ?? '').localeCompare(String(right.playerId ?? ''));
}

export function createScoreLedger({
  mode,
  platform,
  score,
  level,
  playTimeMs,
  directClears,
  specialClears,
  maxChain,
  reactorCount,
  multiplierCells,
  ruleVersion,
  date = new Date(),
}) {
  return {
    mode,
    platform,
    season:getKstSeason(date),
    score:Math.max(0, Math.round(score)),
    level:Math.max(1, Math.round(level)),
    playTimeMs:Math.max(0, Math.round(playTimeMs)),
    directClears:Math.max(0, Math.round(directClears)),
    specialClears:Math.max(0, Math.round(specialClears)),
    maxChain:Math.max(0, Math.round(maxChain)),
    reactorCount:Math.max(0, Math.round(reactorCount)),
    multiplierCells:Math.max(0, Math.round(multiplierCells)),
    ruleVersion,
  };
}

function toMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const numeric = new Date(value).getTime();
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
}
