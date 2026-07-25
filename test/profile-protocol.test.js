import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NICKNAME_CHANGE_COOLDOWN_MS,
  canChangeNickname,
  createFunnyNickname,
  nicknameKey,
  normalizeNickname,
} from '../functions/shared/profile-protocol.js';

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
