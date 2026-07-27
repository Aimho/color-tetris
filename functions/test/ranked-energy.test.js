import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RANKED_ENERGY_MAX,
  RANKED_ENERGY_RECHARGE_MS,
  calculateRankedEnergy,
  rewardRankedEnergy,
  spendRankedEnergy,
} from '../shared/ranked-energy.js';

test('새 플레이어는 랭킹 에너지 3개로 시작한다', () => {
  assert.equal(calculateRankedEnergy(null, 1_000).balance, RANKED_ENERGY_MAX);
});

test('소비한 에너지는 10분마다 한 개씩 최대 3개까지 회복한다', () => {
  const start = {balance:0, chargedAt:1_000};
  assert.equal(calculateRankedEnergy(start, 1_000 + RANKED_ENERGY_RECHARGE_MS - 1).balance, 0);
  assert.equal(calculateRankedEnergy(start, 1_000 + RANKED_ENERGY_RECHARGE_MS).balance, 1);
  assert.equal(calculateRankedEnergy(start, 1_000 + RANKED_ENERGY_RECHARGE_MS * 10).balance, 3);
});

test('가득 찬 상태에서 차감하면 그 시점부터 충전을 시작한다', () => {
  const result = spendRankedEnergy({balance:3, chargedAt:1_000}, 100_000);
  assert.equal(result.balance, 2);
  assert.equal(result.nextRechargeAt, 100_000 + RANKED_ENERGY_RECHARGE_MS);
});

test('에너지가 없으면 차감하지 않는다', () => {
  const result = spendRankedEnergy({balance:0, chargedAt:100_000}, 100_001);
  assert.equal(result.spent, false);
  assert.equal(result.balance, 0);
});

test('시즌 신기록 보상은 한 개를 지급하되 최대치를 넘지 않는다', () => {
  assert.deepEqual(
    {balance:rewardRankedEnergy({balance:1, chargedAt:100_000}, 100_001).balance},
    {balance:2},
  );
  assert.equal(rewardRankedEnergy({balance:3, chargedAt:100_000}, 100_001).rewarded, false);
});
