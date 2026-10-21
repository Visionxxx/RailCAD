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
    // Firefox er valgfritt (E2E_FIREFOX=1, krever `npx playwright install firefox`): 3D- og
    // ytelsestestene kan nå tidsgrensene når mange arbeidere deler én maskin.
    ...(process.env.E2E_FIREFOX
      ? [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'], viewport: { width: 1400, height: 850 } },
          },
        ]
      : []),
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
