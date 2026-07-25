import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NICKNAME_CHANGE_COOLDOWN_MS,
  canChangeNickname,
  createFunnyNickname,
  nicknameKey,
  normalizeNickname,
} from '../functions/shared/profile-protocol.js';
import {
  createSeasonBadgeIds,
  formatSeasonBadge,
  getUnprocessedClosedSeasons,
} from '../functions/shared/season-badges.js';

test('웃긴 기본 닉네임은 허용 길이와 문자 규칙을 지킨다', () => {
  const nickname = createFunnyNickname(() => 0);
  assert.equal(nickname, '졸린폭탄000');
  assert.equal(normalizeNickname(nickname), nickname);
});

test('닉네임 비교는 공백과 영문 대소문자를 무시한다', () => {
  assert.equal(nicknameKey(' Color Bomb 7 '), 'colorbomb7');
  assert.equal(normalizeNickname('폭탄/관리자'), '');
});

test('자동 닉네임은 즉시, 직접 변경한 닉네임은 24시간 후 변경한다', () => {
  const now = 10_000;
  assert.equal(canChangeNickname({isCustom:false}, now).allowed, true);
  assert.equal(canChangeNickname({isCustom:true,lastNicknameChangeAtMs:now}, now).allowed, false);
  assert.equal(
    canChangeNickname({isCustom:true,lastNicknameChangeAtMs:now}, now + NICKNAME_CHANGE_COOLDOWN_MS).allowed,
    true,
  );
});

test('종료된 미처리 시즌만 오래된 순서로 선택한다', () => {
  assert.deepEqual(getUnprocessedClosedSeasons({
    createdAt:new Date('2026-04-10T00:00:00Z'),
    now:new Date('2026-07-15T00:00:00Z'),
    processed:['2026-05'],
  }), ['2026-04', '2026-06']);
});

test('월말 실행 제출 유예가 끝나기 전에는 직전 시즌 배지를 확정하지 않는다', () => {
  const input = {createdAt:new Date('2026-06-01T00:00:00Z')};
  assert.deepEqual(getUnprocessedClosedSeasons({
    ...input,
    now:new Date('2026-06-30T16:00:00Z'),
  }), []);
  assert.deepEqual(getUnprocessedClosedSeasons({
    ...input,
    now:new Date('2026-07-01T16:01:00Z'),
  }), ['2026-06']);
});

test('시즌 기록과 최종 순위는 중복 없는 배지 ID로 표현한다', () => {
  assert.deepEqual(createSeasonBadgeIds('2026-06', 'mobile', 1), [
    '2026-06:mobile:best',
    '2026-06:mobile:top1',
  ]);
  assert.deepEqual(createSeasonBadgeIds('2026-06', 'desktop', 0), [
    '2026-06:desktop:best',
  ]);
  assert.equal(formatSeasonBadge('2026-06:mobile:top10'), '2026-06 · MOBILE TOP 10');
});
