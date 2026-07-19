import test from 'node:test';
import assert from 'node:assert/strict';
import { expandArrowClears, resolveArrowEffects } from '../src/events.js';

test('위 화살표는 바로 위쪽 행 전체를 제거한다', () => {
  const board = [[1,null,2],[3,0,3],[null,4,null]];
  const events = [[null,null,null],[null,'up',null],[null,null,null]];
  assert.deepEqual([...expandArrowClears(new Set(['1,1']), board, events)].sort(), ['0,0','1,1','2,0']);
});

test('화살표가 다른 화살표를 맞히면 연속 발동한다', () => {
  const board = [[1,1,1],[null,1,null],[null,1,null]];
  const events = [[null,null,null],[null,'left',null],[null,'up',null]];
  assert.deepEqual([...expandArrowClears(new Set(['1,2']), board, events)].sort(), ['0,0','1,1','1,2']);
});

test('아래는 다음 행 전체, 오른쪽은 다음 열 전체를 제거한다', () => {
  const board = Array.from({length:3}, () => [1,1,1]);
  const downEvents = [[null,null,null],[null,'down',null],[null,null,null]];
  const rightEvents = [[null,null,null],[null,'right',null],[null,null,null]];
  assert.deepEqual([...expandArrowClears(new Set(['1,1']), board, downEvents)].sort(), ['0,2','1,1','1,2','2,2']);
  assert.deepEqual([...expandArrowClears(new Set(['1,1']), board, rightEvents)].sort(), ['1,1','2,0','2,1','2,2']);
});

test('연속 화살표의 빔 경로와 지연 시간을 반환한다', () => {
  const board = [[1,1],[null,1],[null,1]];
  const events = [[null,null],[null,'left'],[null,'up']];
  const result = resolveArrowEffects(new Set(['1,2']), board, events);
  assert.deepEqual(result.beams, [
    {origin:'1,2',direction:'up',cells:['0,1','1,1'],delay:0},
    {origin:'1,1',direction:'left',cells:['0,0','0,1','0,2'],delay:70},
  ]);
});
