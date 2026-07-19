export function getDropInterval(level) {
  return Math.max(70, Math.round(820 - (Math.max(1, level) - 1) * (750 / 19)));
}

export function getLockDelay(level) {
  return Math.max(220, Math.round(450 - (Math.max(1, level) - 1) * (230 / 19)));
}

export function getClearIntensity(removedCount) {
  if (removedCount >= 14) return { name: 'overload', shardsPerCell: 10, shake: 12 };
  if (removedCount >= 9) return { name: 'surge', shardsPerCell: 7, shake: 7 };
  return { name: 'clear', shardsPerCell: 5, shake: 3 };
}
