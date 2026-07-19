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
    const [dx, dy] = VECTORS[direction];
    const cells = [];
    for (let nx = x + dx, ny = y + dy; nx >= 0 && nx < cols && ny >= 0 && ny < rows; nx += dx, ny += dy) {
      if (board[ny][nx] === null) continue;
      const target = `${nx},${ny}`;
      cells.push(target);
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
