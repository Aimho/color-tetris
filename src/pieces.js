export const MONO_PIECE_CHANCE = 0.05;
export const MONO_PIECE_PITY = 8;
export const EVENT_PIECE_CHANCE = 0.10;
export const EVENT_PIECE_PITY = 16;
export const EVENT_DIRECTIONS = ['up', 'down', 'left', 'right'];

const CLOCKWISE_DIRECTION = { up: 'right', right: 'down', down: 'left', left: 'up' };
const JLSTZ_KICKS = {
  '0>1': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '1>2': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '2>3': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '3>0': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
};
const I_KICKS = {
  '0>1': [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  '1>2': [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
  '2>3': [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  '3>0': [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
};

export function rotateDirection(direction) {
  return CLOCKWISE_DIRECTION[direction] || direction;
}

export function rotateCellClockwise(cell, isSquare = false) {
  const rotated = {
    ...cell,
    x: 2 - cell.y,
    y: isSquare ? cell.x - 1 : cell.x,
  };
  if (cell.event) rotated.event = rotateDirection(cell.event);
  return rotated;
}

export function wallKickOffsets(type, fromRotation, toRotation) {
  if (type === 'O') return [[0, 0]];
  const table = type === 'I' ? I_KICKS : JLSTZ_KICKS;
  return table[`${fromRotation}>${toRotation}`] || [[0, 0]];
}

export function rotateSquareCells(cells) {
  return cells.map(cell => rotateCellClockwise(cell, true));
}

export function shouldCreateMonoPiece(piecesSinceMono, random = Math.random) {
  return piecesSinceMono >= MONO_PIECE_PITY || random() < MONO_PIECE_CHANCE;
}

export function createPieceColors(colorCount, piecesSinceMono, takeMixedColors, random = Math.random) {
  if (!shouldCreateMonoPiece(piecesSinceMono, random)) {
    return { colors: takeMixedColors(), isMono: false };
  }

  const color = Math.floor(random() * colorCount);
  return { colors: Array(4).fill(color), isMono: true };
}

export function createPieceEvent(piecesSinceEvent, cellCount = 4, random = Math.random) {
  const appears = piecesSinceEvent >= EVENT_PIECE_PITY || random() < EVENT_PIECE_CHANCE;
  if (!appears) return { event: null, nextCount: piecesSinceEvent + 1 };
  return {
    event: {
      cellIndex: Math.floor(random() * cellCount),
      direction: EVENT_DIRECTIONS[Math.floor(random() * EVENT_DIRECTIONS.length)],
    },
    nextCount: 0,
  };
}
