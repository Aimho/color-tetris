import test from 'node:test';
import assert from 'node:assert/strict';
import { isNativeRuntime, setupPwa } from '../src/pwa.js';

test('Capacitor 네이티브 런타임에서는 서비스 워커를 등록하지 않는다', () => {
  let loadRegistered = false;
  const scope = {
    Capacitor: { isNativePlatform: () => true },
    navigator: { serviceWorker: { register: () => Promise.resolve() } },
    addEventListener: () => { loadRegistered = true; },
  };
  assert.equal(isNativeRuntime(scope), true);
  setupPwa(scope);
  assert.equal(loadRegistered, false);
});

test('웹 런타임에서는 로드 시 서비스 워커 등록을 준비한다', () => {
  let loadHandler;
  let registeredPath;
  const scope = {
    location: { protocol: 'https:' },
    navigator: { serviceWorker: { register: path => { registeredPath = path; return Promise.resolve(); } } },
    addEventListener: (event, handler) => {
      if (event === 'load') loadHandler = handler;
    },
  };
  setupPwa(scope);
  loadHandler();
  assert.equal(registeredPath, '/sw.js');
});
