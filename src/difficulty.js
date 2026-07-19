export function getDropInterval(level) {
  const normalized = Math.min(1, (Math.max(1, level) - 1) / 19);
  return Math.max(55, Math.round(600 - 545 * normalized ** 1.22));
}

export function getLockDelay(level) {
  const normalized = Math.min(1, (Math.max(1, level) - 1) / 19);
  return Math.max(170, Math.round(380 - 210 * normalized));
}

export function getLevelForClears(clearedCells) {
  return Math.min(20, 1 + Math.floor(Math.max(0, clearedCells) / 30));
}

export function getClearIntensity(removedCount) {
  if (removedCount >= 14) return { name: 'overload', shardsPerCell: 10, shake: 12 };
  if (removedCount >= 9) return { name: 'surge', shardsPerCell: 7, shake: 7 };
  return { name: 'clear', shardsPerCell: 5, shake: 3 };
}
