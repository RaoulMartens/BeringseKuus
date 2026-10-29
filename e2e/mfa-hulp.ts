// Gedeeld door de tests voor MFA (mfa-gotrue.spec.ts en mfa.spec.ts): een bestuurslid aanmaken, met de beheer-API van
// de lokale Supabase een sessie krijgen en een authenticator-app inschrijven, zonder browser.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { leesLokaleSupabase } from '../scripts/lokale-supabase.ts';
import type { Database } from '../src/lib/supabase/database.types.ts';

import { psql } from './database-hulp.ts';
import { totpCode } from './totp.ts';

const lokaal = leesLokaleSupabase();
const opties = { auth: { persistSession: false, autoRefreshToken: false } };
export const beheerClient = createClient<Database>(lokaal.apiUrl, lokaal.secretKey, opties);

/**
 * Een lid met een inlogaccount en een rij in leden en leden_prive. Met `beheerderSinds` is het een beheerder (is_admin);
 * de waarde is een SQL-uitdrukking, bijvoorbeeld `timestamptz '2000-01-01'`. Zonder is het een gewoon lid.
 */
export async function maakLidMetRol(email: string, beheerderSinds?: string): Promise<string> {
  const gemaakt = await beheerClient.auth.admin.createUser({ email, email_confirm: true });
  if (gemaakt.error) throw gemaakt.error;
  const uid = gemaakt.data.user.id;
  psql(`
    with l as (
      insert into public.leden (auth_user_id, voornaam, achternaam, type) values ('${uid}', 'Mfa', 'Test', 'lid') returning id
    )
    insert into public.leden_prive (lid_id, email, is_admin, beheerder_sinds)
    select id, '${email}', ${beheerderSinds ? 'true' : 'false'}, ${beheerderSinds ?? 'null'} from l;
  `);
  return uid;
}

/** Ruimt een met maakLidMetRol aangemaakt lid op (de rij in leden en het account). */
export async function ruimLidOp(uid: string): Promise<void> {
  psql(`delete from public.leden where auth_user_id = '${uid}';`);
  await beheerClient.auth.admin.deleteUser(uid);
}

/**
 * Het adres van de bevestigpagina met een verse inloglink, zonder dat er een mail voor nodig is. Een lid dat net met de
 * beheer-API een sessie kreeg, kan binnen een minuut geen mail meer aanvragen (de rem van Supabase op herhaalde
 * aanvragen), dus de browsertests die al een sessie zonder browser nodig hadden, loggen hiermee in.
 */
export async function bevestigAdresVoor(email: string): Promise<string> {
  const { data, error } = await beheerClient.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  return `/auth/bevestigen?token_hash=${encodeURIComponent(data.properties.hashed_token)}`;
}

/** Inloggen zoals de app: een inloglink (hier rechtstreeks uit de beheer-API) en daarmee een sessie op aal1. */
export async function logInZonderBrowser(email: string): Promise<SupabaseClient<Database>> {
  const { data, error } = await beheerClient.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  const client = createClient<Database>(lokaal.apiUrl, lokaal.publishableKey, opties);
  const antwoord = await client.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  });
  if (antwoord.error) throw antwoord.error;
  return client;
}

/** Schrijft een app in en bevestigt hem met een code; geeft het geheim terug. */
export async function schrijfAppIn(
  client: SupabaseClient<Database>,
): Promise<{ factorId: string; geheim: string }> {
  const ingeschreven = await client.auth.mfa.enroll({ factorType: 'totp' });
  if (ingeschreven.error) throw ingeschreven.error;
  const { id: factorId, totp } = ingeschreven.data;
  const uitdaging = await client.auth.mfa.challenge({ factorId });
  if (uitdaging.error) throw uitdaging.error;
  const bevestigd = await client.auth.mfa.verify({
    factorId,
    challengeId: uitdaging.data.id,
    code: totpCode(totp.secret),
  });
  if (bevestigd.error) throw bevestigd.error;
  return { factorId, geheim: totp.secret };
}
