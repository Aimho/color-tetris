import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const androidBuild = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

test('정식 버전과 Android 버전 메타데이터가 일치한다', () => {
  assert.equal(packageJson.version, '1.0.1');
  assert.match(androidBuild, /versionCode 16\b/);
  assert.match(androidBuild, /versionName "1\.0\.1"/);
  assert.match(mainSource, /buildVersion\.textContent = `VERSION \$\{__APP_VERSION__\}`/);
  assert.doesNotMatch(mainSource, /buildVersion\.textContent = `[^`]*BUILD/);
});

test('Android는 edge-to-edge와 대형 화면 회전을 지원하고 AGP 9 최적화를 사용한다', () => {
  const manifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
  const activity = readFileSync(new URL('../android/app/src/main/java/com/aimho/games/colorbomb/MainActivity.java', import.meta.url), 'utf8');
  const rootBuild = readFileSync(new URL('../android/build.gradle', import.meta.url), 'utf8');
  const appBuild = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');

  assert.doesNotMatch(manifest, /android:screenOrientation=/);
  assert.match(activity, /EdgeToEdge\.enable\(this\)/);
  assert.match(rootBuild, /com\.android\.tools\.build:gradle:9\./);
  assert.match(appBuild, /minifyEnabled true/);
  assert.match(appBuild, /shrinkResources true/);
  assert.match(appBuild, /proguard-android-optimize\.txt/);
});

test('네이티브와 PWA는 회전을 허용하고 릴리스 도구 버전을 고정한다', () => {
  const iosInfo = readFileSync(new URL('../ios/App/App/Info.plist', import.meta.url), 'utf8');
  const webManifest = readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8');
  const javaVersion = readFileSync(new URL('../.java-version', import.meta.url), 'utf8').trim();
  const wrapper = readFileSync(new URL('../android/gradle/wrapper/gradle-wrapper.properties', import.meta.url), 'utf8');

  assert.match(iosInfo, /UIInterfaceOrientationLandscapeLeft/);
  assert.match(iosInfo, /UIInterfaceOrientationLandscapeRight/);
  assert.doesNotMatch(webManifest, /"orientation"\s*:/);
  assert.equal(javaVersion, '21');
  assert.match(wrapper, /distributionSha256Sum=b84e04fa845fecba48551f425957641074fcc00a88a84d2aae5808743b35fc85/);
});

test('AdMob 앱 인증용 app-ads.txt가 공식 게시자 정보를 노출한다', () => {
  const appAds = readFileSync(new URL('../public/app-ads.txt', import.meta.url), 'utf8').trim();
  assert.equal(appAds, 'google.com, pub-8700977029674142, DIRECT, f08c47fec0942fa0');
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

test('계정 삭제는 앱 내부의 이중 확인과 인증된 서버 삭제 경로를 제공한다', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../src/profile-service.js', import.meta.url), 'utf8');
  const functions = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');

  assert.match(html, /id="deleteAccountButton"/);
  assert.equal(main.match(/globalThis\.confirm\(/g)?.length, 3);
  assert.match(service, /httpsCallable\(functions, 'preparePlayerAccountDeletion'/);
  assert.match(service, /httpsCallable\(functions, 'requestPlayerAccountDeletion'/);
  assert.match(functions, /export const processPlayerAccountDeletion = onDocumentCreated/);
  assert.match(functions, /getAuth\(\)\.deleteUser\(uid\)/);
  assert.match(functions, /collectionGroup\('scores'\)\.where\('uid', '==', uid\)/);
  assert.match(functions, /best_scores\/\$\{uid\}/);
  assert.match(functions, /ranked_energy\/\$\{uid\}/);
  assert.match(functions, /account_deletion_requests\/\$\{uid\}/);
  assert.doesNotMatch(functions, /Player account deleted', \{uid\}/);
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
