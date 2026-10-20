import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5199', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 850 } },
    },
  ],
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    cwd: 'apps/web',
    url: 'http://localhost:5199',
    // Alltid egen server på egen port: en eldre, langlevende dev-server kan ha utdatert tilstand.
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
