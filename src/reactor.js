export const REACTOR_DURATION_MS = 5000;

export function getReactorDuration(level) {
  const normalized = Math.min(1, (Math.max(1, level) - 1) / 19);
  return Math.round(REACTOR_DURATION_MS - normalized * 2000);
}

export function createReactorState() {
  return { active: false, until: 0, pausedRemaining: 0 };
}

export function isReactorActive(state) {
  return state.active;
}

export function startReactor(now, duration = REACTOR_DURATION_MS) {
  return { active: true, until: now + duration, pausedRemaining: 0 };
}

export function pauseReactor(state, now) {
  if (!state.active || state.pausedRemaining) return state;
  return { ...state, pausedRemaining: Math.max(0, state.until - now) };
}

export function resumeReactor(state, now) {
  if (!state.active || !state.pausedRemaining) return state;
  return { ...state, until: now + state.pausedRemaining, pausedRemaining: 0 };
}

export function reactorSecondsLeft(state, now) {
  if (!state.active) return 0;
  const remaining = state.pausedRemaining || state.until - now;
  return Math.max(0, Math.ceil(remaining / 1000));
}

export function isReactorExpired(state, now) {
  return state.active && !state.pausedRemaining && now >= state.until;
}

export function finishReactor() {
  return createReactorState();
}

export function recolorConnectedGroup(board, x, y, colorCount, random = Math.random) {
  const sourceColor = board[y]?.[x];
  if (sourceColor === null || sourceColor === undefined || colorCount < 1) {
    return { board, changed: false, cells: [], color: null };
  }

  const rows = board.length;
  const cols = board[0]?.length || 0;
  const cells = [];
  const seen = new Set([`${x},${y}`]);
  const stack = [[x,y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    cells.push([cx, cy]);
    for (const [nx, ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]) {
      const key = `${nx},${ny}`;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !seen.has(key) && board[ny][nx] === sourceColor) {
        seen.add(key);
        stack.push([nx,ny]);
      }
    }
  }

  const color = Math.floor(random() * colorCount);
  const nextBoard = board.map(row => [...row]);
  for (const [cx, cy] of cells) nextBoard[cy][cx] = color;
  return { board: nextBoard, changed: true, cells, color };
}
