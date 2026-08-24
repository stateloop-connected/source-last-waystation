import { defineConfig } from '@playwright/test'

const PRODUCTION_PORT = 4_176

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /production-smoke\.spec\.ts/,
  outputDir: 'test-results/e2e-production',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: [
    [process.env.CI ? 'line' : 'list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    actionTimeout: 5_000,
    baseURL: `http://127.0.0.1:${PRODUCTION_PORT}`,
    browserName: 'chromium',
    channel: 'chromium',
    navigationTimeout: 10_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${PRODUCTION_PORT} --strictPort`,
    env: {
      VITE_SHOW_DEV_TOOLS: 'false',
    },
    reuseExistingServer: false,
    timeout: 30_000,
    url: `http://127.0.0.1:${PRODUCTION_PORT}`,
  },
})
