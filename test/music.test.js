import test from 'node:test';
import assert from 'node:assert/strict';
import { getMusicProfile } from '../src/music.js';

test('레벨 구간에 따라 배경음 템포가 상승한다', () => {
  assert.equal(getMusicProfile(1).bpm, 84);
  assert.equal(getMusicProfile(5).bpm, 104);
  assert.equal(getMusicProfile(10).bpm, 124);
  assert.equal(getMusicProfile(15).bpm, 144);
  assert.equal(getMusicProfile(20).bpm, 144);
});

test('높은 레벨에서는 음표 밀도와 긴장 레이어가 증가한다', () => {
  const calm = getMusicProfile(1);
  const urgent = getMusicProfile(15);
  assert.ok(urgent.pulseEvery < calm.pulseEvery);
  assert.ok(urgent.hatEvery > 0);
  assert.equal(urgent.tension, true);
});

test('리액터 모드는 레벨과 무관하게 더 빠르고 강한 전용 프로필을 사용한다', () => {
  const reactor = getMusicProfile(1, true);
  assert.equal(reactor.reactor, true);
  assert.ok(reactor.bpm > getMusicProfile(20).bpm);
  assert.equal(reactor.pulseEvery, 1);
});
