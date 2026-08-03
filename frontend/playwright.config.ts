import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/admin',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: 'artifacts/admin-e2e/test-results',
  reporter: [['list']],
  use: {
    baseURL: process.env.ADMIN_E2E_BASE_URL ?? 'http://127.0.0.1:15174',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: 'chromium-admin',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
