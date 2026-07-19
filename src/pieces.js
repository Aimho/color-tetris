export const MONO_PIECE_CHANCE = 0.05;
export const MONO_PIECE_PITY = 8;
export const EVENT_PIECE_CHANCE = 0.06;
export const EVENT_PIECE_PITY = 24;
export const EVENT_DIRECTIONS = ['up', 'down', 'left', 'right'];

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
