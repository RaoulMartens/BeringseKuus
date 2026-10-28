// Gedeeld door de browsertests die een ingelogd lid nodig hebben: een verzonnen lid aanmaken, de inloglink uit
// Mailpit (de lokale postbus van Supabase) halen en ermee inloggen. Alles tegen de lokale Supabase.
import { expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { leesLokaleSupabase } from '../scripts/lokale-supabase.ts';

const lokaal = leesLokaleSupabase();
// Met de geheime sleutel mag deze client leden aanmaken en verwijderen. Hij draait alleen hier, in de test.
const beheer = createClient(lokaal.apiUrl, lokaal.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const aangemaakt: string[] = [];

// Elk testgeval een eigen, verzonnen adres: de tests lopen tegelijk en lezen zo nooit elkaars mail.
export const nieuwAdres = (): string => `lid-${crypto.randomUUID()}@example.com`;
export const wacht = (ms: number): Promise<void> => new Promise((klaar) => setTimeout(klaar, ms));

export async function maakLid(email: string): Promise<void> {
  const { data, error } = await beheer.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  aangemaakt.push(data.user.id);
}

/** Verwijdert de leden die dit testbestand heeft aangemaakt; aanroepen in test.afterAll. */
export async function ruimLedenOp(): Promise<void> {
  for (const id of aangemaakt.splice(0)) await beheer.auth.admin.deleteUser(id);
}

interface Zoekresultaat {
  messages?: { ID: string }[];
}

export async function mailsAan(email: string): Promise<{ ID: string }[]> {
  const zoek = encodeURIComponent(`to:"${email}"`);
  const antwoord = await fetch(`${lokaal.mailpitUrl}/api/v1/search?query=${zoek}`);
  const uitkomst = (await antwoord.json()) as Zoekresultaat;
  return uitkomst.messages ?? [];
}

export async function inloglinkVoor(email: string): Promise<string> {
  for (let poging = 0; poging < 40; poging += 1) {
    const [mail] = await mailsAan(email);
    if (mail) {
      const antwoord = await fetch(`${lokaal.mailpitUrl}/api/v1/message/${mail.ID}`);
      const bericht = (await antwoord.json()) as { HTML?: string };
      const link = /href="([^"]*\/auth\/bevestigen\?token_hash=[^"]+)"/.exec(bericht.HTML ?? '')?.[1];
      if (!link) throw new Error('de mail bevat geen inloglink');
      return link;
    }
    await wacht(250);
  }
  throw new Error('binnen 10 seconden geen mail aangekomen');
}

export async function vraagLinkAan(page: Page, email: string): Promise<void> {
  await page.goto('/inloggen');
  await page.getByLabel('E-mailadres').fill(email);
  await page.getByRole('button', { name: 'Stuur inloglink' }).click();
  await expect(page).toHaveURL(/\/inloggen\?verstuurd=1$/);
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'Als dit e-mailadres bij ons bekend is',
  );
}

export async function logInMet(page: Page, link: string): Promise<void> {
  await page.goto(link);
  await page.getByRole('button', { name: 'Inloggen' }).click();
}

/** Een nieuw, verzonnen lid dat in deze pagina is ingelogd en op /mijn staat. */
export async function ingelogdLid(page: Page): Promise<string> {
  const email = nieuwAdres();
  await maakLid(email);
  await vraagLinkAan(page, email);
  await logInMet(page, await inloglinkVoor(email));
  await expect(page).toHaveURL(/\/mijn$/);
  return email;
}
