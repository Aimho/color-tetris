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
