import test from 'node:test';
import assert from 'node:assert/strict';
import { expandArrowClears } from '../src/events.js';

test('위 화살표는 같은 열의 위쪽 블록을 모두 제거한다', () => {
  const board = [[null,1],[null,2],[0,3],[null,4]];
  const events = [[null,null],[null,null],[null,'up'],[null,null]];
  assert.deepEqual([...expandArrowClears(new Set(['1,2']), board, events)].sort(), ['1,0','1,1','1,2']);
});

test('화살표가 다른 화살표를 맞히면 연속 발동한다', () => {
  const board = [[1,1,1],[null,1,null],[null,1,null]];
  const events = [[null,'left',null],[null,null,null],[null,'up',null]];
  assert.deepEqual([...expandArrowClears(new Set(['1,2']), board, events)].sort(), ['0,0','1,0','1,1','1,2']);
});

test('아래와 오른쪽 화살표도 보드 끝까지 관통한다', () => {
  const board = Array.from({length:3}, () => [1,1,1]);
  const downEvents = [[null,null,null],[null,'down',null],[null,null,null]];
  const rightEvents = [[null,null,null],[null,'right',null],[null,null,null]];
  assert.deepEqual([...expandArrowClears(new Set(['1,1']), board, downEvents)].sort(), ['1,1','1,2']);
  assert.deepEqual([...expandArrowClears(new Set(['1,1']), board, rightEvents)].sort(), ['1,1','2,1']);
});
