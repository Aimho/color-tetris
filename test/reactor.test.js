import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addReactorArrows,
  createReactorState,
  finishReactor,
  getReactorArrowCount,
  getReactorDuration,
  isReactorActive,
  isReactorExpired,
  pauseReactor,
  reactorSecondsLeft,
  resumeReactor,
  startReactor,
} from '../src/reactor.js';

test('리액터는 레벨에 따라 10초에서 6초까지 감소한다', () => {
  assert.equal(getReactorDuration(1), 10000);
  assert.equal(getReactorDuration(10), 8105);
  assert.equal(getReactorDuration(20), 6000);
  const reactor = startReactor(1000, getReactorDuration(1));
  assert.equal(isReactorActive(reactor), true);
  assert.equal(reactorSecondsLeft(reactor, 1000), 10);
  assert.equal(isReactorExpired(reactor, 10999), false);
  assert.equal(isReactorExpired(reactor, 11000), true);
  assert.equal(isReactorActive(finishReactor(reactor)), false);
});

test('일시정지 동안 리액터 남은 시간이 흐르지 않는다', () => {
  const paused = pauseReactor(startReactor(1000, 10000), 5500);
  assert.equal(reactorSecondsLeft(paused, 99999), 6);
  assert.equal(isReactorExpired(paused, 99999), false);
  const resumed = resumeReactor(paused, 10000);
  assert.equal(reactorSecondsLeft(resumed, 10000), 6);
  assert.equal(isReactorExpired(resumed, 15500), true);
});

test('삭제량에 따라 리액터 화살표가 최대 3개 생성된다', () => {
  assert.deepEqual([5,6,8,9,11,12,30].map(getReactorArrowCount), [0,1,1,2,2,3,3]);
});

test('리액터 화살표는 실제 블록을 맞힐 수 있는 삭제 셀에만 추가된다', () => {
  const board = [
    [2, null, null],
    [1, 1, 1],
    [1, 1, 1],
  ];
  const eventBoard = board.map(row => row.map(() => null));
  const matched = new Set(['0,1','1,1','2,1','0,2','1,2','2,2']);
  const result = addReactorArrows(matched, board, eventBoard, () => 0);
  assert.deepEqual(result.arrows, [{ key:'0,1', direction:'up' }]);
  assert.equal(result.eventBoard[1][0], 'up');
  assert.deepEqual(eventBoard, board.map(row => row.map(() => null)));
});

test('유효한 방향이 없으면 리액터 화살표를 만들지 않는다', () => {
  const board = [[1,1,1],[1,1,1]];
  const eventBoard = board.map(row => row.map(() => null));
  const matched = new Set(['0,0','1,0','2,0','0,1','1,1','2,1']);
  const result = addReactorArrows(matched, board, eventBoard, () => 0);
  assert.equal(result.arrows.length, 0);
  assert.deepEqual(createReactorState(), { active:false, until:0, pausedRemaining:0 });
});
