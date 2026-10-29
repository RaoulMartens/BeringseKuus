// De test met twee gelijktijdige sessies (Datamodel-fase-1.md punt 9, DM-08 en DM-23; Bouwbesluiten 11): bewijst dat de
// functies hun rij-lock op de activiteit nemen. Geen browser: twee echte databasesessies via psql in de container van de
// lokale Supabase, gestart vanuit deze test. Draait in het eigen project "database" (playwright.config.ts), één keer.
//
// Alleen de rij vergrendelen in sessie A bewijst niets: de delete van B wacht daar zelf ook op, met of zonder lock in de
// functie. Daarom publiceert A het concept. Met de lock leest B de nieuwe stand en weigert zelf (alleen_concept,
// niet_ondersteund). Zonder lock leest B nog het concept: concept_verwijderen wordt dan door het vangnet (de trigger)
// tegengehouden met een andere melding, en activiteit_opslaan faalt op de CHECK publiceren_vereist_tijden_en_locatie
// (zijn eigen update zet de status terug naar concept) in plaats van op niet_ondersteund.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

import { expect, test } from '@playwright/test';

import { PSQL, psql } from './database-hulp.ts';

const uitvoeren = promisify(execFile);

const uid = crypto.randomUUID();
const lid = crypto.randomUUID();
const concept1 = crypto.randomUUID();
const concept2 = crypto.randomUUID();
const email = `gelijktijdig-${uid}@example.com`;

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  // Een beheerder die aan de regels van is_beheerder() voldoet: een factor van vóór beheerder_sinds, met aal2 en een recente code in de claims.
  psql(`
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
    values ('${uid}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '${email}', now(), now());
    insert into public.leden (id, auth_user_id, voornaam, achternaam, type)
    values ('${lid}', '${uid}', 'Gelijktijdig', 'Test', 'lid');
    insert into public.leden_prive (lid_id, email, is_admin, beheerder_sinds)
    values ('${lid}', '${email}', true, timestamptz '2026-06-01');
    insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
    values (gen_random_uuid(), '${uid}', 'totp', 'verified', timestamptz '2026-05-01', timestamptz '2026-05-01');
    insert into public.activiteiten (id, naam, datum) values
      ('${concept1}', 'Gelijktijdig 1', '2031-01-01'), ('${concept2}', 'Gelijktijdig 2', '2031-01-02');
  `);
});

test.afterAll(() => {
  // De gepubliceerde testactiviteiten verwijdert alleen de eigenaar, met het vangnet even uit.
  psql(`
    alter table public.activiteiten disable trigger activiteit_vangnet_verwijderen;
    delete from public.activiteiten where id in ('${concept1}', '${concept2}');
    alter table public.activiteiten enable trigger activiteit_vangnet_verwijderen;
    delete from public.wijzigingen_log where omschrijving like 'Gelijktijdig %';
    delete from public.leden_prive where lid_id = '${lid}';
    delete from public.leden where id = '${lid}';
    delete from auth.mfa_factors where user_id = '${uid}';
    delete from auth.users where id = '${uid}';
  `);
});

const wacht = (ms: number): Promise<void> => new Promise((klaar) => setTimeout(klaar, ms));

/**
 * Sessie A publiceert het concept en houdt de transactie vijf seconden open. Zodra de database laat zien dat A de lock
 * heeft (niet na een vaste tijd), draait sessie B als beheerder de aanroep. Geeft de foutmelding van B terug.
 */
async function eenAanroepTijdensPublicatie(
  conceptId: string,
  aanroep: string,
): Promise<{ fout: string; duurMs: number }> {
  const markering = `A_${conceptId.slice(0, 8)}`;
  const a = spawn('docker', PSQL, { stdio: ['pipe', 'ignore', 'ignore'] });
  const klaarA = new Promise<void>((klaar) => a.on('close', () => klaar()));
  a.stdin.write(`
    begin;
    update public.activiteiten set status = 'gepubliceerd', starttijd = '20:00', eindtijd = '23:00', locatie = 'Test'
     where id = '${conceptId}';
    select pg_sleep(5) /* ${markering} */;
    commit;
  `);
  a.stdin.end();

  // Wachten tot A de update heeft gedaan: dan voert hij de slaap uit, met de lock nog vast.
  let heeftLock = false;
  for (let poging = 0; poging < 100 && !heeftLock; poging += 1) {
    heeftLock =
      psql(
        `select count(*) from pg_stat_activity where state = 'active' and query like '%${markering}%' and pid <> pg_backend_pid();`,
      ).trim() === '1';
    if (!heeftLock) await wacht(100);
  }
  expect(heeftLock, 'sessie A heeft de lock genomen').toBe(true);

  // Zoals GoTrue het zet: aal2, en in amr de code (totp) van zojuist. is_beheerder() eist een code van max. 12 uur oud.
  const nu = Math.floor(Date.now() / 1000);
  const claims = JSON.stringify({
    sub: uid,
    role: 'authenticated',
    aal: 'aal2',
    amr: [
      { method: 'otp', timestamp: nu },
      { method: 'totp', timestamp: nu },
    ],
  });
  const begin = Date.now();
  let fout = '';
  try {
    await uitvoeren(
      'docker',
      [
        ...PSQL,
        '-c',
        `begin; select set_config('request.jwt.claims', '${claims}', true); set local role authenticated; ${aanroep}; commit;`,
      ],
      { encoding: 'utf8' },
    );
  } catch (uitzondering) {
    fout = String((uitzondering as { stderr?: string }).stderr ?? uitzondering);
  }
  const duurMs = Date.now() - begin;
  await klaarA;
  return { fout, duurMs };
}

test('concept_verwijderen wacht op de lock en weigert zelf een concept dat net is gepubliceerd', async () => {
  const { fout, duurMs } = await eenAanroepTijdensPublicatie(
    concept1,
    `select public.concept_verwijderen('${concept1}')`,
  );
  // De melding komt uit de functie (alleen_concept), niet uit het vangnet (vangnet_alleen_concept): zonder lock in de
  // functie leest B nog het concept, en dan is het alleen de trigger die het tegenhoudt.
  expect(fout).toContain('alleen_concept');
  expect(fout).not.toContain('vangnet');
  expect(duurMs, 'B moet op A hebben gewacht').toBeGreaterThan(1000);
  expect(psql(`select status from public.activiteiten where id = '${concept1}';`).trim()).toBe(
    'gepubliceerd',
  );
});

test('activiteit_opslaan wacht op de lock en overschrijft niets van een activiteit die net is gepubliceerd', async () => {
  const { fout, duurMs } = await eenAanroepTijdensPublicatie(
    concept2,
    `select public.activiteit_opslaan('${concept2}', '{"notitie": "overschreven"}', '[]')`,
  );
  // Zonder lock zou B het concept nog zien en een andere fout geven (de CHECK op tijden en locatie), niet niet_ondersteund.
  expect(fout).toContain('niet_ondersteund');
  expect(duurMs, 'B moet op A hebben gewacht').toBeGreaterThan(1000);
  expect(
    psql(`select coalesce(notitie, '(leeg)') from public.activiteiten where id = '${concept2}';`).trim(),
  ).toBe('(leeg)');
});
