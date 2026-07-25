export function getDropInterval(level) {
  const safeLevel = Math.max(1, level);
  return Math.round(120 + 480 * Math.exp(-(safeLevel - 1) / 11));
}

export function getLockDelay() {
  return 500;
}

export function canResetLock(isGrounded, resetCount) {
  return isGrounded && resetCount < MAX_LOCK_RESETS;
}

export function getLevelForClears(clearedCells) {
  return 1 + Math.floor(Math.max(0, clearedCells) / 15);
}

export function getClearIntensity(removedCount) {
  if (removedCount >= 14) return { name: 'overload', shardsPerCell: 10, shake: 12 };
  if (removedCount >= 9) return { name: 'surge', shardsPerCell: 7, shake: 7 };
  return { name: 'clear', shardsPerCell: 5, shake: 3 };
}

export function getChainMultiplier(chain) {
  return [1, 1.8, 3, 4.8, 7][Math.min(Math.max(1, chain) - 1, 4)];
}

export function getClearScore(removedCount, chain, specialMultiplier = 1) {
  return Math.round(removedCount * 10 * getChainMultiplier(chain) * Math.min(6, Math.max(1, specialMultiplier)));
}
export const MAX_LOCK_RESETS = 15;
