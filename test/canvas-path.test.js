import test from 'node:test';
import assert from 'node:assert/strict';
import { roundRectPath } from '../src/canvas-path.js';

test('Canvas roundRect가 없는 구형 WebView에서는 기본 경로 API로 대체한다', () => {
  const calls = [];
  const context = new Proxy({}, {
    get(_target, name) {
      if (name === 'roundRect') return undefined;
      return (...args) => calls.push([name, ...args]);
    },
  });

  roundRectPath(context, 10, 20, 40, 30, 8);

  assert.equal(calls[0][0], 'beginPath');
  assert.ok(calls.some(([name]) => name === 'quadraticCurveTo'));
  assert.equal(calls.at(-1)[0], 'closePath');
  assert.ok(!calls.some(([name]) => name === 'roundRect'));
});

test('Canvas roundRect를 지원하면 네이티브 경로를 사용한다', () => {
  const calls = [];
  const context = {
    beginPath: () => calls.push(['beginPath']),
    roundRect: (...args) => calls.push(['roundRect', ...args]),
  };

  roundRectPath(context, 1, 2, 3, 4, 1);

  assert.deepEqual(calls, [
    ['beginPath'],
    ['roundRect', 1, 2, 3, 4, 1],
  ]);
});
