import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('구형 Android WebView에서도 게임 화면 높이에 vh 폴백을 사용한다', async () => {
  const style = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');

  assert.match(style, /:root\s*\{[^}]*--viewport-height:\s*100vh/);
  assert.match(style, /@supports\s*\(height:\s*100dvh\)\s*\{\s*:root\s*\{\s*--viewport-height:\s*100dvh/);
  assert.match(style, /body\.playing \.game-shell\s*\{[\s\S]*?height:\s*var\(--viewport-height\)/);
  assert.match(style, /body\.playing \.board-frame\s*\{[\s\S]*?var\(--viewport-height\)/);
  assert.match(style, /\.home-ranking ol\s*\{[^}]*calc\(var\(--viewport-height\) \* \.43\)/);
  assert.equal(style.match(/\d+dvh/g)?.join(','), '100dvh,100dvh');
});

test('랭킹 초기 상태는 준비 중 대신 로딩 중으로 안내한다', async () => {
  const [html, main] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /로딩 중…/);
  assert.match(main, /로딩 중…/);
  assert.doesNotMatch(`${html}\n${main}`, /랭킹 준비 중/);
});

test('에너지 응답이 없으면 충전 중으로 오인시키지 않는다', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /!status\.ready \|\| !serverProfile/);
  assert.match(main, /'랭킹 점검 중 <span>◆<\/span>'/);
  assert.match(main, /랭킹 연결 실패 <span>◆<\/span>/);
});

test('랭킹 도전은 Google 연결을 강제하지 않고 익명 UID를 사용한다', async () => {
  const [client, server] = await Promise.all([
    readFile(new URL('../src/ranked-service.js', import.meta.url), 'utf8'),
    readFile(new URL('../functions/index.js', import.meta.url), 'utf8'),
  ]);
  assert.match(client, /await ensureAuthUser\(\);\s*const result = await startRun/);
  assert.doesNotMatch(client, /startRankedRun[\s\S]{0,220}connectGoogleAccount/);
  assert.doesNotMatch(server, /sign_in_provider === 'anonymous'/);
});

test('Android Google 연결은 웹 팝업 대신 네이티브 ID 토큰을 기존 익명 계정에 연결한다', async () => {
  const client = await readFile(new URL('../src/ranked-service.js', import.meta.url), 'utf8');
  assert.match(client, /Capacitor\.getPlatform\(\) === 'android'/);
  assert.match(client, /FirebaseAuthentication\.signInWithGoogle\(\{skipNativeAuth:true\}\)/);
  assert.match(client, /GoogleAuthProvider\.credential\(idToken\)/);
  assert.match(client, /linkWithCredential\(auth\.currentUser, credential\)/);
  assert.match(client, /현재 랭킹 데이터를 보호하기 위해 계정을 전환하지 않았습니다/);
  assert.doesNotMatch(client, /credential-already-in-use'[\s\S]{0,160}signInWithCredential/);
});

test('랭킹 시작 API는 기존 UUID 문자열 호출과 새 플랫폼 객체 호출을 모두 지원한다', async () => {
  const client = await readFile(new URL('../src/ranked-service.js', import.meta.url), 'utf8');
  assert.match(client, /export async function startRankedRun\(options = \{\}\)/);
  assert.match(client, /typeof options === 'string'\s*\? \{requestId:options\}/);
  assert.match(client, /startRun\(\{requestId\}\)/);
});

test('홈 랭킹은 앱 랭킹 버킷만 조회한다', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /const rankedRuntimePlatform = 'app';/);
  assert.match(main, /loadTopScores\(rankedRuntimePlatform\)/);
});

test('저장된 게임을 버리고 홈으로 돌아오면 랭킹 버튼 상태를 다시 불러온다', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const discardSavedRun = main.match(/function discardSavedRun\(\) \{([\s\S]*?)\n\}/)?.[1] ?? '';

  assert.match(discardSavedRun, /rankedStartGuard\.cancel\(\)/);
  assert.match(discardSavedRun, /refreshRankedAvailability\(\)/);
});

