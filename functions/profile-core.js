import { createHash } from 'node:crypto';
import {
  canChangeNickname,
  createFunnyNickname,
  nicknameKey,
  normalizeNickname,
} from './shared/profile-protocol.js';

export { canChangeNickname, createFunnyNickname, normalizeNickname };

export function nicknameReservationId(nickname) {
  const key = nicknameKey(nickname);
  if (!key) throw new Error('invalid-nickname');
  return createHash('sha256').update(key).digest('hex');
}
