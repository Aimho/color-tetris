import test from 'node:test';
import assert from 'node:assert/strict';
import { actionForKey } from '../src/input.js';

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
