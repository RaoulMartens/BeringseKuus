// Browsertests op desktop (1200 px) en telefoon (375 px), tegen de productiebuild (bouwgids 14.3 en 14.5).
// Draai eerst `npm run build`; `npm run check` doet dat in de goede volgorde.
import { defineConfig, devices } from '@playwright/test';

const POORT = 3100;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${POORT}`,
  },
  webServer: {
    command: `npm run start -- --port ${POORT} --hostname 127.0.0.1`,
    url: `http://127.0.0.1:${POORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1200, height: 800 } } },
    { name: 'telefoon', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
  ],
});
