import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseMultiplierDrop,
  getChainPower,
  getClearSpecialMultiplier,
  getMultiplierRewards,
} from '../src/reactor.js';

test('체인 단계별 파워가 최대 4까지 누적 단위로 계산된다', () => {
  assert.deepEqual([1,2,3,4,5,9].map(getChainPower), [0,1,2,3,4,4]);
});

test('누적 파워 구간에 맞춰 최대 3개의 배수 셀을 지급한다', () => {
  assert.deepEqual(getMultiplierRewards(0), ['x2']);
  assert.deepEqual(getMultiplierRewards(2), ['x2', 'x2']);
  assert.deepEqual(getMultiplierRewards(4), ['x2', 'x3']);
  assert.deepEqual(getMultiplierRewards(6), ['x3', 'x3']);
  assert.deepEqual(getMultiplierRewards(9), ['x2', 'x3', 'x3']);
});

test('배수 셀은 가득 찬 열을 피하고 가장 큰 연결을 만드는 색을 고른다', () => {
  const board = [
    [0, null, null],
    [0, null, null],
    [0, 2, null],
  ];
  const target = chooseMultiplierDrop(board, 4, () => 0);
  assert.deepEqual(target, { x:1, y:1, color:0, connectionSize:4 });
  assert.equal(board[1][1], null);
});

test('모든 열이 가득 차면 배수 셀을 투하하지 않는다', () => {
  assert.equal(chooseMultiplierDrop([[0,1], [2,3]], 4), null);
});

test('한 삭제 단계의 배수는 곱하되 6배를 넘지 않는다', () => {
  const events = [[null, 'x2', 'x3'], ['x3', null, null]];
  assert.equal(getClearSpecialMultiplier(new Set(['1,0']), events), 2);
  assert.equal(getClearSpecialMultiplier(new Set(['1,0', '2,0']), events), 6);
  assert.equal(getClearSpecialMultiplier(new Set(['0,1', '2,0']), events), 6);
});
