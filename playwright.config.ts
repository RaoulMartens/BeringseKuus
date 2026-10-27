// Browsertests op desktop (1200 px) en telefoonbreedte (375 px), tegen de productiebuild (bouwgids 14.3 en 14.5).
// Draai eerst `npm run build`; `npm run check` doet dat in de goede volgorde. Dit vervangt de handmatige controle
// met toetsenbord en een echte telefoon niet (14.6).
import { defineConfig, devices } from '@playwright/test';

import { leesLokaleSupabase } from './scripts/lokale-supabase.ts';

const POORT = 3100;
const SITE = `http://127.0.0.1:${POORT}`;
// De app praat met de lokale Supabase (npm run supabase:start); de sleutels komen uit `supabase status`.
const lokaal = leesLokaleSupabase();

export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  retries: 0,
  // Het JSON-rapport leest scripts/controleer-overgeslagen.ts: overgeslagen tests laten de poort falen.
  reporter: [['list'], ['json', { outputFile: 'testuitkomsten/e2e.json' }]],
  use: {
    baseURL: SITE,
  },
  webServer: {
    command: `npm run start -- --port ${POORT} --hostname 127.0.0.1`,
    url: SITE,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      SUPABASE_URL: lokaal.apiUrl,
      SUPABASE_PUBLISHABLE_KEY: lokaal.publishableKey,
      SITE_URL: SITE,
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1200, height: 800 } } },
    { name: 'telefoon', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
  ],
});
