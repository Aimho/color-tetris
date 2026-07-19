const VECTORS = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
};

export function resolveArrowEffects(initialKeys, board, eventBoard) {
  const rows = board.length;
  const cols = board[0]?.length || 0;
  const removed = new Set(initialKeys);
  const pending = [...removed].map(key => ({key, depth:0}));
  const activated = new Set();
  const beams = [];

  while (pending.length) {
    const {key, depth} = pending.shift();
    if (activated.has(key)) continue;
    const [x, y] = key.split(',').map(Number);
    const direction = eventBoard[y]?.[x];
    if (!direction || !VECTORS[direction]) continue;
    activated.add(key);
    const cells = [];
    const [dx, dy] = VECTORS[direction];
    const targetX = x + dx;
    const targetY = y + dy;
    const line = dx === 0
      ? Array.from({length:cols}, (_, nx) => [nx, targetY])
      : Array.from({length:rows}, (_, ny) => [targetX, ny]);
    for (const [nx, ny] of line) {
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const target = `${nx},${ny}`;
      cells.push(target);
      if (board[ny][nx] === null) continue;
      if (!removed.has(target)) {
        removed.add(target);
        pending.push({key:target, depth:depth + 1});
      }
    }
    beams.push({origin:key, direction, cells, delay:Math.min(depth * 70, 280)});
  }

  return {removed, beams};
}

export function expandArrowClears(initialKeys, board, eventBoard) {
  return resolveArrowEffects(initialKeys, board, eventBoard).removed;
}
