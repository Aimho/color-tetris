import test from 'node:test';
import assert from 'node:assert/strict';
import { createPieceColors, createPieceEvent, EVENT_PIECE_CHANCE, EVENT_PIECE_PITY, MONO_PIECE_PITY, rotateCellClockwise, rotateDirection, rotateSquareCells, shouldCreateMonoPiece, wallKickOffsets } from '../src/pieces.js';

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

test('이벤트 조각은 10% 확률로 한 셀에 방향을 부여한다', () => {
  assert.equal(EVENT_PIECE_CHANCE, .1);
  const result = createPieceEvent(0, 4, (() => { const values=[.099,.6,.9]; return () => values.shift(); })());
  assert.deepEqual(result, {event:{cellIndex:2,direction:'right'},nextCount:0});
});

test('16개 조각 동안 이벤트가 없으면 다음 조각에서 보장한다', () => {
  assert.equal(EVENT_PIECE_PITY, 16);
  const result = createPieceEvent(EVENT_PIECE_PITY, 4, (() => { const values=[.1,.1]; return () => values.shift(); })());
  assert.deepEqual(result, {event:{cellIndex:0,direction:'up'},nextCount:0});
});

test('O 조각은 모양을 유지한 채 색상 위치가 시계 방향으로 회전한다', () => {
  const cells = [
    {x:1,y:0,color:0}, {x:2,y:0,color:1},
    {x:1,y:1,color:2}, {x:2,y:1,color:3},
  ];
  assert.deepEqual(rotateSquareCells(cells), [
    {x:2,y:0,color:0}, {x:2,y:1,color:1},
    {x:1,y:0,color:2}, {x:1,y:1,color:3},
  ]);
});

test('조각 회전 시 화살표도 시계 방향으로 회전한다', () => {
  assert.deepEqual(['up', 'right', 'down', 'left'].map(rotateDirection), [
    'right', 'down', 'left', 'up',
  ]);
  assert.equal(rotateSquareCells([{x:1,y:0,color:0,event:'left'}])[0].event, 'up');
});

test('월킥은 벽과 바닥을 벗어날 수 있도록 가로와 세로 보정을 제공한다', () => {
  const kicks = wallKickOffsets('T', 0, 1);
  assert.deepEqual(kicks[0], [0, 0]);
  assert.ok(kicks.some(([x]) => x !== 0));
  assert.ok(kicks.some(([,y]) => y < 0));
});

test('바닥의 수평 I 조각은 위쪽 킥으로 세로 회전할 수 있다', () => {
  const horizontal = [{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:3,y:1}];
  const rotated = horizontal.map(cell => rotateCellClockwise(cell));
  const active = {x:3,y:18};
  const validKick = wallKickOffsets('I', 0, 1).find(([dx, dy]) => rotated.every(cell => {
    const x = active.x + dx + cell.x, y = active.y + dy + cell.y;
    return x >= 0 && x < 10 && y < 20;
  }));
  assert.deepEqual(validKick, [1, -2]);
});
