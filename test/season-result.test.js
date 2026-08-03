import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acknowledgeSeasonResult,
  formatSeasonResultSummary,
  shouldShowSeasonResult,
} from '../src/season-result.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem:key => values.get(key) || null,
    setItem:(key, value) => values.set(key, value),
  };
}

const profile = {
  seasonResults:[
    {
      season:'2026-06',
      platforms:{
        mobile:{score:12345, level:8, rank:0},
        desktop:{score:54321, level:12, rank:7},
      },
    },
    {season:'2026-07', platforms:{mobile:null, desktop:null}},
  ],
};

test('여러 시즌 결과는 오래된 순서대로 하나씩 확인한다', () => {
  const storage = memoryStorage();
  assert.equal(shouldShowSeasonResult(profile, storage), true);
  assert.equal(acknowledgeSeasonResult(profile, storage), true);
  assert.equal(shouldShowSeasonResult(profile, storage), true);
  assert.equal(acknowledgeSeasonResult(profile, storage), true);
  assert.equal(shouldShowSeasonResult(profile, storage), false);
});

test('시즌 결과는 플랫폼별 점수와 최종 순위를 요약한다', () => {
  assert.equal(
    formatSeasonResultSummary(profile.seasonResults[0]),
    'MOBILE 12,345점 · TOP 50 밖 / DESKTOP 54,321점 · #7',
  );
  assert.equal(
    formatSeasonResultSummary({season:'2026-06', platforms:{mobile:null, desktop:null}}),
    '참가 기록 없이 시즌이 종료됐어요.',
  );
});
