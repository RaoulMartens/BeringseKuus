// Gedeeld door de tests van de beheerschermen: een beheerder met een app, in de browser ingelogd en met de code
// bevestigd (aal2), tegen de lokale Supabase en de Worker.
import { expect, type Page } from '@playwright/test';

import { psql } from './database-hulp.ts';
import { nieuwAdres } from './inloggen-hulp.ts';
import {
  bevestigAdresVoor,
  bevestigBeheerder,
  logInZonderBrowser,
  maakLidMetRol,
  schrijfAppIn,
} from './mfa-hulp.ts';
import { totpCode } from './totp.ts';

/** Een beheerder die in deze pagina op Beheer staat. Geeft het account (uid) terug, voor het opruimen met ruimLidOp. */
export async function logInAlsBeheerder(page: Page): Promise<string> {
  const email = nieuwAdres();
  // De app staat er al van vóór beheerder_sinds ('now()'): de bevestiging is gedaan (bevestigBeheerder).
  const uid = await maakLidMetRol(email, 'now()');
  const { geheim } = await schrijfAppIn(await logInZonderBrowser(email));
  bevestigBeheerder(email);
  await page.goto(await bevestigAdresVoor(email));
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page).toHaveURL(/\/mijn$/);
  await page.goto('/beheer');
  await expect(page).toHaveURL(/\/mfa\/code$/);
  await page.getByLabel('Code uit de app').fill(totpCode(geheim));
  await page.getByRole('button', { name: 'Verder naar beheer' }).click();
  await expect(page).toHaveURL(/\/beheer$/);
  return uid;
}

/** Het id van het lid bij een account (auth_user_id). */
export function lidIdVan(uid: string): string {
  return psql(`select id from public.leden where auth_user_id = '${uid}';`).trim();
}

/**
 * Verwijdert test-activiteiten, ook gepubliceerde: de database laat dat niet toe (annuleren, niet wissen), dus voor de
 * opruimactie staan de triggers even uit en gaan de rijen die eraan hangen mee. Alleen voor tests.
 */
export function ruimActiviteitenOp(naamPatroon: string): void {
  psql(`
    begin;
    set local session_replication_role = replica;
    delete from public.activiteit_groep where activiteit_id in (select id from public.activiteiten where naam like '${naamPatroon}');
    delete from public.rol_slots where activiteit_id in (select id from public.activiteiten where naam like '${naamPatroon}');
    delete from public.activiteiten where naam like '${naamPatroon}';
    commit;
  `);
}
