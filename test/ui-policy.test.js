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

test('웹 홈 랭킹은 서버가 기록하는 App Check 플랫폼 버킷을 기본 조회한다', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /function openHomeRanking\(\) \{\s*rankingPlatform = rankedRuntimePlatform;/);
  assert.doesNotMatch(main, /function openHomeRanking\(\) \{\s*rankingPlatform = runPlatform;/);
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
  assert.doesNotMatch(html, /id="helpButton"|id="soundButton"|id="chain"/);
  assert.doesNotMatch(`${html}\n${main}`, /reactorInstruction|POWER \$\{reactorPower\}/);
});
