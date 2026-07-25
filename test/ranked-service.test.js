import test from 'node:test';
import assert from 'node:assert/strict';
import { isRetryableRankedError, readPendingRankedRun } from '../src/pending-ranked.js';

test('검증 실패는 재시도하지 않고 네트워크 오류만 보관한다', () => {
  assert.equal(isRetryableRankedError({code:'functions/invalid-argument'}), false);
  assert.equal(isRetryableRankedError({code:'functions/unavailable'}), true);
});

test('기기에 저장된 랭킹 제출 형식을 검증한다', () => {
  const valid = {
    runId:'00000000-0000-4000-8000-000000000000',
    ledger:{score:10},
  };
  const storage = {getItem:() => JSON.stringify(valid)};
  assert.deepEqual(readPendingRankedRun(storage), valid);
  assert.equal(readPendingRankedRun({getItem:() => '{"runId":"bad"}'}), null);
});
