import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
  assert.match(main, /status\.energy\s*\?\s*'에너지 충전 중 <span>⚡<\/span>'\s*:\s*'랭킹 점검 중 <span>◆<\/span>'/);
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

test('랭킹 시작 API는 기존 UUID 문자열 호출과 새 플랫폼 객체 호출을 모두 지원한다', async () => {
  const client = await readFile(new URL('../src/ranked-service.js', import.meta.url), 'utf8');
  assert.match(client, /export async function startRankedRun\(options = \{\}\)/);
  assert.match(client, /typeof options === 'string'\s*\? \{requestId:options\}/);
  assert.match(client, /startRun\(\{requestId, platform\}\)/);
});

test('홈 랭킹은 현재 기기의 터치 플랫폼 버킷을 기본 조회한다', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /const inputPlatform = detectPlatform\(/);
  assert.match(main, /const rankedRuntimePlatform = inputPlatform;/);
  assert.match(main, /function openHomeRanking\(\) \{\s*rankingPlatform = rankedRuntimePlatform;/);
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
  assert.match(startSelectedMode, /startRankedRun\(\{platform:inputPlatform\}\)/);
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

test('닉네임 변경은 현재 시즌의 모바일·데스크탑 랭킹 이름에도 반영한다', async () => {
  const server = await readFile(new URL('../functions/index.js', import.meta.url), 'utf8');
  const updatePlayerNickname = server.match(
    /export const updatePlayerNickname = onCall\(OPTIONS, async request => \{([\s\S]*?)\n\}\);/,
  )?.[1] ?? '';

  assert.match(updatePlayerNickname, /getKstSeason\(now\.toDate\(\)\)/);
  assert.match(server, /season_rankings\/\$\{season\}_mobile\/scores\/\$\{uid\}/);
  assert.match(server, /season_rankings\/\$\{season\}_desktop\/scores\/\$\{uid\}/);
  assert.match(updatePlayerNickname, /transaction\.update\(currentScoreRefs\[index\], \{name:nickname/);
  assert.match(server, /syncCurrentRankingNames\(uid, profile\.nickname\)/);
});

test('게임오버는 홈 전용 랭킹 도전 버튼을 표시하지 않는다', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const endGame = main.match(/function endGame\(\) \{([\s\S]*?)\n\}/)?.[1] ?? '';

  assert.match(endGame, /rankedStartButton\.hidden = true;/);
  assert.match(endGame, /rankingButton\.hidden = true;/);
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

test('홈은 서버 기준 랭킹 에너지와 충전 대기 UI를 표시한다', async () => {
  const [html, main, service] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ranked-service.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="rankedEnergyValue">⚡ — \/ 3/);
  assert.match(html, /id="rankedEnergyActions" hidden/);
  assert.match(html, /광고 보고 \+1/);
  assert.match(main, /다음 충전까지 \$\{formatEnergyCountdown\(energy\.remainingMs\)\}/);
  assert.match(main, /에너지 충전 중 <span>⚡<\/span>/);
  assert.match(service, /httpsCallable\(functions, 'getRankedEnergy'/);
});
