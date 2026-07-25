import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';

const emulatorEnabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let environment;

before(async () => {
  if (!emulatorEnabled) return;
  environment = await initializeTestEnvironment({
    projectId: 'color-bomb-rules-test',
    firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});

after(async () => {
  await environment?.cleanup();
});

test('인증 UID 문서에는 최초 최고 점수를 기록할 수 있다', { skip: !emulatorEnabled }, async () => {
  const db = environment.authenticatedContext('player-a').firestore();
  await assertSucceeds(setDoc(doc(db, 'best_scores/player-a'), {
    name: 'BOMB A', score: 120, level: 2, ruleVersion: 2,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
});

test('본인 최고 점수보다 높은 기록만 갱신할 수 있다', { skip: !emulatorEnabled }, async () => {
  const createdAt = Timestamp.now();
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'best_scores/player-b'), {
      name: 'BOMB B', score: 200, level: 3, ruleVersion: 2,
      createdAt, updatedAt: Timestamp.now(),
    });
  });
  const db = environment.authenticatedContext('player-b').firestore();
  const scoreRef = doc(db, 'best_scores/player-b');
  await assertFails(setDoc(scoreRef, {
    name: 'BOMB B', score: 199, level: 3, ruleVersion: 2,
    createdAt, updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(setDoc(scoreRef, {
    name: 'BOMB B', score: 201, level: 4, ruleVersion: 2,
    createdAt, updatedAt: serverTimestamp(),
  }));
});

test('다른 UID 쓰기와 미인증·무제한 순위 조회를 차단한다', { skip: !emulatorEnabled }, async () => {
  const playerDb = environment.authenticatedContext('player-c').firestore();
  await assertFails(setDoc(doc(playerDb, 'best_scores/player-d'), {
    name: 'BOMB C', score: 500, level: 4, ruleVersion: 2,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await assertFails(getDocs(collection(environment.unauthenticatedContext().firestore(), 'best_scores')));
  await assertFails(getDocs(collection(playerDb, 'best_scores')));
  await assertFails(getDocs(query(collection(playerDb, 'best_scores'), limit(51))));
  await assertSucceeds(getDocs(query(collection(playerDb, 'best_scores'), limit(50))));
  assert.ok(true);
});

test('현재 규칙과 다른 버전으로 점수를 위장할 수 없다', { skip: !emulatorEnabled }, async () => {
  const db = environment.authenticatedContext('player-version').firestore();
  await assertFails(setDoc(doc(db, 'best_scores/player-version'), {
    name: 'BOMB V', score: 900, level: 9, ruleVersion: 999,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
});

test('랭킹 실행권과 시즌 점수는 클라이언트가 직접 쓸 수 없다', { skip: !emulatorEnabled }, async () => {
  const db = environment.authenticatedContext('ranked-player').firestore();
  await assertFails(setDoc(doc(db, 'ranked_runs/fake-run'), {
    uid:'ranked-player', status:'active',
  }));
  await assertFails(setDoc(doc(db, 'ranked_attempt_usage/ranked-player_2026-07-25'), {
    uid:'ranked-player', used:0,
  }));
  await assertFails(setDoc(doc(db, 'ranked_run_requests/ranked-player_request'), {
    runId:'fake-run',
  }));
  await assertFails(setDoc(doc(db, 'ranked_submissions/fake-run'), {
    uid:'ranked-player', score:999999,
  }));
  await assertFails(setDoc(doc(db, 'season_rankings/2026-07_mobile/scores/ranked-player'), {
    uid:'ranked-player', score:999999,
  }));
});

test('프로필은 본인만 읽고 닉네임 예약과 프로필 쓰기는 서버만 수행한다', { skip: !emulatorEnabled }, async () => {
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'player_profiles/alice'), {nickname:'졸린폭탄007'});
  });
  const alice = environment.authenticatedContext('alice').firestore();
  const bob = environment.authenticatedContext('bob').firestore();
  await assertSucceeds(getDoc(doc(alice, 'player_profiles/alice')));
  await assertFails(getDoc(doc(bob, 'player_profiles/alice')));
  await assertFails(setDoc(doc(alice, 'player_profiles/alice'), {nickname:'바꾼폭탄001'}));
  await assertFails(setDoc(doc(alice, 'nickname_reservations/abc'), {uid:'alice'}));
});
