import test from 'node:test';
import assert from 'node:assert/strict';
import { actionForKey, isBottomCellTouch } from '../src/input.js';

test('웹 키보드의 일반적인 회전 키를 모두 정규화한다', () => {
  for (const event of [
    { code: 'ArrowUp', key: 'ArrowUp' },
    { code: 'KeyW', key: 'w' },
    { code: 'KeyX', key: 'x' },
    { code: 'KeyZ', key: 'z' },
    { code: '', key: 'W' },
  ]) assert.equal(actionForKey(event), 'rotate');
});

test('알 수 없는 키는 게임 입력으로 처리하지 않는다', () => {
  assert.equal(actionForKey({ code: 'KeyQ', key: 'q' }), null);
});

test('보드 최하단 한 셀 영역만 즉시 드롭 터치로 판정한다', () => {
  const rect = {bottom:700, height:680};
  assert.equal(isBottomCellTouch(667, rect, 20), true);
  assert.equal(isBottomCellTouch(665, rect, 20), false);
  assert.equal(isBottomCellTouch(701, rect, 20), false);
});
