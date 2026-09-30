import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAnalyticsParams } from '../src/analytics.js';

test('분석 이벤트는 개인 정보 및 임의 필드를 제외한다', () => {
  assert.deepEqual(sanitizeAnalyticsParams({mode:'ranked', nickname:'private', uid:'secret', email:'private@example.com', reward:15, level:Infinity}), {mode:'ranked',reward:15});
});
