import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRankedEnergyClock,
  formatEnergyCountdown,
  projectRankedEnergy,
} from '../src/ranked-energy.js';

test('서버 시간 차이를 반영해 랭킹 에너지 충전 시간을 표시한다', () => {
  const clock = createRankedEnergyClock({
    balance:1, max:3, serverNow:10_000, nextRechargeAt:610_000,
  }, 5_000);
  const projected = projectRankedEnergy(clock, 305_000);
  assert.equal(projected.balance, 1);
  assert.equal(projected.remainingMs, 300_000);
  assert.equal(formatEnergyCountdown(projected.remainingMs), '05:00');
});

test('충전 시각이 지나면 최대 3개까지 로컬 표시를 갱신한다', () => {
  const clock = createRankedEnergyClock({
    balance:0, max:3, serverNow:0, nextRechargeAt:600_000,
  }, 0);
  assert.equal(projectRankedEnergy(clock, 600_000).balance, 1);
  assert.equal(projectRankedEnergy(clock, 1_800_000).balance, 3);
  assert.equal(projectRankedEnergy(clock, 1_800_000).nextRechargeAt, null);
});

test('충전 시각이 없는 비정상 응답은 에너지를 임의로 지급하지 않는다', () => {
  const projected = projectRankedEnergy({
    balance:0, max:3, nextRechargeAt:null, clockOffset:0,
  }, 1_000);
  assert.equal(projected.balance, 0);
});
