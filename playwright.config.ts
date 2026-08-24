import { defineConfig } from '@playwright/test'

const DEV_PORT = 4_175

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
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
    navigationTimeout: 10_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /production-smoke\.spec\.ts/,
      use: {
        baseURL: `http://127.0.0.1:${DEV_PORT}`,
        browserName: 'chromium',
        channel: 'chromium',
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${DEV_PORT} --strictPort`,
    env: {
      VITE_SHOW_DEV_TOOLS: 'true',
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://127.0.0.1:${DEV_PORT}`,
  },
})
