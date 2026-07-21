export function findColorGroups(board, minimumSize = 1) {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const seen = new Set();
  const groups = [];

  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const startKey = `${x},${y}`;
    if (board[y][x] === null || seen.has(startKey)) continue;
    const color = board[y][x];
    const group = [];
    const stack = [[x, y]];
    seen.add(startKey);
    while (stack.length) {
      const [cx, cy] = stack.pop();
      group.push([cx, cy]);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        const key = `${nx},${ny}`;
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !seen.has(key) && board[ny][nx] === color) {
          seen.add(key);
          stack.push([nx, ny]);
        }
      }
    }
    if (group.length >= minimumSize) groups.push(group);
  }
  return groups;
}

export function groupSizesByCell(groups) {
  const result = new Map();
  for (const group of groups) for (const [x, y] of group) result.set(`${x},${y}`, group.length);
  return result;
}

export function hasOccupiedCell(board) {
  return board.some(row => row.some(cell => cell !== null && cell !== undefined));
}
