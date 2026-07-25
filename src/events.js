const VECTORS = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
};

export const ARROW_DIRECTIONS = Object.freeze(Object.keys(VECTORS));

export function createSpecialRewardQueue() {
  return { bomb: false, arrow: false };
}

export function earnSpecialRewards(rewards, groups, chain) {
  return {
    bomb: rewards.bomb || groups.some(group => group.length >= 9),
    arrow: rewards.arrow || chain >= 2,
  };
}

export function attachQueuedSpecial(piece, rewards, random = Math.random) {
  const type = rewards.bomb ? 'bomb' : rewards.arrow ? 'arrow' : null;
  if (!type || !piece?.cells?.length) return { piece, rewards };
  const cellIndex = Math.floor(random() * piece.cells.length);
  const event = type === 'bomb'
    ? 'bomb'
    : ARROW_DIRECTIONS[Math.floor(random() * ARROW_DIRECTIONS.length)];
  const cells = piece.cells.map((cell, index) => (
    index === cellIndex ? { ...cell, event } : cell
  ));
  return {
    piece: { ...piece, cells },
    rewards: { ...rewards, [type]: false },
  };
}

export function resolveSpecialEffects(initialKeys, board, eventBoard) {
  const rows = board.length;
  const cols = board[0]?.length || 0;
  const removed = new Set(initialKeys);
  const pending = [...removed].map(key => ({key, depth:0}));
  const activated = new Set();
  const beams = [];
  const bombs = [];

  while (pending.length) {
    const {key, depth} = pending.shift();
    if (activated.has(key)) continue;
    const [x, y] = key.split(',').map(Number);
    const special = eventBoard[y]?.[x];
    if (!special) continue;
    const isBomb = special === 'bomb';
    if (!isBomb && !VECTORS[special]) continue;
    activated.add(key);
    const cells = [];
    const targets = isBomb
      ? Array.from({length:9}, (_, index) => [
          x + (index % 3) - 1,
          y + Math.floor(index / 3) - 1,
        ])
      : arrowTargets(x, y, special, rows, cols);
    for (const [nx, ny] of targets) {
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const target = `${nx},${ny}`;
      cells.push(target);
      if (board[ny][nx] === null) continue;
      if (!removed.has(target)) {
        removed.add(target);
        pending.push({key:target, depth:depth + 1});
      }
    }
    const delay = Math.min(depth * 100, 400);
    if (isBomb) bombs.push({origin:key, cells, delay});
    else beams.push({origin:key, direction:special, cells, delay});
  }

  return {removed, beams, bombs};
}

function arrowTargets(x, y, direction, rows, cols) {
  const [dx, dy] = VECTORS[direction];
  const targetX = x + dx;
  const targetY = y + dy;
  return dx === 0
    ? Array.from({length:cols}, (_, nx) => [nx, targetY])
    : Array.from({length:rows}, (_, ny) => [targetX, ny]);
}

export function resolveArrowEffects(initialKeys, board, eventBoard) {
  const result = resolveSpecialEffects(initialKeys, board, eventBoard);
  return { removed: result.removed, beams: result.beams };
}

export function expandArrowClears(initialKeys, board, eventBoard) {
  return resolveArrowEffects(initialKeys, board, eventBoard).removed;
}
