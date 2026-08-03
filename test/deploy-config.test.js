import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('프로덕션 빌드는 Firebase App Check 사이트 키를 포함한다', () => {
  const productionEnv = readFileSync(new URL('../.env.production', import.meta.url), 'utf8');
  assert.match(productionEnv, /^VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=6L[\w-]+$/m);
});

test('Android 서명 비밀은 실제 Release 산출물 작업에만 필요하다', () => {
  const gradle = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
  assert.match(gradle, /\['assemblerelease', 'bundlerelease'\]/);
  assert.doesNotMatch(gradle, /contains\('release'\)/);
});
