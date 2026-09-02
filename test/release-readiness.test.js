import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const androidBuild = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('정식 버전과 Android 버전 메타데이터가 일치한다', () => {
  assert.equal(packageJson.version, '1.0.0');
  assert.match(androidBuild, /versionCode 8\b/);
  assert.match(androidBuild, /versionName "1\.0\.0"/);
  assert.match(mainSource, /buildVersion\.textContent = `VERSION \$\{__APP_VERSION__\}`/);
  assert.doesNotMatch(mainSource, /buildVersion\.textContent = `[^`]*BUILD/);
});

test('개인정보처리방침은 광고·오류 분석과 계정 삭제 경로를 안내한다', () => {
  const privacy = readFileSync(new URL('../public/privacy.html', import.meta.url), 'utf8');
  const deletion = readFileSync(new URL('../public/delete-account.html', import.meta.url), 'utf8');

  assert.match(privacy, /Google AdMob/);
  assert.match(privacy, /Sentry/);
  assert.match(privacy, /delete-account\.html/);
  assert.match(deletion, /계정 및 데이터 삭제/);
  assert.match(deletion, /aimho\.support@gmail\.com/);
});

test('Android 적응형 아이콘과 시스템 스플래시는 정식 자산을 참조한다', () => {
  const adaptiveIcon = readFileSync(new URL('../android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', import.meta.url), 'utf8');
  const foreground = readFileSync(new URL('../android/app/src/main/res/drawable/ic_launcher_foreground.xml', import.meta.url), 'utf8');
  const foregroundV24 = readFileSync(new URL('../android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml', import.meta.url), 'utf8');
  const roundAdaptiveIcon = readFileSync(new URL('../android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml', import.meta.url), 'utf8');
  const splashIcon = readFileSync(new URL('../android/app/src/main/res/drawable/aimho_splash_icon.xml', import.meta.url), 'utf8');
  const launchTheme = readFileSync(new URL('../android/app/src/main/res/values/styles.xml', import.meta.url), 'utf8');

  assert.match(adaptiveIcon, /@drawable\/ic_launcher_foreground/);
  assert.match(roundAdaptiveIcon, /@drawable\/ic_launcher_foreground/);
  assert.equal(foregroundV24, foreground);
  assert.match(launchTheme, /windowSplashScreenBackground[^<]*@android:color\/black/);
  assert.match(launchTheme, /windowSplashScreenAnimatedIcon[^<]*@drawable\/aimho_splash_icon/);
  assert.match(launchTheme, /postSplashScreenTheme[^<]*@style\/AppTheme\.NoActionBar/);
  assert.match(splashIcon, /<vector\b/);
  assert.match(splashIcon, /android:fillColor="#FFFFFF"/);
  assert.doesNotMatch(splashIcon, /android:alpha=/);
});
