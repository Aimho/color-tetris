import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareRankEntries,
  createScoreLedger,
  remainingRankedAttempts,
} from '../src/ranking-model.js';

test('랭킹 도전권은 KST 날짜가 바뀌면 하루 3회로 초기화된다', () => {
  const before = new Date('2026-07-25T14:59:00Z');
  const after = new Date('2026-07-25T15:01:00Z');
  assert.equal(remainingRankedAttempts({day:'2026-07-25', used:2}, before).remaining, 1);
  assert.equal(remainingRankedAttempts({day:'2026-07-25', used:2}, after).remaining, 3);
});

test('동점은 점수·레벨·달성 시각·플레이어 ID 순으로 결정한다', () => {
  const entries = [
    {playerId:'b', score:100, level:4, achievedAt:'2026-07-02T00:00:00Z'},
    {playerId:'a', score:100, level:5, achievedAt:'2026-07-03T00:00:00Z'},
    {playerId:'c', score:100, level:5, achievedAt:'2026-07-01T00:00:00Z'},
    {playerId:'d', score:120, level:2, achievedAt:'2026-07-04T00:00:00Z'},
  ];
  assert.deepEqual(entries.sort(compareRankEntries).map(({playerId}) => playerId), ['d','c','a','b']);
});

test('점수 원장은 시즌과 검증용 플레이 통계를 정규화한다', () => {
  const ledger = createScoreLedger({
    mode:'ranked', platform:'mobile', score:12.6, level:4.2,
    playTimeMs:1000.8, directClears:12, specialClears:4,
    maxChain:3, reactorCount:1, multiplierCells:2, ruleVersion:2,
    date:new Date('2026-07-31T15:01:00Z'),
  });
  assert.deepEqual(ledger, {
    mode:'ranked', platform:'mobile', season:'2026-08',
    score:13, level:4, playTimeMs:1001, directClears:12,
    specialClears:4, maxChain:3, reactorCount:1,
    multiplierCells:2, ruleVersion:2,
  });
});
