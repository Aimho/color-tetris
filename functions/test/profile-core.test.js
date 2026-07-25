import test from 'node:test';
import assert from 'node:assert/strict';
import { nicknameReservationId } from '../profile-core.js';

test('닉네임 예약 키는 표기 차이를 같은 값으로 처리한다', () => {
  assert.equal(nicknameReservationId('Color Bomb 7'), nicknameReservationId('colorbomb7'));
  assert.equal(nicknameReservationId('졸린 폭탄 007').length, 64);
});
