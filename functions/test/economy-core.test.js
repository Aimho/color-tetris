import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATTENDANCE_REWARDS,
  DAILY_MISSIONS,
  ENERGY_REFILL_MS,
  SHOP_CATALOG,
  WEEKLY_MISSIONS,
  applyMissionRun,
  claimAttendance,
  consumeEnergy,
  defaultEconomy,
  emptyMissionProgress,
  grantEnergy,
  refillEnergy,
  scoreToSpark,
  serializeMissions,
} from '../economy-core.js';

test('7일 출석은 서버 날짜 기준으로 하루 한 번 보상한다', () => {
  const first = claimAttendance({}, '2026-09-29');
  assert.equal(first.streak, 1);
  assert.equal(first.reward, ATTENDANCE_REWARDS[0]);
  assert.equal(first.claimed, true);

  const duplicate = claimAttendance(first, '2026-09-29');
  assert.equal(duplicate.claimed, false);
  assert.equal(duplicate.reward, 0);

  const second = claimAttendance(first, '2026-09-30');
  assert.equal(second.streak, 2);
  assert.equal(second.reward, ATTENDANCE_REWARDS[1]);
});

test('출석을 하루 놓치거나 7일을 완료하면 새 주기를 시작한다', () => {
  const missed = claimAttendance({streak:4, lastClaimDay:'2026-09-27'}, '2026-09-29');
  assert.equal(missed.streak, 1);

  const cycled = claimAttendance({streak:7, lastClaimDay:'2026-09-28'}, '2026-09-29');
  assert.equal(cycled.streak, 1);
  assert.equal(cycled.reward, ATTENDANCE_REWARDS[0]);
});

test('자정 이전의 지연 요청은 다음 날 보상을 되돌리거나 중복 지급하지 않는다', () => {
  const claim = claimAttendance({streak:2,lastClaimDay:'2026-10-01'}, '2026-09-30');
  assert.equal(claim.claimed,false);
  assert.equal(claim.reward,0);
  assert.equal(claim.lastClaimDay,'2026-10-01');
});

test('검증 점수는 게임당 25·하루 75 SPARK 한도 안에서 환산한다', () => {
  assert.equal(scoreToSpark(999, 0), 0);
  assert.equal(scoreToSpark(12_999, 0), 12);
  assert.equal(scoreToSpark(99_999, 0), 25);
  assert.equal(scoreToSpark(20_000, 70), 5);
  assert.equal(scoreToSpark(20_000, 75), 0);
});

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
