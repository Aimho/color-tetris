const CODE_ACTIONS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotate',
  KeyW: 'rotate', KeyX: 'rotate', KeyZ: 'rotate', Space: 'drop',
  ShiftLeft: 'hold', ShiftRight: 'hold', KeyC: 'hold', ArrowDown: 'down',
};

const KEY_ACTIONS = {
  arrowleft: 'left', arrowright: 'right', arrowup: 'rotate',
  w: 'rotate', x: 'rotate', z: 'rotate', ' ': 'drop',
  shift: 'hold', c: 'hold', arrowdown: 'down',
};

export function actionForKey({ code, key }) {
  return CODE_ACTIONS[code] ?? KEY_ACTIONS[key?.toLowerCase?.()] ?? null;
}

export function dragStepTarget(distance, cellSize, threshold = .72) {
  if (!Number.isFinite(distance) || !Number.isFinite(cellSize) || cellSize <= 0) return 0;
  const magnitude = Math.abs(distance);
  if (magnitude < cellSize * threshold) return 0;
  const steps = 1 + Math.floor((magnitude - cellSize * threshold) / cellSize);
  return Math.sign(distance) * steps;
}
