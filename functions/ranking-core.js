import { replayRankedPlacements } from './shared/ranked-replay.js';
import { RULE_VERSION } from './shared/ranked-protocol.js';

export { RULE_VERSION } from './shared/ranked-protocol.js';
export const DAILY_ATTEMPT_LIMIT = 3;
export const RUN_TTL_MS = 24 * 60 * 60 * 1000;
const CHAIN_MULTIPLIERS = [1, 1.8, 3, 4.8, 7];
const SCORE_MULTIPLIERS = new Set([1, 2, 3, 4, 6]);
export const WEB_APP_ID = '1:138832269891:web:f0236e6bc1a25972adbaf6';

export function getKstDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit',
  }).format(date);
}

export function getKstSeason(date = new Date()) {
  return getKstDay(date).slice(0, 7);
}

export function platformForAppId(appId, mobileAppIds = []) {
  if (appId === WEB_APP_ID) return 'desktop';
  if (mobileAppIds.includes(appId)) return 'mobile';
  throw new Error('unknown-app');
}

export function calculateLedgerScore(ledger) {
  let clearScore = 0;
  for (const step of ledger.clearSteps) {
    const chainMultiplier = CHAIN_MULTIPLIERS[Math.min(step.chain, 5) - 1];
    clearScore += Math.round(step.removedCells * 10 * chainMultiplier * step.scoreMultiplier);
  }
  return clearScore + ledger.dropPoints;
}

export function validateLedger(ledger, run, now = Date.now()) {
  if (!ledger || ledger.ruleVersion !== RULE_VERSION) throw new Error('invalid-rule-version');
  if (ledger.platform !== run.platform || ledger.season !== run.season) throw new Error('run-mismatch');
  if (!integer(ledger.playTimeMs, 1_000, RUN_TTL_MS)) throw new Error('invalid-play-time');
  if (!integer(ledger.piecesPlaced, 1, 2_000)) throw new Error('invalid-piece-count');
  if (!integer(ledger.dropPoints, 0, ledger.piecesPlaced * 60)) throw new Error('invalid-drop-points');
  if (!Array.isArray(ledger.clearSteps) || ledger.clearSteps.length > 2_000) throw new Error('invalid-clear-steps');
  const terminalPlacement = ledger.placementLog?.at(-1)?.terminal === true ? 1 : 0;
  if (!Array.isArray(ledger.placementLog)
    || ledger.placementLog.length !== ledger.piecesPlaced + terminalPlacement) {
    throw new Error('invalid-placement-log');
  }
  if (ledger.randomVersion !== run.randomVersion || ledger.dropPoints !== 0) throw new Error('run-mismatch');
  if (now - run.createdAtMs < ledger.playTimeMs * .75) throw new Error('impossible-play-time');
  let removedCells = 0;
  let directClears = 0;
  let maxChain = 0;
  let multiplierCells = 0;
  for (const step of ledger.clearSteps) {
    if (!integer(step.removedCells, 6, 200)
      || !integer(step.directCells, 6, step.removedCells)
      || !integer(step.chain, 1, 100)
      || !SCORE_MULTIPLIERS.has(step.scoreMultiplier)
      || !integer(step.multiplierCells, 0, 3)) throw new Error('invalid-clear-step');
    removedCells += step.removedCells;
    directClears += step.directCells;
    maxChain = Math.max(maxChain, step.chain);
    multiplierCells += step.multiplierCells;
  }

  const score = calculateLedgerScore(ledger);
  const level = 1 + Math.floor(removedCells / 15);
  if (ledger.score !== score || ledger.level !== level) throw new Error('score-mismatch');
  if (ledger.maxChain !== maxChain || ledger.directClears !== directClears) throw new Error('stats-mismatch');
  if (ledger.specialClears !== removedCells - directClears || ledger.multiplierCells !== multiplierCells) {
    throw new Error('stats-mismatch');
  }
  return {...ledger, score, level, removedCells};
}

export function validateReplay(ledger, run) {
  const replay = replayRankedPlacements(run.seed, ledger.placementLog, run.randomVersion);
  for (const key of [
    'score', 'level', 'piecesPlaced', 'directClears', 'specialClears',
    'maxChain', 'reactorCount', 'multiplierCells',
  ]) {
    if (ledger[key] !== replay[key]) throw new Error('replay-mismatch');
  }
  if (JSON.stringify(ledger.clearSteps) !== JSON.stringify(replay.clearSteps)) throw new Error('replay-mismatch');
  return replay;
}

export function shouldReplaceBest(previous, candidate) {
  if (!previous) return true;
  if (candidate.score !== previous.score) return candidate.score > previous.score;
  if (candidate.level !== previous.level) return candidate.level > previous.level;
  return candidate.achievedAtMs < previous.achievedAtMs;
}

function integer(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}
