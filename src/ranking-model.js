import { getKstDay, getKstSeason } from './game-session.js';
import { RULE_VERSION } from './rule-version.js';

export const DAILY_RANKED_ATTEMPTS = null;

// Display-only estimate. The server transaction owns the actual reservation.
export function remainingRankedAttempts(usage, date = new Date(), limit = DAILY_RANKED_ATTEMPTS) {
  const day = getKstDay(date);
  const used = usage?.day === day && Number.isInteger(usage.used) ? usage.used : 0;
  const normalizedUsed = Math.max(0, used);
  return {
    day,
    used:limit === null ? normalizedUsed : Math.min(limit, normalizedUsed),
    remaining:limit === null ? null : Math.max(0, limit - used),
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
  ruleVersion = RULE_VERSION,
  piecesPlaced = 0,
  dropPoints = 0,
  clearSteps = [],
  placementLog = [],
  randomVersion = null,
  season = null,
  date = new Date(),
}) {
  return {
    mode,
    platform,
    season:season || getKstSeason(date),
    score:Math.max(0, Math.round(score)),
    level:Math.max(1, Math.round(level)),
    playTimeMs:Math.max(0, Math.round(playTimeMs)),
    directClears:Math.max(0, Math.round(directClears)),
    specialClears:Math.max(0, Math.round(specialClears)),
    maxChain:Math.max(0, Math.round(maxChain)),
    reactorCount:Math.max(0, Math.round(reactorCount)),
    multiplierCells:Math.max(0, Math.round(multiplierCells)),
    ruleVersion,
    piecesPlaced:Math.max(0, Math.round(piecesPlaced)),
    dropPoints:Math.max(0, Math.round(dropPoints)),
    clearSteps:clearSteps.map(step => ({...step})),
    placementLog:placementLog.map(entry => ({...entry})),
    randomVersion:Number.isInteger(randomVersion) ? randomVersion : null,
  };
}

function toMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const numeric = new Date(value).getTime();
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
}
