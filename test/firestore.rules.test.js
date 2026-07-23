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
    name: 'BOMB A', score: 120, level: 2,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
});

test('본인 최고 점수보다 높은 기록만 갱신할 수 있다', { skip: !emulatorEnabled }, async () => {
  const createdAt = Timestamp.now();
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'best_scores/player-b'), {
      name: 'BOMB B', score: 200, level: 3,
      createdAt, updatedAt: Timestamp.now(),
    });
  });
  const db = environment.authenticatedContext('player-b').firestore();
  const scoreRef = doc(db, 'best_scores/player-b');
  await assertFails(setDoc(scoreRef, {
    name: 'BOMB B', score: 199, level: 3,
    createdAt, updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(setDoc(scoreRef, {
    name: 'BOMB B', score: 201, level: 4,
    createdAt, updatedAt: serverTimestamp(),
  }));
});

test('다른 UID 쓰기와 미인증·무제한 순위 조회를 차단한다', { skip: !emulatorEnabled }, async () => {
  const playerDb = environment.authenticatedContext('player-c').firestore();
  await assertFails(setDoc(doc(playerDb, 'best_scores/player-d'), {
    name: 'BOMB C', score: 500, level: 4,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  }));
  await assertFails(getDocs(collection(environment.unauthenticatedContext().firestore(), 'best_scores')));
  await assertFails(getDocs(collection(playerDb, 'best_scores')));
  await assertFails(getDocs(query(collection(playerDb, 'best_scores'), limit(51))));
  await assertSucceeds(getDocs(query(collection(playerDb, 'best_scores'), limit(50))));
  assert.ok(true);
});
