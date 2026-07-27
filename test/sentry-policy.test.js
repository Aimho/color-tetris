import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Sentry는 PII와 URL 쿼리를 제거하고 랭킹 오류를 수집한다', async () => {
  const [sentry, main] = await Promise.all([
    readFile(new URL('../src/sentry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  ]);
  assert.match(sentry, /sendDefaultPii:false/);
  assert.match(sentry, /event\.request\.url\.split\('\?'\)\[0\]/);
  assert.match(main, /captureClientError\('ranked-submit', error/);
});
