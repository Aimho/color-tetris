import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

test('네트워크 응답은 본문이 소비되기 전에 복제하고 캐시 저장을 기다린다', () => {
  assert.doesNotMatch(worker, /caches\.open\(CACHE\)\.then\(cache => cache\.put\(event\.request, response\.clone\(\)\)\)/);
  assert.match(worker, /const copy = response\.clone\(\);[\s\S]*event\.waitUntil\(caches\.open\(CACHE\)\.then\(cache => cache\.put\(event\.request, copy\)\)\)/);
});
