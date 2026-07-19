import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioContext, getAudioContextClass, resumeIfSuspended, unlockAudioContext } from '../src/audio.js';

test('iOS Safari의 webkitAudioContext를 대체 구현으로 사용한다', () => {
  class WebkitAudioContext {}
  assert.equal(getAudioContextClass({webkitAudioContext:WebkitAudioContext}), WebkitAudioContext);
});

test('모바일에서 정지된 오디오 컨텍스트를 재개한다', async () => {
  let resumed=0;
  await resumeIfSuspended({state:'suspended',resume:async()=>{resumed++;}});
  assert.equal(resumed,1);
});

test('iOS의 interrupted 오디오 컨텍스트도 재개한다', async () => {
  let resumed=0;
  await resumeIfSuspended({state:'interrupted',resume:async()=>{resumed++;}});
  assert.equal(resumed,1);
});

test('오디오 컨텍스트 생성 실패는 무음 모드로 안전하게 처리한다', () => {
  class BrokenAudioContext { constructor(){ throw new Error('unavailable'); } }
  assert.equal(createAudioContext({AudioContext:BrokenAudioContext}),null);
});

test('Safari 잠금 해제는 사용자 동작 안에서 무음 소스를 즉시 시작한다', async () => {
  let started = 0;
  const context = {
    state: 'suspended', sampleRate: 48000, destination: {},
    resume: async () => { context.state = 'running'; },
    createBuffer: () => ({}),
    createBufferSource: () => ({ connect() { return this; }, start() { started++; } }),
  };
  assert.equal(await unlockAudioContext(context), true);
  assert.equal(started, 1);
});

test('종료된 컨텍스트는 Safari 잠금 해제를 시도하지 않는다', async () => {
  assert.equal(await unlockAudioContext({state:'closed'}), false);
});
