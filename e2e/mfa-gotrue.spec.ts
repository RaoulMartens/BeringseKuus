// MFA met de echte GoTrue van de lokale Supabase (stap D, Datamodel-fase-1.md punt 3). De pgTAP-tests bewijzen de regels
// met zelfgemaakte tokens; dit bewijst dat het echte token ook zo is: aal1 en aal2, de code-stap in `amr`, wat GoTrue
// weigert (een tweede app inschrijven of uitschrijven zonder code), en wat public.beheerstatus() daarbij zegt.
// Geen browser; draait in het Playwright-project "database".
import { expect, test } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../src/lib/supabase/database.types.ts';

import { psql } from './database-hulp.ts';
import {
  beheerClient as beheer,
  logInZonderBrowser as logIn,
  maakLidMetRol,
  ruimLidOp,
  schrijfAppIn,
} from './mfa-hulp.ts';
import { totpCode } from './totp.ts';

const email = `mfa-${crypto.randomUUID()}@example.com`;
let uid = '';

async function beheerstatus(client: SupabaseClient<Database>): Promise<string> {
  const { data, error } = await client.rpc('beheerstatus');
  if (error) throw error;
  return data;
}

async function overzicht(client: SupabaseClient<Database>): Promise<string> {
  const { error } = await client.rpc('beheeroverzicht');
  return error ? error.message : 'ok';
}

async function claimsVan(
  client: SupabaseClient<Database>,
): Promise<{ aal: string; amr: { method: string; timestamp: number }[] }> {
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token ?? '';
  return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as {
    aal: string;
    amr: { method: string; timestamp: number }[];
  };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  // beheerder_sinds ver in de toekomst: elke app die nu wordt ingeschreven, is "van vóór" (zoals in de seed).
  uid = await maakLidMetRol(email, "timestamptz '2099-01-01'");
});

test.afterAll(async () => {
  await ruimLidOp(uid);
});

test('de code-rekenaar klopt met de testwaarde uit RFC 6238', () => {
  // Geheim "12345678901234567890" (base32), tijdstip 59 s: 94287082, dus 287082 in zes cijfers.
  expect(totpCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 0, new Date(59_000))).toBe('287082');
});

test('zonder app: mfa_instellen, en een app inschrijven zonder code geeft nog geen beheer', async () => {
  const client = await logIn(email);
  expect(await beheerstatus(client)).toBe('mfa_instellen');
  expect(await overzicht(client)).toBe('geen_admin');

  const ingeschreven = await client.auth.mfa.enroll({ factorType: 'totp' });
  expect(ingeschreven.error).toBeNull();
  expect(await beheerstatus(client), 'een app die nog niet met een code is bevestigd, telt niet').toBe(
    'mfa_instellen',
  );
  expect(await overzicht(client)).toBe('geen_admin');
  // Opruimen: een niet-bevestigde app mag je zonder code weer uitschrijven.
  await client.auth.mfa.unenroll({ factorId: ingeschreven.data!.id });
});

test('een foute code wordt geweigerd; een goede geeft aal2, een code-stap in amr en beheer', async () => {
  const client = await logIn(email);
  const ingeschreven = await client.auth.mfa.enroll({ factorType: 'totp' });
  if (ingeschreven.error) throw ingeschreven.error;
  const { id: factorId, totp } = ingeschreven.data;

  const eerste = await client.auth.mfa.challenge({ factorId });
  if (eerste.error) throw eerste.error;
  const fout = await client.auth.mfa.verify({ factorId, challengeId: eerste.data.id, code: '000000' });
  expect(fout.error?.message).toBe('Invalid TOTP code entered');
  expect(await beheerstatus(client)).toBe('mfa_instellen');

  const tweede = await client.auth.mfa.challenge({ factorId });
  if (tweede.error) throw tweede.error;
  const goed = await client.auth.mfa.verify({
    factorId,
    challengeId: tweede.data.id,
    code: totpCode(totp.secret),
  });
  expect(goed.error).toBeNull();

  const claims = await claimsVan(client);
  expect(claims.aal).toBe('aal2');
  const nu = Math.floor(Date.now() / 1000);
  const totpStap = claims.amr.find((stap) => stap.method === 'totp');
  expect(totpStap, 'het token noemt de code-stap').toBeDefined();
  expect(Math.abs(nu - (totpStap?.timestamp ?? 0))).toBeLessThan(60);
  expect(await beheerstatus(client)).toBe('ok');
  expect(await overzicht(client)).toBe('ok');

  // Verversen behoudt aal2 en het oorspronkelijke tijdstip van de code: de 12 uur loopt dus door.
  await new Promise((klaar) => setTimeout(klaar, 1500));
  const ververst = await client.auth.refreshSession();
  expect(ververst.error).toBeNull();
  const na = await claimsVan(client);
  expect(na.aal).toBe('aal2');
  expect(na.amr.find((stap) => stap.method === 'totp')?.timestamp).toBe(totpStap?.timestamp);
  expect(await beheerstatus(client)).toBe('ok');
});

test('een nieuwe inlog heeft de code nodig; een tweede app inschrijven of de eerste uitschrijven kan alleen met een code', async () => {
  const client = await logIn(email);
  expect(await beheerstatus(client)).toBe('code_nodig');
  expect(await overzicht(client)).toBe('geen_admin');

  // De reden voor DM-25: met alleen de inloglink kun je geen tweede app naast de bestaande zetten.
  // Met een eigen naam: GoTrue weigert eerst een naam die al bestaat (422), pas daarna ontbrekende aal2 (403).
  const tweede = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'tweede telefoon' });
  expect(tweede.error?.status).toBe(403);
  expect(tweede.error?.message).toBe('AAL2 required to enroll a new factor');

  const lijst = await client.auth.mfa.listFactors();
  const eerste = lijst.data?.totp[0];
  expect(eerste?.status).toBe('verified');
  const weg = await client.auth.mfa.unenroll({ factorId: eerste?.id ?? '' });
  expect(weg.error?.status).toBe(422);
  expect(weg.error?.message).toBe('AAL2 required to unenroll verified factor');
});

test('een app van na beheerder_sinds wacht op bevestiging; uitschrijven geeft weer mfa_instellen', async () => {
  // Een andere beheerder zet beheerder_sinds terug naar een moment vóór de app: nu is de app "van na".
  psql(`update public.leden_prive set beheerder_sinds = timestamptz '2000-01-01' where email = '${email}';`);
  const client = await logIn(email);
  const lijst = await client.auth.mfa.listFactors();
  const factorId = lijst.data?.totp[0]?.id ?? '';
  expect(await beheerstatus(client)).toBe('wacht_op_bevestiging');

  // Opruimen voor de volgende proef: de app weghalen kan alleen met een code; dat doet een beheerder met de beheer-API.
  const weg = await beheer.auth.admin.mfa.deleteFactor({ id: factorId, userId: uid });
  expect(weg.error).toBeNull();
  const opnieuw = await logIn(email);
  expect(await beheerstatus(opnieuw)).toBe('mfa_instellen');

  // De volledige herstelroute: nieuwe app, daarna zet een beheerder beheerder_sinds opnieuw.
  await schrijfAppIn(opnieuw);
  expect(await beheerstatus(opnieuw), 'een nieuwe app van na beheerder_sinds: wachten').toBe(
    'wacht_op_bevestiging',
  );
  psql(`update public.leden_prive set beheerder_sinds = now() + interval '1 hour' where email = '${email}';`);
  expect(await beheerstatus(opnieuw)).toBe('ok');
  expect(await overzicht(opnieuw)).toBe('ok');
});
