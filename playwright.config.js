import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:5173/ece-study/',
    locale: 'ko-KR',
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  webServer: {
    command: 'ECE_DATA=sample npx vite --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173/ece-study/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
