// Browsertests op desktop (1200 px) en telefoonbreedte (375 px), tegen de productiebuild (bouwgids 14.3 en 14.5).
// Draai eerst `npm run build:worker`; `npm run check` doet dat in de goede volgorde. Dit vervangt de handmatige
// controle met toetsenbord en een echte telefoon niet (14.6).
//
// De tests draaien tegen de Worker zoals hij online gaat: de OpenNext-build in workerd, de runtime van Cloudflare
// (wrangler dev). Niet tegen `next start`, want dat is Node.js en draait online nergens (fase 0 stap E).
import { defineConfig, devices } from '@playwright/test';

import { TEST_AGENDA_TOKEN } from './scripts/agenda-testtoken.ts';
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
    // Een Worker leest zijn omgeving niet uit process.env maar uit zijn eigen variabelen: vandaar --var.
    command: [
      // --test-scheduled: /__scheduled start de geplande taak met de hand (alleen in wrangler dev).
      `npm run preview:worker -- --port ${POORT} --ip 127.0.0.1 --test-scheduled`,
      `--var SUPABASE_URL:${lokaal.apiUrl}`,
      `--var SUPABASE_PUBLISHABLE_KEY:${lokaal.publishableKey}`,
      `--var SUPABASE_SECRET_KEY:${lokaal.secretKey}`,
      `--var SITE_URL:${SITE}`,
      `--var PROEF_AGENDA_TOKEN:${TEST_AGENDA_TOKEN}`,
    ].join(' '),
    url: SITE,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      WRANGLER_SEND_METRICS: 'false',
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1200, height: 800 } } },
    { name: 'telefoon', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
  ],
});
