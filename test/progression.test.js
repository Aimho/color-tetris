import test from 'node:test';
import assert from 'node:assert/strict';
import { chargeReactor, createSeededRandom, finishRun, getKstDay, getPace, unlockedThemes } from '../src/progression.js';

test('같은 문자열 시드는 같은 난수열을 만든다', () => {
  const a = createSeededRandom('daily:2026-07-19');
  const b = createSeededRandom('daily:2026-07-19');
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('KST 날짜는 UTC 경계를 올바르게 넘긴다', () => {
  assert.equal(getKstDay(new Date('2026-07-18T15:01:00Z')), '2026-07-19');
});

test('삭제와 연쇄로 리액터가 충전되며 100을 넘지 않는다', () => {
  assert.equal(chargeReactor(0, 6, 1), 18);
  assert.equal(chargeReactor(96, 20, 3), 100);
});

test('프로필은 실력 페이스와 장식 테마만 해금한다', () => {
  const profile = finishRun({games:2,bestLevel:5,totalClears:490,bestChain:1,theme:'reactor'}, {level:7,clears:20,maxChain:3});
  assert.equal(getPace(profile).label, 'RAPID');
  assert.deepEqual(unlockedThemes(profile).map(({id}) => id), ['reactor', 'ember']);
});
