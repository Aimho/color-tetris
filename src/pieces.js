export const MONO_PIECE_CHANCE = 0.05;
export const MONO_PIECE_PITY = 8;

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
