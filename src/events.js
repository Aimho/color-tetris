const VECTORS = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
};

export function expandArrowClears(initialKeys, board, eventBoard) {
  const rows = board.length;
  const cols = board[0]?.length || 0;
  const removed = new Set(initialKeys);
  const pending = [...removed];
  const activated = new Set();

  while (pending.length) {
    const key = pending.shift();
    if (activated.has(key)) continue;
    const [x, y] = key.split(',').map(Number);
    const direction = eventBoard[y]?.[x];
    if (!direction || !VECTORS[direction]) continue;
    activated.add(key);
    const [dx, dy] = VECTORS[direction];
    for (let nx = x + dx, ny = y + dy; nx >= 0 && nx < cols && ny >= 0 && ny < rows; nx += dx, ny += dy) {
      if (board[ny][nx] === null) continue;
      const target = `${nx},${ny}`;
      if (!removed.has(target)) {
        removed.add(target);
        pending.push(target);
      }
    }
  }

  return removed;
}
