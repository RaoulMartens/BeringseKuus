// Browsertests op desktop (1200 px) en telefoonbreedte (375 px), tegen de productiebuild (bouwgids 14.3 en 14.5).
// Draai eerst `npm run build:worker`; `npm run check` doet dat in de goede volgorde. Dit vervangt de handmatige
// controle met toetsenbord en een echte telefoon niet (14.6).
//
// De tests draaien tegen de Workers zoals ze online gaan, in workerd, de runtime van Cloudflare (wrangler dev): de
// app (de OpenNext-build) en de taken-Worker. Niet tegen `next start`, want dat is Node.js en draait online nergens.
import { defineConfig, devices } from '@playwright/test';

import { APP_POORT as POORT, TAKEN_POORT } from './e2e/poorten.ts';
import { TEST_AGENDA_TOKEN } from './scripts/agenda-testtoken.ts';
import { leesLokaleSupabase } from './scripts/lokale-supabase.ts';

const SITE = `http://127.0.0.1:${POORT}`;
// De Workers praten met de lokale Supabase (npm run supabase:start); de sleutels komen uit `supabase status`.
const lokaal = leesLokaleSupabase();
// De geplande taak draait in één project: twee tegelijk zouden elkaars rijen in de database zien.
const TAKEN = /geplande-taak\.spec\.ts/;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  retries: 0,
  // Het JSON-rapport leest scripts/controleer-overgeslagen.ts: overgeslagen tests laten de poort falen.
  reporter: [['list'], ['json', { outputFile: 'testuitkomsten/e2e.json' }]],
  use: {
    baseURL: SITE,
  },
  webServer: [
    {
      // Een Worker leest zijn omgeving niet uit process.env maar uit zijn eigen variabelen: vandaar --var.
      command: [
        `npm run preview:worker -- --port ${POORT} --ip 127.0.0.1`,
        `--var SUPABASE_URL:${lokaal.apiUrl}`,
        `--var SUPABASE_PUBLISHABLE_KEY:${lokaal.publishableKey}`,
        `--var SITE_URL:${SITE}`,
        `--var PROEF_AGENDA_TOKEN:${TEST_AGENDA_TOKEN}`,
      ].join(' '),
      url: SITE,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { WRANGLER_SEND_METRICS: 'false' },
    },
    {
      // De taken-Worker, met de geheime sleutel van de lokale Supabase. --test-scheduled: /__scheduled start de taak
      // met de hand (bestaat alleen in wrangler dev). Hij heeft geen fetch, dus wachten op de poort, niet op een adres.
      command: [
        `npx wrangler dev -c taken/wrangler.jsonc --port ${TAKEN_POORT} --ip 127.0.0.1 --test-scheduled`,
        `--var SUPABASE_URL:${lokaal.apiUrl}`,
        `--var SUPABASE_SECRET_KEY:${lokaal.secretKey}`,
      ].join(' '),
      port: TAKEN_POORT,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { WRANGLER_SEND_METRICS: 'false' },
    },
  ],
  projects: [
    {
      name: 'desktop',
      testIgnore: TAKEN,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1200, height: 800 } },
    },
    {
      name: 'telefoon',
      testIgnore: TAKEN,
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } },
    },
    { name: 'taken', testMatch: TAKEN },
  ],
});
