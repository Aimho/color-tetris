export const MULTIPLIER_EVENTS = Object.freeze(['x2', 'x3']);

export function getChainPower(chain) {
  return Math.min(4, Math.max(0, Math.floor(chain) - 1));
}

export function getMultiplierRewards(power) {
  if (power >= 9) return ['x2', 'x3', 'x3'];
  if (power >= 6) return ['x3', 'x3'];
  if (power >= 4) return ['x2', 'x3'];
  if (power >= 2) return ['x2', 'x2'];
  return ['x2'];
}

export function getClearSpecialMultiplier(removedKeys, eventBoard) {
  let multiplier = 1;
  for (const key of removedKeys) {
    const [x, y] = key.split(',').map(Number);
    const event = eventBoard[y]?.[x];
    if (event === 'x2') multiplier *= 2;
    if (event === 'x3') multiplier *= 3;
  }
  return Math.min(6, multiplier);
}

function connectedSize(board, startX, startY, color) {
  const rows = board.length;
  const cols = board[0]?.length || 0;
  const seen = new Set([`${startX},${startY}`]);
  const pending = [[startX, startY]];
  while (pending.length) {
    const [x, y] = pending.pop();
    for (const [dx, dy] of [[0,-1], [1,0], [0,1], [-1,0]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || seen.has(key)) continue;
      if (board[ny][nx] !== color) continue;
      seen.add(key);
      pending.push([nx, ny]);
    }
  }
  return seen.size;
}

export function chooseMultiplierDrop(board, colorCount, random = Math.random) {
  const rows = board.length;
  const cols = board[0]?.length || 0;
  const columns = Array.from({length:cols}, (_, x) => x)
    .filter(x => board[0][x] === null);
  if (!columns.length) return null;
  const x = columns[Math.floor(random() * columns.length)];
  let y = rows - 1;
  while (y >= 0 && board[y][x] !== null) y--;

  let bestSize = -1;
  let colors = [];
  for (let color = 0; color < colorCount; color++) {
    board[y][x] = color;
    const size = connectedSize(board, x, y, color);
    board[y][x] = null;
    if (size > bestSize) {
      bestSize = size;
      colors = [color];
    } else if (size === bestSize) {
      colors.push(color);
    }
  }
  const color = colors[Math.floor(random() * colors.length)];
  return { x, y, color, connectionSize: bestSize };
}
