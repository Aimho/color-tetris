import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTopScores, normalizePlayerName, submitScore } from '../src/leaderboard.js';

test('플레이어 이름의 공백과 길이를 정리한다', () => {
  assert.equal(normalizePlayerName('  COLOR   MASTER  123 '), 'COLOR MASTER');
});

test('기기 내 점수를 높은 순서로 저장한다', async () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  await submitScore('BOMB A', 120, 2, storage);
  await submitScore('BOMB B', 340, 3, storage);
  const scores = await loadTopScores(storage);
  assert.deepEqual(scores.map(({name, score}) => ({name, score})), [
    {name:'BOMB B', score:340},
    {name:'BOMB A', score:120},
  ]);
});
