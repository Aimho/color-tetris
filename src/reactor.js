export const REACTOR_DURATION_MS = 10000;
const DIRECTIONS = [
  ['up', 0, -1],
  ['down', 0, 1],
  ['left', -1, 0],
  ['right', 1, 0],
];

export function getReactorDuration(level) {
  const normalized = Math.min(1, (Math.max(1, level) - 1) / 19);
  return Math.round(REACTOR_DURATION_MS - normalized * 4000);
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

export function getReactorArrowCount(removedCount) {
  if (removedCount >= 12) return 3;
  if (removedCount >= 9) return 2;
  return removedCount >= 6 ? 1 : 0;
}

function occupiedInTargetLine(board, matchedKeys, x, y, dx, dy) {
  const rows = board.length;
  const cols = board[0]?.length || 0;
  const targetX = x + dx;
  const targetY = y + dy;
  if (dx === 0) {
    return targetY >= 0 && targetY < rows
      && board[targetY].some((cell, nx) => cell !== null && !matchedKeys.has(`${nx},${targetY}`));
  }
  if (targetX < 0 || targetX >= cols) return false;
  return board.some((row, ny) => row[targetX] !== null && !matchedKeys.has(`${targetX},${ny}`));
}

export function addReactorArrows(matchedKeys, board, eventBoard, random = Math.random) {
  const candidates = [...matchedKeys]
    .map(key => {
      const [x, y] = key.split(',').map(Number);
      const directions = DIRECTIONS.filter(([, dx, dy]) => occupiedInTargetLine(board, matchedKeys, x, y, dx, dy));
      return { key, x, y, directions, hasArrow:eventBoard[y]?.[x] != null };
    })
    .filter(candidate => !candidate.hasArrow && candidate.directions.length);
  const targetCount = Math.min(getReactorArrowCount(matchedKeys.size), candidates.length);
  const nextEventBoard = eventBoard.map(row => [...row]);
  const arrows = [];

  for (let index = 0; index < targetCount; index++) {
    const candidateIndex = Math.floor(random() * candidates.length);
    const [candidate] = candidates.splice(candidateIndex, 1);
    const directionIndex = Math.floor(random() * candidate.directions.length);
    const [direction] = candidate.directions[directionIndex];
    nextEventBoard[candidate.y][candidate.x] = direction;
    arrows.push({ key: candidate.key, direction });
  }

  return { eventBoard: nextEventBoard, arrows };
}
