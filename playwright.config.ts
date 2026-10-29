// Browsertests op desktop (1200 px) en telefoonbreedte (375 px), tegen de productiebuild (bouwgids 14.3 en 14.5).
// Draai eerst `npm run build:worker`; `npm run check` doet dat in de goede volgorde. Dit vervangt de handmatige
// controle met toetsenbord en een echte telefoon niet (14.6).
//
// De tests draaien tegen de Worker zoals hij online gaat, in workerd, de runtime van Cloudflare (wrangler dev), en
// niet tegen `next start`: dat is Node.js en draait online nergens.
import { defineConfig, devices } from '@playwright/test';

import { APP_POORT as POORT } from './e2e/poorten.ts';
import { leesLokaleSupabase } from './scripts/lokale-supabase.ts';

const SITE = `http://127.0.0.1:${POORT}`;
// De test met twee databasesessies (Datamodel-fase-1.md punt 9) heeft geen browser nodig en draait één keer, niet per
// schermbreedte: twee tegelijk zouden elkaars activiteiten zien.
const DATABASE = /gelijktijdig\.spec\.ts/;
// De Worker praat met de lokale Supabase (npm run supabase:start); de sleutels komen uit `supabase status`.
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
  webServer: [
    {
      // Een Worker leest zijn omgeving niet uit process.env maar uit zijn eigen variabelen: vandaar --var.
      command: [
        `npm run preview:worker -- --port ${POORT} --ip 127.0.0.1`,
        `--var SUPABASE_URL:${lokaal.apiUrl}`,
        `--var SUPABASE_PUBLISHABLE_KEY:${lokaal.publishableKey}`,
        `--var SITE_URL:${SITE}`,
      ].join(' '),
      url: SITE,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { WRANGLER_SEND_METRICS: 'false' },
    },
  ],
  projects: [
    {
      name: 'desktop',
      testIgnore: DATABASE,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1200, height: 800 } },
    },
    {
      name: 'telefoon',
      testIgnore: DATABASE,
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } },
    },
    { name: 'database', testMatch: DATABASE },
  ],
});
