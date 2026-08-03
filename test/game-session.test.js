import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_MODES,
  PLATFORMS,
  createRunSnapshot,
  detectPlatform,
  getKstDay,
  getKstSeason,
  isValidRunSnapshot,
  readRunSnapshot,
  saveRunSnapshot,
} from '../src/game-session.js';

function state() {
  const piece = {
    type:'T', x:3, y:0, rotation:0,
    cells:[
      {x:1,y:0,color:0,event:null},
      {x:0,y:1,color:1,event:null},
      {x:1,y:1,color:2,event:null},
      {x:2,y:1,color:3,event:null},
    ],
  };
  return {
    mode:GAME_MODES.PRACTICE,
    platform:PLATFORMS.APP,
    board:Array.from({length:20}, () => Array(10).fill(null)),
    eventBoard:Array.from({length:20}, () => Array(10).fill(null)),
    active:piece,
    queue:[],
    hold:null,
    holdUsed:false,
    score:0,
    level:1,
    lines:0,
    shapeBag:[],
    colorBag:[],
    piecesSinceMono:0,
    piecesSpawned:1,
    specialRewards:{bomb:false, arrow:false},
    reactorCharge:0,
    reactorPower:0,
    maxChain:0,
    lockTimer:0,
    lockResets:0,
  };
}

test('KST 날짜와 월간 시즌을 UTC 경계에서 계산한다', () => {
  const date = new Date('2026-07-31T15:05:00Z');
  assert.equal(getKstDay(date), '2026-08-01');
  assert.equal(getKstSeason(date), '2026-08');
});

test('네이티브 앱과 웹 플랫폼을 구분한다', () => {
  assert.equal(detectPlatform({native:true}), PLATFORMS.APP);
  assert.equal(detectPlatform({coarsePointer:true}), PLATFORMS.WEB);
  assert.equal(detectPlatform({touchPoints:1}), PLATFORMS.WEB);
  assert.equal(detectPlatform({}), PLATFORMS.WEB);
});

test('게임 스냅샷을 저장하고 7일 안에 복구한다', () => {
  const values = new Map();
  const storage = {
    getItem:key => values.get(key) ?? null,
    setItem:(key, value) => values.set(key, value),
    removeItem:key => values.delete(key),
  };
  const now = Date.UTC(2026, 6, 25);
  const snapshot = saveRunSnapshot(state(), storage, now);
  assert.equal(isValidRunSnapshot(snapshot, now), true);
  assert.equal(readRunSnapshot(storage, now + 1000).state.mode, GAME_MODES.PRACTICE);
});

test('오래되거나 보드 크기가 잘못된 스냅샷은 폐기한다', () => {
  const now = Date.UTC(2026, 6, 25);
  const old = createRunSnapshot(state(), now - 8 * 24 * 60 * 60 * 1000);
  const malformed = createRunSnapshot({...state(), board:[]}, now);
  assert.equal(isValidRunSnapshot(old, now), false);
  assert.equal(isValidRunSnapshot(malformed, now), false);
});

test('조작된 점수와 이벤트 값이 있는 스냅샷은 폐기한다', () => {
  const now = Date.UTC(2026, 6, 25);
  const forgedScore = createRunSnapshot({...state(), score:1_000_000_000}, now);
  const forgedEventState = state();
  forgedEventState.eventBoard[19][0] = 'instant-win';
  const forgedEvent = createRunSnapshot(forgedEventState, now);
  assert.equal(isValidRunSnapshot(forgedScore, now), false);
  assert.equal(isValidRunSnapshot(forgedEvent, now), false);
});
