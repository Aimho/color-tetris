import test from 'node:test';
import assert from 'node:assert/strict';
import { getClearIntensity, getDropInterval, getLevelForClears, getLockDelay } from '../src/difficulty.js';

test('레벨이 오를수록 낙하 간격과 잠금 유예가 짧아진다', () => {
  assert.deepEqual([getDropInterval(1), getDropInterval(20)], [600, 55]);
  assert.deepEqual([getLockDelay(1), getLockDelay(20)], [380, 170]);
  assert.ok(getDropInterval(15) - getDropInterval(20) > getDropInterval(1) - getDropInterval(5));
});

test('삭제량에 따라 연출 단계가 상승한다', () => {
  assert.equal(getClearIntensity(6).name, 'clear');
  assert.equal(getClearIntensity(9).name, 'surge');
  assert.equal(getClearIntensity(14).name, 'overload');
});

test('삭제 30칸마다 레벨이 상승하고 최대 20으로 제한된다', () => {
  assert.deepEqual([getLevelForClears(0), getLevelForClears(30), getLevelForClears(9999)], [1,2,20]);
});
