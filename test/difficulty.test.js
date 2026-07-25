import test from 'node:test';
import assert from 'node:assert/strict';
import { canResetLock, getChainMultiplier, getClearIntensity, getClearScore, getDropInterval, getLevelForClears, getLockDelay, MAX_LOCK_RESETS } from '../src/difficulty.js';

test('레벨이 올라도 잠금 유예는 0.5초로 유지된다', () => {
  assert.deepEqual([getDropInterval(1), getDropInterval(20)], [600, 205]);
  assert.deepEqual([getLockDelay(1), getLockDelay(20)], [500, 500]);
  assert.ok(getDropInterval(1) > getDropInterval(20));
  assert.equal(getDropInterval(1000), 120);
});

test('지상 조작의 잠금 타이머 초기화는 조각당 15회로 제한된다', () => {
  assert.equal(canResetLock(true, MAX_LOCK_RESETS - 1), true);
  assert.equal(canResetLock(true, MAX_LOCK_RESETS), false);
  assert.equal(canResetLock(false, 0), false);
});

test('삭제량에 따라 연출 단계가 상승한다', () => {
  assert.equal(getClearIntensity(6).name, 'clear');
  assert.equal(getClearIntensity(9).name, 'surge');
  assert.equal(getClearIntensity(14).name, 'overload');
});

test('연쇄가 이어질수록 삭제 점수 배율이 크게 상승한다', () => {
  assert.deepEqual([1,2,3,4,5,8].map(getChainMultiplier), [1,1.8,3,4.8,7,7]);
  assert.equal(getClearScore(6, 3), 180);
  assert.equal(getClearScore(6, 3, 6), 1080);
  assert.equal(getClearScore(6, 3, 9), 1080);
});

test('삭제 15칸마다 최대치 없이 레벨이 상승한다', () => {
  assert.deepEqual([getLevelForClears(0), getLevelForClears(15), getLevelForClears(9999)], [1,2,667]);
});
