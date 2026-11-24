import { defineConfig, devices } from '@playwright/test';

// Ports are away from the defaults (API 5310) so a running real instance never
// collides with the tests. Vite's dev port (5173) is fixed in vite.config.ts.
const DEV_URL = 'http://127.0.0.1:5173';
const DEV_API_PORT = '5311';
const PROD_PORT = '5312';
const PROD_URL = `http://127.0.0.1:${PROD_PORT}`;

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
      testMatch: /prod\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: PROD_URL },
    },
  ],
  webServer: [
    {
      // The mode where the task 0005 blank-page bug lived.
      command: 'npm run dev',
      url: DEV_URL,
      env: { PORT: DEV_API_PORT },
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
  ],
});