test('랭킹 도전을 누르면 서버 응답을 기다리는 동안 이전 보드를 로딩 UI로 가린다', async () => {
  const [html, main] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  ]);
  const startSelectedMode = main.match(/async function startSelectedMode\(mode\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  const enterGameIndex = startSelectedMode.indexOf("document.body.classList.add('playing')");
  const showLoadingIndex = startSelectedMode.indexOf('setRankedLoading(true)');
  const awaitRankedIndex = startSelectedMode.indexOf("import('./ranked-service.js')");

  assert.match(html, /id="rankedLoading"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
  assert.notEqual(enterGameIndex, -1);
  assert.notEqual(showLoadingIndex, -1);
  assert.notEqual(awaitRankedIndex, -1);
  assert.ok(enterGameIndex < awaitRankedIndex);
  assert.ok(showLoadingIndex < awaitRankedIndex);
  assert.match(startSelectedMode, /Promise\.all\(\[\s*import\('\.\/ranked-service\.js'\),\s*getLeaderboardApi\(\),\s*\]\)/);
  assert.match(startSelectedMode, /startRankedRun\(\)/);
  assert.match(main, /function reset[\s\S]*?setRankedLoading\(false\)/);
  assert.match(main, /function returnHome[\s\S]*?setRankedLoading\(false\)/);
});

test('배포 중 사라진 동적 청크는 최신 앱으로 새로고침한다', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /addEventListener\('vite:preloadError', event => \{/);
  assert.match(main, /event\.preventDefault\(\);\s*location\.reload\(\);/);
});

test('랭킹 기록의 이름은 클라이언트 입력이 아닌 예약 프로필을 사용한다', async () => {
  const [client, server] = await Promise.all([
    readFile(new URL('../src/ranked-service.js', import.meta.url), 'utf8'),
    readFile(new URL('../functions/index.js', import.meta.url), 'utf8'),
  ]);
  assert.match(server, /const playerProfile = await getOrCreateProfile\(uid\)/);
  assert.match(server, /const name = playerProfile\.nickname/);
  assert.doesNotMatch(client, /submitRun\(\{runId,\s*name,/);
});

test('랭킹 제출도 등록된 네이티브 앱 플랫폼만 허용한다', async () => {
  const server = await readFile(new URL('../functions/index.js', import.meta.url), 'utf8');
  const submit = server.match(
    /export const submitRankedRun = onCall\(OPTIONS, async request => \{([\s\S]*?)\n\}\);/,
  )?.[1] ?? '';

  assert.match(submit, /const platform = safeAppPlatform\(request\.app\?\.appId\)/);
  assert.match(submit, /initialRun\.platform !== platform/);
});

test('랭킹 제출은 비동기 처리 중 초기화될 수 있는 전역 세션을 다시 읽지 않는다', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const submitCompletedRankedRun = main.match(
    /async function submitCompletedRankedRun\(resultRunId, finalScore, finalLevel\) \{([\s\S]*?)\n\}/,
  )?.[1] ?? '';

  assert.match(submitCompletedRankedRun, /const session = rankedSession;/);
  assert.match(submitCompletedRankedRun, /const ledger = completedRunLedger;/);
  assert.match(submitCompletedRankedRun, /submitRankedRun\(session\.runId, ledger\)/);
  assert.match(submitCompletedRankedRun, /loadTopScores\(session\.platform, session\.season\)/);
  assert.doesNotMatch(submitCompletedRankedRun, /rankedSession\?*\.season/);
});

test('닉네임 변경은 현재 시즌의 앱 랭킹 이름에도 반영한다', async () => {
  const server = await readFile(new URL('../functions/index.js', import.meta.url), 'utf8');
  const updatePlayerNickname = server.match(
    /export const updatePlayerNickname = onCall\(OPTIONS, async request => \{([\s\S]*?)\n\}\);/,
  )?.[1] ?? '';

  assert.match(updatePlayerNickname, /getKstSeason\(now\.toDate\(\)\)/);
  assert.match(server, /season_rankings\/\$\{season\}_app\/scores\/\$\{uid\}/);
  assert.match(updatePlayerNickname, /transaction\.update\(currentScoreRefs\[index\], \{name:nickname/);
  assert.match(server, /syncCurrentRankingNames\(uid, profile\.nickname\)/);
});

test('게임오버는 홈 전용 랭킹 도전 버튼을 표시하지 않는다', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const endGame = main.match(/function endGame\(\) \{([\s\S]*?)\n\}/)?.[1] ?? '';

  assert.match(endGame, /rankedStartButton\.hidden = true;/);
  assert.match(endGame, /rankingButton\.hidden = true;/);
  assert.match(endGame, /missionButton\.hidden = true;/);
  assert.match(endGame, /shopButton\.hidden = true;/);
});

test('모바일 Chrome의 freeze·resume·focus 생명주기에서도 게임을 안전하게 중단하고 복귀시킨다', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

  assert.match(main, /document\.addEventListener\('freeze', pauseForInterruption\)/);
  assert.match(main, /document\.addEventListener\('resume', requestResumeAfterInterruption\)/);
  assert.match(main, /window\.addEventListener\('focus', requestResumeAfterInterruption\)/);
});
test('게임 방법은 홈에 있고 게임 중단 팝업에는 계속하기와 홈만 제공한다', async () => {
  const [html, main] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="pauseButton"/);
  assert.match(html, /class="icon-button home-only-action" id="homeHelpButton"[^>]*aria-label="게임 방법 열기"/);
  assert.equal(html.match(/id="homeHelpButton"/g)?.length, 1);
  assert.ok(html.indexOf('id="homeHelpButton"') < html.indexOf('id="profileButton"'));
  assert.ok(html.indexOf('id="profileButton"') < html.indexOf('id="settingsButton"'));
  assert.match(main, /homeHelpButton\.addEventListener\('click', \(\) => openTutorial\(false\)\)/);
  assert.doesNotMatch(`${html}\n${main}`, /resumeHelpButton|openTutorialFromPause|tutorialFromPause/);
  assert.match(html, /id="reactorHudValue">0%/);
  assert.doesNotMatch(html, /id="helpButton"|id="soundButton"|id="chain"|id="runModeStatus"/);
  assert.doesNotMatch(`${html}\n${main}`, /reactorInstruction|POWER \$\{reactorPower\}/);
});

test('시즌 결과는 명시적으로 열고 프로필 로딩에 성공한 뒤에만 확인 처리한다', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const profileHandler = main.match(/profileButton\.addEventListener[\s\S]*?\n\}\);/)?.[0] ?? '';
  const seasonHandler = main.match(/seasonResultButton\.addEventListener[\s\S]*?\n\}\);/)?.[0] ?? '';

  assert.doesNotMatch(profileHandler, /acknowledgeCurrentSeasonResult/);
  assert.match(seasonHandler, /if \(await loadProfilePanel\(\)\) acknowledgeCurrentSeasonResult\(\)/);
});

