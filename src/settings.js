export const SETTINGS_KEY = 'color-bomb-settings-v1';

export const DEFAULT_SETTINGS = Object.freeze({
  bgm:true,
  effects:true,
  vibration:true,
  shake:'normal',
  particles:'normal',
  reducedMotion:'system',
  colorAssist:false,
  dragSensitivity:'normal',
});

const LEVELS = new Set(['low', 'normal', 'high']);
const MOTION = new Set(['system', 'reduce']);

export function normalizeSettings(value = {}) {
  return {
    bgm:value.bgm !== false,
    effects:value.effects !== false,
    vibration:value.vibration !== false,
    shake:LEVELS.has(value.shake) ? value.shake : DEFAULT_SETTINGS.shake,
    particles:LEVELS.has(value.particles) ? value.particles : DEFAULT_SETTINGS.particles,
    reducedMotion:MOTION.has(value.reducedMotion) ? value.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
    colorAssist:Boolean(value.colorAssist),
    dragSensitivity:LEVELS.has(value.dragSensitivity)
      ? value.dragSensitivity
      : DEFAULT_SETTINGS.dragSensitivity,
  };
}

export function readSettings(storage = globalThis.localStorage) {
  try {
    return normalizeSettings(JSON.parse(storage?.getItem(SETTINGS_KEY) || '{}'));
  } catch {
    return {...DEFAULT_SETTINGS};
  }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  const normalized = normalizeSettings(settings);
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(normalized)); } catch { /* private mode */ }
  return normalized;
}

export function dragSensitivityScale(value) {
  return {low:1.25, normal:1, high:.78}[value] || 1;
}

export function particleScale(value) {
  return {low:.55, normal:1, high:1.4}[value] || 1;
}

export function shakeScale(value) {
  return {low:.45, normal:1, high:1.35}[value] || 1;
}
