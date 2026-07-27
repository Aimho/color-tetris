import test from 'node:test';
import assert from 'node:assert/strict';
import { chargeReactor, finishRun, getKstDay, getReactorChargeRate, normalizeTheme, unlockedThemes } from '../src/progression.js';

test('KST 날짜는 UTC 경계를 올바르게 넘긴다', () => {
  assert.equal(getKstDay(new Date('2026-07-18T15:01:00Z')), '2026-07-19');
});

test('삭제와 연쇄로 리액터가 충전되며 100을 넘지 않는다', () => {
  assert.equal(chargeReactor(0, 6, 1), 9);
  assert.equal(chargeReactor(96, 20, 3), 100);
  assert.equal(getReactorChargeRate(1), 1);
  assert.equal(getReactorChargeRate(10), 0.74);
  assert.equal(getReactorChargeRate(20), 0.45);
  assert.equal(chargeReactor(0, 6, 1, 20), 4);
});

test('프로필에는 모든 그래픽 테마가 제공된다', () => {
  const profile = finishRun({
    games:2,bestScore:100,bestLevel:5,totalClears:490,
    bombsEarned:1,reactorUses:2,bestChain:1,bestChainPower:2,theme:'reactor',
  }, {
    score:500,level:7,clears:20,bombsEarned:2,reactorUses:1,maxChain:3,maxChainPower:4,
  });
  assert.deepEqual(unlockedThemes(profile).map(({id}) => id), ['default', 'pixel', 'neon']);
  assert.equal(profile.bestScore, 500);
  assert.equal(profile.totalClears, 510);
  assert.equal(profile.bombsEarned, 3);
  assert.equal(profile.reactorUses, 3);
  assert.equal(profile.bestChainPower, 4);
});

test('폐기된 테마 저장값은 기본 테마로 마이그레이션한다', () => {
  assert.equal(normalizeTheme('pixel'), 'pixel');
  assert.equal(normalizeTheme('ember'), 'default');
  assert.equal(normalizeTheme(undefined), 'default');
});
