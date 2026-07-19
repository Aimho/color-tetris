import test from 'node:test';
import assert from 'node:assert/strict';
import { getClearIntensity, getDropInterval, getLockDelay } from '../src/difficulty.js';

test('레벨이 오를수록 낙하 간격과 잠금 유예가 짧아진다', () => {
  assert.deepEqual([getDropInterval(1), getDropInterval(20)], [820, 70]);
  assert.deepEqual([getLockDelay(1), getLockDelay(20)], [450, 220]);
});

test('삭제량에 따라 연출 단계가 상승한다', () => {
  assert.equal(getClearIntensity(6).name, 'clear');
  assert.equal(getClearIntensity(9).name, 'surge');
  assert.equal(getClearIntensity(14).name, 'overload');
});
