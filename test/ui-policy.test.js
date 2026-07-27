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

test('랭킹 도전을 누르면 서버 응답을 기다리기 전에 게임 화면으로 전환한다', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const startSelectedMode = main.match(/async function startSelectedMode\(mode\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  const enterGameIndex = startSelectedMode.indexOf("document.body.classList.add('playing')");
  const awaitRankedIndex = startSelectedMode.indexOf("await import('./ranked-service.js')");

  assert.notEqual(enterGameIndex, -1);
  assert.notEqual(awaitRankedIndex, -1);
  assert.ok(enterGameIndex < awaitRankedIndex);
  assert.match(startSelectedMode, /startRankedRun\(\{platform:inputPlatform\}\)/);
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

test('게임 HUD는 일시정지와 리액터 퍼센트만 직접 제공한다', async () => {
  const [html, main] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="pauseButton"/);
  assert.match(html, /id="resumeHelpButton"/);
  assert.match(html, /id="reactorHudValue">0%/);
  assert.doesNotMatch(html, /id="helpButton"|id="soundButton"|id="chain"|id="runModeStatus"/);
  assert.doesNotMatch(`${html}\n${main}`, /reactorInstruction|POWER \$\{reactorPower\}/);
});
