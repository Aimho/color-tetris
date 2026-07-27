import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_ATTEMPT_LIMIT,
  calculateLedgerScore,
  getKstDay,
  getKstSeason,
  platformForAppId,
  shouldReplaceBest,
  validateLedger,
  validateReplay,
} from '../ranking-core.js';
import { createReplayFixture } from '../shared/ranked-replay.js';
import { replayRankedPlacements } from '../shared/ranked-replay.js';

test('테스트 기간에는 랭킹 일일 도전 횟수를 제한하지 않는다', () => {
  assert.equal(DAILY_ATTEMPT_LIMIT, null);
});

function ledger(overrides = {}) {
  const fixture = createReplayFixture('test-seed', 100);
  return {
    season:'2026-07', platform:'mobile', ruleVersion:2,
    randomVersion:1, playTimeMs:60_000, piecesPlaced:fixture.result.piecesPlaced, dropPoints:0,
    placementLog:fixture.placements,
    clearSteps:fixture.result.clearSteps,
    score:fixture.result.score, level:fixture.result.level,
    maxChain:fixture.result.maxChain, directClears:fixture.result.directClears,
    specialClears:fixture.result.specialClears, multiplierCells:fixture.result.multiplierCells,
    reactorCount:fixture.result.reactorCount,
    ...overrides,
  };
}

const run = {
  season:'2026-07', platform:'mobile', createdAtMs:0,
  seed:'test-seed', randomVersion:1,
};

test('KST 기준 일자와 월간 시즌을 계산한다', () => {
  const date = new Date('2026-07-31T15:01:00Z');
  assert.equal(getKstDay(date), '2026-08-01');
  assert.equal(getKstSeason(date), '2026-08');
});

test('웹은 요청한 터치 플랫폼을 사용하고 네이티브 앱은 모바일로 고정한다', () => {
  const webAppId = '1:138832269891:web:f0236e6bc1a25972adbaf6';
  assert.equal(platformForAppId(webAppId, [], 'mobile'), 'mobile');
  assert.equal(platformForAppId(webAppId, [], 'desktop'), 'desktop');
  assert.equal(platformForAppId(webAppId), 'desktop');
  assert.equal(platformForAppId('android-app', ['android-app', 'ios-app'], 'desktop'), 'mobile');
  assert.throws(() => platformForAppId(webAppId, [], 'tablet'), /invalid-platform/);
  assert.throws(() => platformForAppId('unknown'), /unknown-app/);
});

test('삭제 단계 원장에서 점수를 서버 방식으로 다시 계산한다', () => {
  assert.equal(calculateLedgerScore(ledger()), 0);
  const result = validateLedger(ledger(), run, 60_000);
  assert.equal(result.removedCells, 0);
  assert.equal(validateReplay(result, run).piecesPlaced, result.piecesPlaced);
});

test('점수·플랫폼·통계가 원장과 다르면 거부한다', () => {
  assert.throws(() => validateLedger(ledger({score:999}), run, 60_000), /score-mismatch/);
  assert.throws(() => validateLedger(ledger({platform:'desktop'}), run, 60_000), /run-mismatch/);
  assert.throws(() => validateLedger(ledger({directClears:99}), run, 60_000), /stats-mismatch/);
  assert.throws(() => validateReplay(ledger({piecesPlaced:2}), run), /replay-mismatch/);
});

test('최고 기록은 점수·레벨·달성 시각 순으로 교체한다', () => {
  const previous = {score:100, level:4, achievedAtMs:200};
  assert.equal(shouldReplaceBest(previous, {score:101, level:1, achievedAtMs:300}), true);
  assert.equal(shouldReplaceBest(previous, {score:100, level:5, achievedAtMs:300}), true);
  assert.equal(shouldReplaceBest(previous, {score:100, level:4, achievedAtMs:100}), true);
  assert.equal(shouldReplaceBest(previous, {score:99, level:9, achievedAtMs:1}), false);
});

test('게임 오버 전 제출과 게임 오버 뒤 추가 배치를 거부한다', () => {
  const fixture = createReplayFixture('terminal-seed', 100);
  assert.throws(
    () => replayRankedPlacements('terminal-seed', fixture.placements.slice(0, -1), 1),
    /unfinished-run/,
  );
  assert.throws(
    () => replayRankedPlacements('terminal-seed', [...fixture.placements, fixture.placements.at(-1)], 1),
    /placement-after-game-over/,
  );
});
