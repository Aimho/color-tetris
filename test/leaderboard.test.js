import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_RECORDED_LEVEL, normalizeLevel, normalizePlayerName, normalizeScore, selectPendingScore, shouldReplaceBestScore } from '../src/leaderboard.js';

test('플레이어 이름의 공백과 길이를 정리한다', () => {
  assert.equal(normalizePlayerName('  COLOR   MASTER  123 '), 'COLOR MASTER');
  assert.equal(normalizePlayerName('Ａ\u202EB\u200BC'), 'ABC');
});

test('점수를 정수 범위로 정리한다', () => {
  assert.equal(normalizeScore(-10), 0);
  assert.equal(normalizeScore(123.6), 124);
  assert.equal(normalizeScore(Number.POSITIVE_INFINITY), 0);
  assert.equal(normalizeScore(1_000_000_000), 99_999_999);
});

test('기록 레벨은 양의 정수와 저장용 기술 상한으로 정리한다', () => {
  assert.deepEqual(
    [normalizeLevel(-2), normalizeLevel(12.6), normalizeLevel(5000), normalizeLevel(1e9), normalizeLevel('invalid')],
    [1, 13, 5000, MAX_RECORDED_LEVEL, 1],
  );
});

test('기존 기록보다 높은 점수만 교체한다', () => {
  assert.equal(shouldReplaceBestScore(undefined, 120), true);
  assert.equal(shouldReplaceBestScore(120, 120), false);
  assert.equal(shouldReplaceBestScore(120, 119), false);
  assert.equal(shouldReplaceBestScore(120, 121), true);
});

test('미전송 기록도 가장 높은 점수 하나만 보존한다', () => {
  const previous = { name: 'A', score: 300, level: 3 };
  const lower = { name: 'B', score: 200, level: 2 };
  const higher = { name: 'C', score: 400, level: 4 };
  assert.equal(selectPendingScore(previous, lower), previous);
  assert.equal(selectPendingScore(previous, higher), higher);
});
