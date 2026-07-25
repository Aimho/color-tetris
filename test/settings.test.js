import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  dragSensitivityScale,
  normalizeSettings,
  particleScale,
  readSettings,
  saveSettings,
  shakeScale,
} from '../src/settings.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem:key => values.get(key) ?? null,
    setItem:(key, value) => values.set(key, value),
  };
}

test('설정은 잘못된 값을 안전한 기본값으로 복구한다', () => {
  assert.deepEqual(normalizeSettings({shake:'maximum',bgm:false}), {
    ...DEFAULT_SETTINGS,
    bgm:false,
  });
});

test('설정은 저장 후 앱 재실행에서도 유지된다', () => {
  const storage = memoryStorage();
  saveSettings({...DEFAULT_SETTINGS,colorAssist:true,particles:'high'}, storage);
  assert.equal(readSettings(storage).colorAssist, true);
  assert.equal(readSettings(storage).particles, 'high');
});

test('감도와 시각 효과 단계는 수치 배율로 변환된다', () => {
  assert.ok(dragSensitivityScale('high') < dragSensitivityScale('low'));
  assert.ok(particleScale('high') > particleScale('low'));
  assert.ok(shakeScale('high') > shakeScale('low'));
});
