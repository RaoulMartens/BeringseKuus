// Proefroute 3 (Fase-0-plan 4): de geplande taak op de taken-Worker in workerd. wrangler dev start de taak met de
// hand via /__scheduled (zoals Cloudflare dat elke minuut doet); daarna kijkt de test in de lokale database. Draait
// alleen in het project "taken" (playwright.config.ts), zodat twee runs elkaar niet in de weg zitten.
import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { leesLokaleSupabase } from '../scripts/lokale-supabase.ts';
import type { Database } from '../src/lib/supabase/database.types.ts';
import { minuutSleutel } from '../src/taken/proef-taak.ts';
import { TAKEN_POORT } from './poorten.ts';

const lokaal = leesLokaleSupabase();
// Met de geheime sleutel mag de test de tabel lezen en opruimen. Hij draait alleen hier, in de test.
const beheer = createClient<Database>(lokaal.apiUrl, lokaal.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const TAKEN = `http://127.0.0.1:${TAKEN_POORT}`;

test('twee starts in dezelfde minuut geven één rij, met de uitkomst gelukt', async ({ request }) => {
  const voor = minuutSleutel(new Date());
  // Eigen begin: rijen van eerdere runs in deze minuut tellen niet mee (review PR12-07).
  await beheer
    .from('proef_taak')
    .delete()
    .in('minuut', [voor, minuutSleutel(new Date(Date.now() + 60_000))]);

  const start = () => request.get(`${TAKEN}/__scheduled?cron=*+*+*+*+*`);
  expect((await start()).ok()).toBe(true);
  expect((await start()).ok()).toBe(true);
  const na = minuutSleutel(new Date());

  const { data, error } = await beheer.from('proef_taak').select('minuut, status').in('minuut', [voor, na]);
  expect(error).toBeNull();
  const rijen = data ?? [];
  // Precies één rij per minuut waarin gestart is: meestal één, twee als de starts over een minuutgrens vielen.
  expect(rijen).toHaveLength(new Set([voor, na]).size);
  for (const rij of rijen) expect(rij.status).toBe('gelukt');
});
