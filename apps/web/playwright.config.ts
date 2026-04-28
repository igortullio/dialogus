import { defineConfig, devices } from '@playwright/test'

const PORT = Number.parseInt(process.env.PLAYWRIGHT_WEB_PORT ?? '3000', 10)
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`
const IS_CI = Boolean(process.env.CI)

const HAPPY_PATH_TIMEOUT_MS = 15 * 60 * 1000
const A11Y_TIMEOUT_MS = 4 * 60 * 1000
const EXPECT_TIMEOUT_MS = 10 * 1000

export default defineConfig({
  testDir: './__tests__',
  fullyParallel: false,
  forbidOnly: IS_CI,
  retries: IS_CI ? 1 : 0,
  workers: 1,
  reporter: IS_CI ? [['github'], ['list']] : 'list',
  expect: { timeout: EXPECT_TIMEOUT_MS },
  use: {
    baseURL: BASE_URL,
    trace: IS_CI ? 'retain-on-failure' : 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'integration',
      testDir: './__tests__/integration',
      testMatch: /.*\.spec\.ts$/,
      timeout: HAPPY_PATH_TIMEOUT_MS,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'a11y',
      testDir: './__tests__/a11y',
      testMatch: /.*\.spec\.ts$/,
      timeout: A11Y_TIMEOUT_MS,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_DISABLE_WEB_SERVER
    ? undefined
    : {
        command: process.env.PLAYWRIGHT_WEB_COMMAND ?? 'pnpm --filter @dialogus/web dev',
        url: BASE_URL,
        reuseExistingServer: !IS_CI,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 120_000,
      },
})
