import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

test('단일 앱 랭킹 라벨은 보조 정보 위계로 표시한다', () => {
  const labelRule = css.match(/\.ranking-platform-label\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(labelRule, /color:\s*var\(--muted\)\s*;/);
  assert.match(labelRule, /letter-spacing:\s*\.16em\s*;/);
});

test('랭킹 목록은 로딩 여부와 무관하게 고정된 반응형 높이를 사용한다', () => {
  const listRule = css.match(/\.home-ranking ol\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(listRule, /height:\s*clamp\(216px,\s*calc\(var\(--viewport-height\) \* \.43\),\s*340px\)\s*;/);
  assert.doesNotMatch(listRule, /max-height:/);
});

test('구형 Android WebView는 HEX 색상을 사용하고 최신 엔진만 OKLCH를 덮어쓴다', () => {
  const rootRule = css.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(rootRule, /--acid:\s*#[0-9a-f]{6};/i);
  assert.doesNotMatch(rootRule, /oklch\(/);
  assert.match(css, /@supports\s*\(color:\s*oklch\(50% 0 0\)\)/);
  assert.match(css, /@supports[\s\S]*--acid:\s*oklch\(/);
});
