import { expect, test } from '@playwright/test';

function collectRuntimeErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function openPractice(page) {
  await page.goto('/');
  await page.locator('#startButton').click();
  if (await page.locator('#tutorial').isVisible()) {
    await page.locator('#tutorialClose').click();
  }
  await expect(page.locator('body')).toHaveClass(/playing/);
  await expect(page.locator('#gameCanvas')).toBeVisible();
}

test('홈 화면은 기기 너비를 넘지 않고 핵심 진입점을 표시한다', async ({page}) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto('/');

  await expect(page.locator('#startButton')).toBeVisible();
  await expect(page.locator('#homeHelpButton')).toBeVisible();
  await expect(page.locator('#profileButton')).toBeVisible();
  await expect(page.locator('#settingsButton')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(runtimeErrors).toEqual([]);
});

test('연습 게임을 시작하고 일시정지 후 계속할 수 있다', async ({page}) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await openPractice(page);

  await page.locator('#pauseButton').click();
  await expect(page.locator('#resumeDialog')).toBeVisible();
  await page.locator('#resumeButton').click();
  await expect(page.locator('#resumeDialog')).toBeHidden();
  await expect(page.locator('#gameCanvas')).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test('백그라운드 freeze 이후 복귀하면 계속하기 화면을 제공한다', async ({page}) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await openPractice(page);

  await page.evaluate(() => {
    document.dispatchEvent(new Event('freeze'));
    document.dispatchEvent(new Event('resume'));
  });
  await expect(page.locator('#resumeDialog')).toBeVisible();
  await page.locator('#resumeButton').click();
  await expect(page.locator('#resumeDialog')).toBeHidden();
  expect(runtimeErrors).toEqual([]);
});

test('설정과 게임 방법 패널을 열고 닫을 수 있다', async ({page}) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await page.goto('/');

  await page.locator('#settingsButton').click();
  await expect(page.locator('#settingsPanel')).toBeVisible();
  await page.locator('#settingsPanel .panel-close').click();
  await expect(page.locator('#settingsPanel')).toBeHidden();
  await page.locator('#homeHelpButton').click();
  await expect(page.locator('#tutorial')).toBeVisible();
  await page.locator('#tutorialDismiss').click();
  await expect(page.locator('#tutorial')).toBeHidden();
  expect(runtimeErrors).toEqual([]);
});

test('게임 보드의 드래그와 탭 입력이 브라우저 UI 없이 처리된다', async ({page}) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await openPractice(page);

  const canvas = page.locator('#gameCanvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 5;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + box.width / 5, startY, {steps:5});
  await page.mouse.up();
  await page.mouse.click(startX, startY);
  await expect(page.locator('#gestureHint')).toContainText(/이동|회전/);
  expect(runtimeErrors).toEqual([]);
});
