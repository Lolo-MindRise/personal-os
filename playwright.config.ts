import { defineConfig, devices } from '@playwright/test';

// Dedicated ports, away from every default (API 5310, Vite 5173), so the tests never
// collide with a running `npm run dev` or the real instance.
const DEV_WEB_PORT = '5321';
const DEV_URL = `http://127.0.0.1:${DEV_WEB_PORT}`;
const DEV_API_PORT = '5322';
const PROD_PORT = '5323';
const PROD_URL = `http://127.0.0.1:${PROD_PORT}`;
const EMPTY_PORT = '5324';
const EMPTY_URL = `http://127.0.0.1:${EMPTY_PORT}`;

export default defineConfig({
  testDir: './e2e',
  // The production tests share one database and run in order.
  workers: 1,
  fullyParallel: false,
  forbidOnly: process.env.CI !== undefined,
  reporter: 'list',
  // Traces help locally; CI does not upload artifacts, so it would only lose them.
  use: { trace: process.env.CI === undefined ? 'retain-on-failure' : 'off' },
  projects: [
    {
      name: 'dev',
      testMatch: /dev\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: DEV_URL },
    },
    {
      name: 'prod',
      // Every spec except the dev-server one runs against the production server.
      testIgnore: /dev\.spec\.ts|dashboard-empty\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: PROD_URL },
    },
    {
      // A production server on a fresh, unseeded database.
      name: 'empty',
      testMatch: /dashboard-empty\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: EMPTY_URL },
    },
  ],
  webServer: [
    {
      // The mode where the task 0005 blank-page bug lived.
      command: 'npm run dev',
      url: DEV_URL,
      env: { PORT: DEV_API_PORT, VITE_PORT: DEV_WEB_PORT },
      reuseExistingServer: false,
      timeout: 60_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
    {
      // Seeds a temporary data directory, then runs `npm start` against it.
      command: 'npx tsx e2e/prod-server.ts',
      url: `${PROD_URL}/api/health`,
      env: { PORT: PROD_PORT },
      reuseExistingServer: false,
      timeout: 60_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
    {
      command: 'npx tsx e2e/prod-server.ts',
      url: `${EMPTY_URL}/api/health`,
      env: { PORT: EMPTY_PORT, E2E_EMPTY: '1' },
      reuseExistingServer: false,
      timeout: 60_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
});
