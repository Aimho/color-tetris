import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachQueuedSpecial,
  createSpecialRewardQueue,
  earnSpecialRewards,
  expandArrowClears,
  resolveArrowEffects,
  resolveSpecialEffects,
} from '../src/events.js';

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
    {origin:'1,1',direction:'left',cells:['0,0','0,1','0,2'],delay:100},
  ]);
});

test('CHAIN 2는 화살표를, 직접 연결 9칸은 폭탄을 각각 한 개 예약한다', () => {
  const six = Array.from({length:6}, (_, x) => [x, 0]);
  const nine = Array.from({length:9}, (_, x) => [x, 0]);
  let rewards = earnSpecialRewards(createSpecialRewardQueue(), [six], 1);
  assert.deepEqual(rewards, {bomb:false, arrow:false});
  rewards = earnSpecialRewards(rewards, [six], 2);
  assert.deepEqual(rewards, {bomb:false, arrow:true});
  rewards = earnSpecialRewards(rewards, [nine], 3);
  assert.deepEqual(rewards, {bomb:true, arrow:true});
});

test('폭탄을 화살표보다 먼저 다음 조각 한 셀에 배치한다', () => {
  const piece = {cells:Array.from({length:4}, (_, index) => ({x:index,y:0,color:index,event:null}))};
  const bombResult = attachQueuedSpecial(piece, {bomb:true,arrow:true}, () => 0);
  assert.equal(bombResult.piece.cells[0].event, 'bomb');
  assert.deepEqual(bombResult.rewards, {bomb:false,arrow:true});
  const values = [.5, .3];
  const arrowResult = attachQueuedSpecial(piece, bombResult.rewards, () => values.shift());
  assert.equal(arrowResult.piece.cells[2].event, 'down');
  assert.deepEqual(arrowResult.rewards, {bomb:false,arrow:false});
});

test('폭탄은 가장자리에서 잘린 3×3을 제거하고 맞은 화살표를 연쇄 발동한다', () => {
  const board = Array.from({length:4}, () => Array(4).fill(1));
  const events = Array.from({length:4}, () => Array(4).fill(null));
  events[0][0] = 'bomb';
  events[1][1] = 'right';
  const result = resolveSpecialEffects(new Set(['0,0']), board, events);
  assert.deepEqual(result.bombs, [{
    origin:'0,0',
    cells:['0,0','1,0','0,1','1,1'],
    delay:0,
  }]);
  assert.deepEqual(result.beams, [{
    origin:'1,1',
    direction:'right',
    cells:['2,0','2,1','2,2','2,3'],
    delay:100,
  }]);
  assert.deepEqual([...result.removed].sort(), [
    '0,0','0,1','1,0','1,1','2,0','2,1','2,2','2,3',
  ]);
});
