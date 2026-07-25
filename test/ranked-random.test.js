import test from 'node:test';
import assert from 'node:assert/strict';
import { createRankedRandom } from '../functions/shared/ranked-random.js';

test('같은 랭킹 시드는 동일한 난수열을 만든다', () => {
  const first = createRankedRandom('run-123');
  const second = createRankedRandom('run-123');
  assert.deepEqual(Array.from({length:20}, first), Array.from({length:20}, second));
});

test('다른 랭킹 시드는 다른 난수열을 만든다', () => {
  const first = createRankedRandom('run-123');
  const second = createRankedRandom('run-456');
  assert.notDeepEqual(Array.from({length:8}, first), Array.from({length:8}, second));
});