test('그래픽 테마는 가로 스크롤 카드로 선택한다', async () => {
  const [main, progression, style] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/progression.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/style.css', import.meta.url), 'utf8'),
  ]);

  assert.match(progression, /\{ id: 'default', label: '기본'/);
  assert.match(progression, /\{ id: 'pixel', label: '픽셀'/);
  assert.match(progression, /\{ id: 'neon', label: '네온'/);
  assert.doesNotMatch(progression, /id: 'reactor'|id: 'ember'|id: 'aurora'/);
  assert.match(style, /\.theme-options\s*\{[\s\S]*display: flex[\s\S]*overflow-x: auto[\s\S]*scroll-snap-type: inline mandatory/);
  assert.match(style, /\.theme-options button\s*\{[\s\S]*flex: 0 0 min\(72%, 220px\)/);
  assert.match(main, /theme === 'pixel'/);
  assert.match(main, /theme === 'neon'/);
});

test('홈은 프로필 서버 기준 랭킹 에너지와 통합 랭킹 CTA를 표시한다', async () => {
  const [html, main, service] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ranked-service.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="rankedEnergyValue">⚡ — \/ 3/);
  assert.doesNotMatch(html, /id="rewardedEnergyButton"/);
  assert.match(html, /id="rewardDialog"[^>]*role="dialog"/);
  assert.match(html, /광고 1개를 끝까지 보면 에너지 1개가 충전되고 바로 랭킹 게임을 시작합니다/);
  assert.match(main, /nextProfile\.nextEnergyAt - currentServerTime\(\)/);
  assert.match(main, /nextEnergyRefreshAllowedAt = Date\.now\(\) \+ 30_000/);
  assert.match(main, /후 충전/);
  assert.match(main, /energy > 0 \? '랭킹 도전 <span>◆<\/span>' : '랭킹 도전 <span>⚡<\/span>'/);
  assert.doesNotMatch(service, /httpsCallable\(functions, 'getRankedEnergy'/);
});

test('서버 시계와 구형 WebView에서도 에너지와 상점 테마가 안전하게 표시된다', async () => {
  const [main, functions, style] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../functions/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/style.css', import.meta.url), 'utf8'),
  ]);
  assert.match(functions, /serverNow:Date\.now\(\)/);
  assert.match(main, /serverClockOffsetMs = nextProfile\.serverNow - Date\.now\(\)/);
  assert.match(style, /body\[data-theme="ember"\]\s*\{\s*--acid:\s*#[0-9a-f]+/i);
  assert.match(style, /body\[data-theme="aurora"\]\s*\{\s*--acid:\s*#[0-9a-f]+/i);
  assert.match(style, /@supports \(color: color-mix/);
});

test('홈은 랭킹·미션·상점을 명확히 분리하고 연습을 보조 링크로 제공한다', async () => {
  const [html, style] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/style.css', import.meta.url), 'utf8'),
  ]);
  assert.ok(html.indexOf('id="rankedStartButton"') < html.indexOf('id="startButton"'));
  assert.match(html, /id="missionButton"[^>]*>미션/);
  assert.match(html, /id="shopButton"[^>]*>상점/);
  assert.match(html, /id="startButton"[^>]*>에너지 없이 연습하기/);
  assert.doesNotMatch(html, />LAB</);
  assert.match(style, /#rankedStartButton\s*\{[^}]*flex-basis:\s*100%/);
});

test('에너지 0일 때만 랭킹 CTA에서 광고 확인창을 연다', async () => {
  const [html, main] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(html, /rewardedEnergyButton/);
  assert.match(main, /Number\(serverProfile\?\.rankedEnergy \|\| 0\) > 0/);
  assert.match(main, /openRewardDialog\(\)/);
  assert.match(main, /rewardConfirmButton\.addEventListener\('click', watchRewardedEnergyAndStart\)/);
  assert.match(main, /await startSelectedMode\(GAME_MODES\.RANKED\)/);
});

test('광고 한 편 완료 즉시 에너지를 지급하고 앱 재실행에서도 안전하게 복구한다', async () => {
  const [main, rewarded, functions] = await Promise.all([
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/rewarded-energy.js', import.meta.url), 'utf8'),
    readFile(new URL('../functions/index.js', import.meta.url), 'utf8'),
  ]);
  assert.match(main, /preloadRewardedEnergyAd\(\)/);
  assert.match(main, /rewardedEnergyVerificationPending/);
  assert.match(main, /광고 불러오는 중…/);
  assert.match(main, /에너지 1개가 충전되었습니다/);
  assert.doesNotMatch(main, /rewardStatusDeadline|보상 확인이 지연되고 있습니다/);
  assert.doesNotMatch(main, /serverProfile\?\.rankedEnergy[^\n]*> previous/);
  assert.match(rewarded, /getRewardedEnergyStatus\(stored\.requestId\)/);
  assert.match(rewarded, /status\.status === 'verified'/);
  assert.match(rewarded, /status\.status === 'shown' && stored\.earned/);
  assert.match(rewarded, /status\.status === 'shown'[\s\S]*cancelRewardRequest\(\{requestId:stored\.requestId\}\)/);
  assert.match(rewarded, /rememberPendingReward\(\{\.\.\.request, earned:true\}\)/);
  assert.match(rewarded, /cancelRewardRequest\(\{requestId:stored\.requestId\}\)/);
  assert.match(rewarded, /if \(request\.shown\)/);
  assert.match(rewarded, /export async function prepareRewardedEnergyAd\(\)/);
  assert.match(rewarded, /preparedReward = reward\.awaitingVerification \|\| reward\.alreadyVerified \? null : reward/);
  assert.match(rewarded, /color-bomb:rewarded-energy-pending/);
  assert.match(functions, /getRewardedEnergyRequestStatus/);
  assert.match(functions, /completeRewardedEnergyRequest/);
  assert.match(functions, /const result = await db\.runTransaction/);
  assert.match(functions, /verificationSource:'client-reward-callback'/);
  assert.match(functions, /reward\.status === 'shown' \? 'shown'/);
  assert.match(main, /request\.granted === false \? '사용할 수 있는 에너지가 확인됐습니다\.'/);
  assert.match(functions, /markRewardedEnergyRequestShown/);
  assert.match(functions, /cancelRewardedEnergyRequest/);
  assert.match(rewarded, /cancelRewardRequest\(\{requestId:request\.requestId\}\)/);
  assert.match(rewarded, /completeRewardRequest\(\{requestId:request\.requestId\}\)/);
  assert.match(rewarded, /immediatelyVerified:true/);
  assert.match(rewarded, /onRewardedVideoAdDismissed/);
  assert.match(rewarded, /const rewarded = AdMob\.showRewardVideoAd\(\)\.then/);
  assert.match(rewarded, /Promise\.all\(\[rewarded, dismissed\]\)/);
  assert.match(rewarded, /await waitForAppForeground\(\)/);
  assert.match(rewarded, /CapacitorApp\.getState\(\)/);
  assert.match(rewarded, /dismissedListener\?\.remove/);
  assert.match(rewarded, /request\.alreadyVerified \|\| request\.awaitingVerification/);
  assert.match(main, /function clearRewardedEnergyRetry\(\)/);
  assert.match(main, /Math\.min\(3000, remaining\)/);
});

test('검증된 랭킹 점수를 SPARK로 정산하고 결과 화면에 표시한다', async () => {
  const [html, main, functions] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../functions/index.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="resultSparkReward"/);
  assert.match(html, /id="resultSparkBalance"/);
  assert.match(main, /result\.sparkReward\.toLocaleString\(\)/);
  assert.match(functions, /scoreToSpark\(ledger\.score, earnedToday\)/);
  assert.match(functions, /score_spark_daily/);
  assert.match(functions, /scoreSparkReward:sparkReward/);
});

test('AdMob 네이티브 프록시를 Promise 반환값으로 직접 노출하지 않는다', async () => {
  const rewarded = await readFile(new URL('../src/rewarded-energy.js', import.meta.url), 'utf8');
  const getAdMob = rewarded.match(/async function getAdMob\(\) \{([\s\S]*?)\n\}/)?.[1] ?? '';

  assert.doesNotMatch(getAdMob, /return AdMob;/);
  assert.match(getAdMob, /return \{ AdMob \};/);
  assert.match(rewarded, /const \{ AdMob \} = await getAdMob\(\);/);
});

test('도움말의 하단 시작 버튼은 게임 시작 흐름에서만 보인다', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /tutorialClose\.hidden = !startsGame/);
  assert.match(main, /tutorialClose\.innerHTML = '게임 시작 <span>▶<\/span>'/);
});

test('마이페이지와 LAB은 기록과 보상 기능을 분리한다', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const profile = html.match(/id="profilePanel"[\s\S]*?<\/section>\s*<section class="app-panel" id="labPanel"/)?.[0] ?? '';
  const lab = html.match(/id="labPanel"[\s\S]*?<\/section>\s*<section class="app-panel" id="settingsPanel"/)?.[0] ?? '';
  assert.doesNotMatch(profile, /id="themeOptions"|id="missionList"|id="shopList"/);
  assert.match(lab, /id="shopSparkBalance"/);
  assert.match(lab, /id="missionList"/);
  assert.match(lab, /id="shopList"/);
});

test('상점은 SPARK 잔액과 구매 가능 여부를 명확히 표시한다', async () => {
  const [html, main, server] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../functions/index.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="shopSparkBalance">0 SPARK/);
  assert.match(main, /button\.disabled = !serverProfile \|\| isEquipped \|\| \(!isOwned && !canAfford\)/);
  assert.match(main, /isOwned \? '장착' : `\$\{item\.price\} SPARK`/);
  assert.doesNotMatch(main, /'SPARK 부족'/);
  assert.match(main, /nextProfile = await api\.purchasePlayerItem\(itemId\)/);
  assert.match(main, /dataset\.blockSkin === 'jelly'/);
  assert.match(main, /dataset\.blockSkin === 'prism'/);
  assert.match(server, /const equippedItems = \{\.\.\.profile\.equippedItems, \[item\.slot\]:item\.id\}/);
  assert.match(server, /transaction\.update\(profileRef, \{[\s\S]*equippedItems,/);
});

test('광고 오류는 게임 설명을 덮지 않고 사용자용 Toast로 표시한다', async () => {
  const [html, main] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="appToast"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(main, /showToast\(friendlyAdError\(error\), 'error'\)/);
  assert.doesNotMatch(main, /overlayCopy\.textContent = error\?\.message \|\| '광고를 불러오지 못했습니다\.'/);
});

test('Android 뒤로가기는 열린 화면과 게임을 먼저 처리하고 홈에서 두 번 눌러 종료한다', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /App\.addListener\('backButton'/);
  assert.match(main, /const openPanel = \[profilePanel, labPanel, settingsPanel\]/);
  assert.match(main, /if \(!tutorial\.hidden\)/);
  assert.match(main, /if \(!homeRanking\.hidden\)/);
  assert.match(main, /if \(running\) \{[\s\S]*pauseForInterruption\(\);[\s\S]*requestResumeAfterInterruption\(\)/);
  assert.match(main, /resumeDialogMode === 'restore'\) discardSavedRun\(\)/);
  assert.match(main, /overlay\.classList\.contains\('game-over'\)[\s\S]*returnHome\(\)/);
  assert.match(main, /now - lastAndroidBackAt <= 2000/);
  assert.match(main, /await App\.exitApp\(\)/);
  assert.match(main, /종료하려면 뒤로가기를 한 번 더 누르세요/);
});

test('닉네임이 없는 구버전 프로필은 자동 닉네임으로 마이그레이션한다', async () => {
  const [server, main] = await Promise.all([
    readFile(new URL('../functions/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  ]);
  const getOrCreate = server.match(/async function getOrCreateProfile\(uid\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(getOrCreate, /existing\.exists && normalizeNickname\(existing\.data\(\)\.nickname\)/);
  assert.match(getOrCreate, /transaction\.update\(profileRef, \{nickname, isCustom:false, updatedAt:now\}\)/);
  assert.match(main, /nicknameInput\.value = fallbackName/);
  assert.match(main, /서버에 연결되면 닉네임을 변경할 수 있습니다/);
});
