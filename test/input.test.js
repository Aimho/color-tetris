import test from 'node:test';
import assert from 'node:assert/strict';
import { actionForKey, CANVAS_NATIVE_UI_EVENTS, canStartPointerGesture, dragStepTarget, installCanvasInputGuards, suppressNativeCanvasUi } from '../src/input.js';

test('웹 키보드의 일반적인 회전 키를 모두 정규화한다', () => {
  for (const event of [
    { code: 'ArrowUp', key: 'ArrowUp' },
    { code: 'KeyW', key: 'w' },
    { code: 'KeyX', key: 'x' },
    { code: 'KeyZ', key: 'z' },
    { code: '', key: 'W' },
  ]) assert.equal(actionForKey(event), 'rotate');
});

test('알 수 없는 키는 게임 입력으로 처리하지 않는다', () => {
  assert.equal(actionForKey({ code: 'KeyQ', key: 'q' }), null);
});

test('드래그 이동은 셀 경계의 72%를 넘을 때 한 칸씩 증가한다', () => {
  assert.equal(dragStepTarget(24, 34), 0);
  assert.equal(dragStepTarget(25, 34), 1);
  assert.equal(dragStepTarget(-25, 34), -1);
  assert.equal(dragStepTarget(59, 34), 2);
});

test('모바일 제스처는 첫 번째 포인터 하나만 시작할 수 있다', () => {
  assert.equal(canStartPointerGesture({ pointerType: 'touch', isPrimary: true }), true);
  assert.equal(canStartPointerGesture({ pointerType: 'touch', isPrimary: false }), false);
  assert.equal(canStartPointerGesture({ pointerType: 'touch', isPrimary: true }, { id: 1 }), false);
  assert.equal(canStartPointerGesture({ pointerType: 'mouse', isPrimary: true }), false);
});

test('캔버스의 브라우저 기본 터치 UI를 취소한다', () => {
  let prevented = false;
  suppressNativeCanvasUi({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});

test('게임을 방해하는 캔버스 기본 동작을 모두 차단 대상으로 관리한다', () => {
  for (const eventType of [
    'contextmenu', 'selectstart', 'dragstart', 'dragover', 'drop',
    'dblclick', 'auxclick', 'mousedown', 'wheel',
    'touchstart', 'touchmove',
    'gesturestart', 'gesturechange', 'gestureend', 'webkitmouseforcewillbegin',
  ]) assert.ok(CANVAS_NATIVE_UI_EVENTS.includes(eventType), eventType);
});

test('캔버스 입력 차단은 한 번에 설치하고 해제할 수 있다', () => {
  const listeners = new Map();
  const target = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const uninstall = installCanvasInputGuards(target);
  assert.equal(listeners.size, CANVAS_NATIVE_UI_EVENTS.length);
  uninstall();
  assert.equal(listeners.size, 0);
});
