import test from 'node:test';
import assert from 'node:assert/strict';
import { cloneSerializable, createRequestId } from '../src/platform-compat.js';

test('직렬화 가능한 값을 네이티브 API 없이 깊은 복제한다', () => {
  const original = {board:[[1, null]], rewards:{bomb:true}};
  const cloned = cloneSerializable(original, undefined);

  cloned.board[0][0] = 2;
  assert.deepEqual(original, {board:[[1, null]], rewards:{bomb:true}});
});

test('사용 가능한 네이티브 복제 API를 우선 사용한다', () => {
  const sentinel = {native:true};
  assert.equal(cloneSerializable({}, () => sentinel), sentinel);
});

test('randomUUID가 없으면 보안 난수로 UUID v4를 만든다', () => {
  const cryptoObject = {
    getRandomValues(bytes) {
      bytes.fill(0xab);
      return bytes;
    },
  };

  const requestId = createRequestId(cryptoObject);
  assert.match(requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(requestId, 'abababab-abab-4bab-abab-abababababab');
});

test('사용 가능한 randomUUID를 우선 사용한다', () => {
  assert.equal(createRequestId({randomUUID:() => 'native-id'}), 'native-id');
});

test('보안 난수 API가 없으면 요청 ID 생성을 중단한다', () => {
  assert.throws(() => createRequestId({}), /보안 난수/);
});
