import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shotDir = join(dirname(fileURLToPath(import.meta.url)), '../e2e/screenshots');
mkdirSync(shotDir, { recursive: true });
mkdirSync('/opt/cursor/artifacts/screenshots', { recursive: true });

async function shot(page, name) {
  const file = `${name}.png`;
  await page.screenshot({ path: join(shotDir, file), fullPage: false });
  await page.screenshot({ path: join('/opt/cursor/artifacts/screenshots', file), fullPage: false });
}

test('unlock sample and capture iPad screens', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('unlock-screen')).toBeVisible();
  await shot(page, '01-unlock');

  await page.getByTestId('unlock-passphrase').fill('wrong');
  await page.getByTestId('unlock-submit').click();
  await expect(page.getByTestId('unlock-error')).toContainText('올바르지 않습니다');

  await page.getByTestId('unlock-passphrase').fill('test1234');
  await page.getByTestId('unlock-submit').click();
  await expect(page.getByTestId('nav-exam')).toBeVisible({ timeout: 45_000 });

  await page.getByTestId('nav-exam').click();
  await page.getByTestId('exam-pilgi').click();
  await page.getByText('2099년', { exact: true }).click();
  await page.getByText('제1회(가상)').click();
  await expect(page.getByTestId('year-exam-screen')).toBeVisible();
  await page.getByTestId('session-start').click();
  await expect(page.getByTestId('play-screen')).toBeVisible();
  await expect(page.locator('.katex').first()).toBeVisible();
  await shot(page, '02-year-exam');
  await page.setViewportSize({ width: 1024, height: 768 });
  await shot(page, '02b-year-exam-landscape');
  await page.setViewportSize({ width: 768, height: 1024 });

  for (let i = 0; i < 5; i++) {
    await page.getByTestId('choice-1').click();
    await page.getByRole('button', { name: '다음' }).click();
  }
  await page.getByTestId('submit-exam').click();
  await expect(page.getByTestId('result-score')).toBeVisible();

  await page.getByTestId('nav-study').click();
  await page.getByTestId('open-analysis').click();
  await expect(page.getByTestId('analysis-screen')).toBeVisible();
  await expect(page.getByTestId('analysis-screen')).toContainText('복습 필요 영역');
  await shot(page, '03-analysis');

  await page.getByTestId('nav-study').click();
  await page.getByTestId('open-wrong').click();
  await expect(page.getByTestId('wrong-screen')).toBeVisible();
  await expect(page.getByTestId('wrong-screen')).toContainText('복습 필요 영역');
  await shot(page, '04-wrong-note');
});
