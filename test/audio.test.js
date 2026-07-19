import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioContext, getAudioContextClass, resumeIfSuspended } from '../src/audio.js';

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
