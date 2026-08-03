export const GAME_MODES = Object.freeze({
  PRACTICE: 'practice',
  RANKED: 'ranked',
});
export const PLATFORMS = Object.freeze({
  APP: 'app',
  WEB: 'web',
});
export const RUN_SNAPSHOT_KEY = 'color-bomb-run-snapshot-v1';
export const RUN_SNAPSHOT_VERSION = 1;
const EVENTS = new Set([null, 'up', 'down', 'left', 'right', 'bomb', 'x2', 'x3']);
const PIECES = new Set(['I', 'O', 'T', 'S', 'Z', 'J', 'L']);

export function getKstDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function getKstSeason(date = new Date()) {
  return getKstDay(date).slice(0, 7);
}

export function detectPlatform({
  native = false,
} = {}) {
  return native ? PLATFORMS.APP : PLATFORMS.WEB;
}

export function createRunSnapshot(state, now = Date.now()) {
  return {
    version: RUN_SNAPSHOT_VERSION,
    savedAt: now,
    state: structuredClone(state),
  };
}

export function isValidRunSnapshot(snapshot, now = Date.now()) {
  if (!snapshot || snapshot.version !== RUN_SNAPSHOT_VERSION) return false;
  if (!Number.isFinite(snapshot.savedAt) || snapshot.savedAt > now + 60_000) return false;
  if (now - snapshot.savedAt > 7 * 24 * 60 * 60 * 1000) return false;
  const state = snapshot.state;
  if (!state
    || !Object.values(GAME_MODES).includes(state.mode)
    || !Object.values(PLATFORMS).includes(state.platform)
    || !validGrid(state.board, value => value === null || Number.isInteger(value) && value >= 0 && value < 4)
    || !validGrid(state.eventBoard, value => EVENTS.has(value))
    || !state.board.every((row, y) => row.every((value, x) => value !== null || state.eventBoard[y][x] === null))
    || !validPiece(state.active)
    || !Array.isArray(state.queue) || state.queue.length > 3 || !state.queue.every(validPiece)
    || state.hold !== null && !validPiece(state.hold)
    || typeof state.holdUsed !== 'boolean'
    || !validInteger(state.score, 0, 99_999_999)
    || !validInteger(state.level, 1, 999_999)
    || !validInteger(state.lines, 0, 99_999_999)
    || !validInteger(state.piecesSinceMono, 0, 9)
    || !validInteger(state.piecesSpawned, 0, 99_999_999)
    || !validInteger(state.reactorCharge, 0, 100)
    || !validInteger(state.reactorPower, 0, 99_999_999)
    || !validInteger(state.maxChain, 0, 99_999)
    || !Number.isFinite(state.lockTimer) || state.lockTimer < 0 || state.lockTimer > 10_000
    || !validInteger(state.lockResets, 0, 15)
    || !Array.isArray(state.shapeBag) || !state.shapeBag.every(type => PIECES.has(type))
    || !Array.isArray(state.colorBag) || !state.colorBag.every(color => Number.isInteger(color) && color >= 0 && color < 4)
    || typeof state.specialRewards?.bomb !== 'boolean'
    || typeof state.specialRewards?.arrow !== 'boolean') return false;
  return true;
}

export function saveRunSnapshot(state, storage = globalThis.localStorage, now = Date.now()) {
  const snapshot = createRunSnapshot(state, now);
  storage?.setItem(RUN_SNAPSHOT_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export function readRunSnapshot(storage = globalThis.localStorage, now = Date.now()) {
  try {
    const snapshot = JSON.parse(storage?.getItem(RUN_SNAPSHOT_KEY) || 'null');
    if (!isValidRunSnapshot(snapshot, now)) {
      storage?.removeItem(RUN_SNAPSHOT_KEY);
      return null;
    }
    return snapshot;
  } catch {
    try { storage?.removeItem(RUN_SNAPSHOT_KEY); } catch { /* private mode */ }
    return null;
  }
}

export function clearRunSnapshot(storage = globalThis.localStorage) {
  try { storage?.removeItem(RUN_SNAPSHOT_KEY); } catch { /* private mode */ }
}

function validGrid(grid, validCell) {
  return Array.isArray(grid)
    && grid.length === 20
    && grid.every(row => Array.isArray(row) && row.length === 10 && row.every(validCell));
}

function validPiece(piece) {
  return Boolean(
    piece
    && PIECES.has(piece.type)
    && Number.isInteger(piece.x) && piece.x >= -4 && piece.x <= 10
    && Number.isInteger(piece.y) && piece.y >= -4 && piece.y <= 20
    && validInteger(piece.rotation, 0, 3)
    && Array.isArray(piece.cells)
    && piece.cells.length === 4
    && piece.cells.every(cell => (
      Number.isInteger(cell.x) && cell.x >= -4 && cell.x <= 4
      && Number.isInteger(cell.y) && cell.y >= -4 && cell.y <= 4
      && Number.isInteger(cell.color) && cell.color >= 0 && cell.color < 4
      && EVENTS.has(cell.event)
    ))
  );
}

function validInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}
