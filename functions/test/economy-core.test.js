import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_MISSIONS,
  ENERGY_REFILL_MS,
  SHOP_CATALOG,
  WEEKLY_MISSIONS,
  applyMissionRun,
  consumeEnergy,
  defaultEconomy,
  emptyMissionProgress,
  grantEnergy,
  refillEnergy,
  serializeMissions,
} from '../economy-core.js';

test('기본 테마는 무료로 보유하고 추가 테마와 스킨은 SPARK 상품이다', () => {
  const economy = defaultEconomy();
  assert.deepEqual(economy.ownedItems, ['default-theme']);
  assert.equal(economy.equippedItems.appTheme, 'default-theme');
  assert.equal(SHOP_CATALOG.find(item => item.id === 'default-theme').price, 0);
  assert.equal(SHOP_CATALOG.filter(item => item.slot === 'appTheme' && item.price > 0).length >= 2, true);
  assert.equal(SHOP_CATALOG.filter(item => item.slot === 'blockSkin' && item.price > 0).length >= 3, true);
});

test('에너지는 30분마다 충전되고 최대 3개를 넘지 않는다', () => {
  const now = Date.UTC(2026, 7, 26);
  assert.deepEqual(refillEnergy({energy:0, updatedAtMs:now}, now + ENERGY_REFILL_MS - 1), {
    energy:0, updatedAtMs:now, nextRefillAtMs:now + ENERGY_REFILL_MS,
  });
  assert.equal(refillEnergy({energy:0, updatedAtMs:now}, now + ENERGY_REFILL_MS * 2).energy, 2);
  assert.equal(refillEnergy({energy:2, updatedAtMs:now}, now + ENERGY_REFILL_MS * 3).energy, 3);
});

test('가득 찬 에너지를 소비하면 소비 시각부터 충전을 시작한다', () => {
  const now = Date.UTC(2026, 7, 26);
  const result = consumeEnergy({energy:3, updatedAtMs:now - 999_999}, now);
  assert.equal(result.energy, 2);
  assert.equal(result.nextRefillAtMs, now + ENERGY_REFILL_MS);
  assert.equal(result.consumed, true);
});

test('광고 보상은 최대 보유량에서 지급되지 않는다', () => {
  const now = Date.UTC(2026, 7, 26);
  assert.equal(grantEnergy({energy:2, updatedAtMs:now}, now).energy, 3);
  assert.equal(grantEnergy({energy:3, updatedAtMs:now}, now).granted, false);
});

test('미션은 진행도를 누적하고 완료 보상을 한 번만 지급한다', () => {
  let daily = emptyMissionProgress('2026-08-26', 'daily');
  daily = applyMissionRun(daily, {removedCells:50, reactorCount:1, maxChain:2, level:6});
  assert.equal(daily.reward, 0);
  daily = applyMissionRun(daily, {removedCells:35, reactorCount:1, maxChain:3, level:10});
  assert.equal(daily.reward, 70);
  daily = applyMissionRun(daily, {removedCells:50, reactorCount:2, maxChain:3, level:10});
  assert.equal(daily.reward, 0);
  assert.equal(serializeMissions(daily, DAILY_MISSIONS).every(item => item.complete), true);
});

test('주간 미션은 3연쇄 게임 횟수와 레벨 달성을 구분한다', () => {
  const weekly = applyMissionRun(emptyMissionProgress('2026-08-24', 'weekly'), {
    removedCells:90, reactorCount:1, maxChain:3, level:10,
  });
  const missions = serializeMissions(weekly, WEEKLY_MISSIONS);
  assert.equal(missions.find(item => item.id === 'weekly-chain-games').value, 1);
  assert.equal(missions.find(item => item.id === 'weekly-level').complete, true);
});
