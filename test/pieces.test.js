import test from 'node:test';
import assert from 'node:assert/strict';
import { createPieceColors, MONO_PIECE_PITY, shouldCreateMonoPiece } from '../src/pieces.js';

test('5% 확률 구간에서는 단색 조각을 만든다', () => {
  assert.equal(shouldCreateMonoPiece(0, () => 0.049), true);
  assert.equal(shouldCreateMonoPiece(0, () => 0.05), false);
});

test('혼합 조각이 8개 연속 나오면 다음 조각은 단색으로 보장한다', () => {
  assert.equal(shouldCreateMonoPiece(MONO_PIECE_PITY, () => 0.99), true);
});

test('단색 조각은 네 셀이 모두 같은 색이다', () => {
  const result = createPieceColors(4, MONO_PIECE_PITY, () => [0, 1, 2, 3], () => 0.6);
  assert.deepEqual(result, { colors: [2, 2, 2, 2], isMono: true });
});

test('단색 조건이 아니면 기존 혼합 색상 생성을 사용한다', () => {
  const result = createPieceColors(4, 0, () => [0, 1, 2, 3], () => 0.9);
  assert.deepEqual(result, { colors: [0, 1, 2, 3], isMono: false });
});
