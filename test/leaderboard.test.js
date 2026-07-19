import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlayerName } from '../src/leaderboard.js';

test('플레이어 이름의 공백과 길이를 정리한다', () => {
  assert.equal(normalizePlayerName('  COLOR   MASTER  123 '), 'COLOR MASTER');
});
