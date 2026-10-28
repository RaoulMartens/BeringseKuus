// Proefroute 3 (Fase-0-plan 4): de geplande taak op de Worker in workerd. wrangler dev start de taak met de hand via
// /__scheduled (zoals Cloudflare dat elke minuut doet); daarna kijkt de test in de lokale database.
import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { leesLokaleSupabase } from '../scripts/lokale-supabase.ts';
import { minuutSleutel } from '../src/taken/proef-taak.ts';

const lokaal = leesLokaleSupabase();
// Met de geheime sleutel mag de test de tabel lezen. Hij draait alleen hier, in de test.
const beheer = createClient(lokaal.apiUrl, lokaal.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test('de geplande taak schrijft per minuut één rij, ook als hij twee keer start', async ({ request }) => {
  const voor = minuutSleutel(new Date());
  const start = () => request.get('/__scheduled?cron=*+*+*+*+*');
  expect((await start()).ok()).toBe(true);
  expect((await start()).ok()).toBe(true);
  const na = minuutSleutel(new Date());

  const { data, error } = await beheer.from('proef_taak').select('minuut, status').in('minuut', [voor, na]);
  expect(error).toBeNull();
  // Zonder gegenereerde databasetypen (komen in fase 1) is het antwoord ongetypeerd; hier de twee gevraagde kolommen.
  const rijen = (data ?? []) as { minuut: string; status: string }[];
  expect(rijen.length).toBeGreaterThanOrEqual(1);
  // Een minuut is de sleutel: twee starts in dezelfde minuut geven geen tweede rij.
  expect(new Set(rijen.map((rij) => rij.minuut)).size).toBe(rijen.length);
  for (const rij of rijen) expect(rij.status).toBe('gelukt');
});
