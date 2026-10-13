import { defineConfig } from '@playwright/test';

const externalServer = process.env.POTION_BASE_URL;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.browser.ts',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'work/browser-report' }]],
  outputDir: 'work/browser-results',
  use: {
    baseURL: externalServer ?? 'http://127.0.0.1:4173/potion-brewer-codex/',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? (process.env.CI ? undefined : '/usr/bin/chromium'),
      args: ['--no-sandbox'],
    },
  },
  webServer: externalServer ? undefined : {
    command: 'npm run build && npm run preview -- --base=/potion-brewer-codex/ --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/potion-brewer-codex/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
