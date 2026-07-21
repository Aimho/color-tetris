import test from 'node:test';
import assert from 'node:assert/strict';
import { createReactorState, finishReactor, getReactorDuration, isReactorActive, isReactorExpired, pauseReactor, reactorSecondsLeft, recolorConnectedGroup, resumeReactor, startReactor } from '../src/reactor.js';

test('리액터는 5초 동안 활성화되고 만료된다', () => {
  const reactor = startReactor(1000);
  assert.equal(isReactorActive(reactor), true);
  assert.equal(reactorSecondsLeft(reactor, 1000), 5);
  assert.equal(isReactorExpired(reactor, 5999), false);
  assert.equal(isReactorExpired(reactor, 6000), true);
  assert.equal(isReactorActive(finishReactor(reactor)), false);
});

test('레벨이 오를수록 리액터 시간이 5초에서 3초까지 감소한다', () => {
  assert.equal(getReactorDuration(1), 5000);
  assert.equal(getReactorDuration(10), 4053);
  assert.equal(getReactorDuration(20), 3000);
});

test('일시정지 동안 리액터 남은 시간이 흐르지 않는다', () => {
  const paused = pauseReactor(startReactor(1000), 2500);
  assert.equal(reactorSecondsLeft(paused, 9999), 4);
  assert.equal(isReactorExpired(paused, 9999), false);
  const resumed = resumeReactor(paused, 10000);
  assert.equal(reactorSecondsLeft(resumed, 10000), 4);
  assert.equal(isReactorExpired(resumed, 13500), true);
});

test('터치 지점과 상하좌우로 연결된 같은 색 영역만 무작위 단색으로 바꾼다', () => {
  const board = [[1,1,2],[1,null,2],[3,1,2]];
  const result = recolorConnectedGroup(board, 0, 0, 4, () => 0.75);
  assert.deepEqual(result.cells.sort(), [[0,0],[0,1],[1,0]].sort());
  assert.deepEqual(result.board, [[3,3,2],[3,null,2],[3,1,2]]);
  assert.deepEqual(board, [[1,1,2],[1,null,2],[3,1,2]]);
});

test('빈 칸 터치는 보드를 변경하지 않는다', () => {
  const board = [[null]];
  assert.deepEqual(recolorConnectedGroup(board, 0, 0, 4, () => 0), {
    board, changed:false, cells:[], color:null,
  });
  assert.deepEqual(createReactorState(), {active:false, until:0, pausedRemaining:0});
});
