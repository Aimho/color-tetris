import test from 'node:test';
import assert from 'node:assert/strict';
import { createOperationGuard } from '../src/operation-guard.js';

test('늦게 끝난 랭킹 시작 요청은 연습 모드 선택을 덮어쓰지 않는다', () => {
  const guard = createOperationGuard();
  const rankedRequest = guard.begin();
  const practiceRequest = guard.begin();

  assert.equal(guard.isCurrent(rankedRequest), false);
  assert.equal(guard.isCurrent(practiceRequest), true);
});

test('홈으로 돌아오면 진행 중이던 랭킹 시작 요청을 무효화한다', () => {
  const guard = createOperationGuard();
  const rankedRequest = guard.begin();
  guard.cancel();

  assert.equal(guard.isCurrent(rankedRequest), false);
});
