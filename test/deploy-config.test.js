import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('프로덕션 빌드는 Firebase App Check 사이트 키를 포함한다', () => {
  const productionEnv = readFileSync(new URL('../.env.production', import.meta.url), 'utf8');
  assert.match(productionEnv, /^VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=6L[\w-]+$/m);
});
