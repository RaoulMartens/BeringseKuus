import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { leesLokaleSupabase } from '../scripts/lokale-supabase.ts';
import { WCAG } from './normen.ts';

// De hele route van de inloglink, tegen de lokale Supabase: het lid bestaat (het bestuur nodigt uit), de mail
// komt aan in Mailpit (de lokale postbus van Supabase), en de link geeft een sessie.

const lokaal = leesLokaleSupabase();
// Met de geheime sleutel mag deze client leden aanmaken en verwijderen. Hij draait alleen hier, in de test.
const beheer = createClient(lokaal.apiUrl, lokaal.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const aangemaakt: string[] = [];

// Elk testgeval een eigen, verzonnen adres: de tests lopen tegelijk en lezen zo nooit elkaars mail.
const nieuwAdres = (): string => `lid-${crypto.randomUUID()}@example.com`;
const wacht = (ms: number): Promise<void> => new Promise((klaar) => setTimeout(klaar, ms));

async function maakLid(email: string): Promise<void> {
  const { data, error } = await beheer.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  aangemaakt.push(data.user.id);
}

interface Zoekresultaat {
  messages?: { ID: string }[];
}

async function mailsAan(email: string): Promise<{ ID: string }[]> {
  const zoek = encodeURIComponent(`to:"${email}"`);
  const antwoord = await fetch(`${lokaal.mailpitUrl}/api/v1/search?query=${zoek}`);
  const uitkomst = (await antwoord.json()) as Zoekresultaat;
  return uitkomst.messages ?? [];
}

async function inloglinkVoor(email: string): Promise<string> {
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

async function vraagLinkAan(page: Page, email: string): Promise<void> {
  await page.goto('/inloggen');
  await page.getByLabel('E-mailadres').fill(email);
  await page.getByRole('button', { name: 'Stuur inloglink' }).click();
  await expect(page).toHaveURL(/\/inloggen\?verstuurd=1$/);
  await expect(page.getByRole('main').getByRole('status')).toContainText(
    'Als dit e-mailadres bij ons bekend is',
  );
}

async function logInMet(page: Page, link: string): Promise<void> {
  await page.goto(link);
  await page.getByRole('button', { name: 'Inloggen' }).click();
}

test.afterAll(async () => {
  for (const id of aangemaakt) await beheer.auth.admin.deleteUser(id);
});

test.describe('inloggen met een link per mail', () => {
  test('een lid logt in met de link en logt weer uit', async ({ page }) => {
    const email = nieuwAdres();
    await maakLid(email);
    await vraagLinkAan(page, email);
    await logInMet(page, await inloglinkVoor(email));

    await expect(page).toHaveURL(/\/mijn$/);
    await expect(page.getByRole('main')).toContainText(`Je bent ingelogd als ${email}.`);

    await page.getByRole('button', { name: 'Uitloggen' }).click();
    await expect(page).toHaveURL(/\/inloggen\?uitgelogd=1$/);
    await expect(page.getByRole('main').getByRole('status')).toHaveText('Je bent uitgelogd.');
    await page.goto('/mijn');
    await expect(page).toHaveURL(/\/inloggen$/);
  });

  test('de link werkt ook op een ander apparaat dan waar hij is aangevraagd', async ({ page, browser }) => {
    const email = nieuwAdres();
    await maakLid(email);
    await vraagLinkAan(page, email);

    const telefoon = await browser.newContext();
    const anderePagina = await telefoon.newPage();
    await logInMet(anderePagina, await inloglinkVoor(email));
    await expect(anderePagina).toHaveURL(/\/mijn$/);
    await telefoon.close();
  });

  test('een mailprogramma dat de link vooraf opent, maakt hem niet op', async ({ page, request }) => {
    const email = nieuwAdres();
    await maakLid(email);
    await vraagLinkAan(page, email);
    const link = await inloglinkVoor(email);

    // Zo controleert een virusscanner een link: alleen openen, niet op de knop drukken.
    expect((await request.get(link)).status()).toBe(200);
    await logInMet(page, link);
    await expect(page).toHaveURL(/\/mijn$/);
  });

  test('een link werkt maar één keer', async ({ page }) => {
    const email = nieuwAdres();
    await maakLid(email);
    await vraagLinkAan(page, email);
    const link = await inloglinkVoor(email);
    await logInMet(page, link);
    await expect(page).toHaveURL(/\/mijn$/);
    await page.getByRole('button', { name: 'Uitloggen' }).click();
    await expect(page).toHaveURL(/\/inloggen\?uitgelogd=1$/);

    await logInMet(page, link);
    await expect(page).toHaveURL(/\/inloggen\?fout=link$/);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      'De inloglink is verlopen of al gebruikt. Vraag hieronder een nieuwe aan.',
    );
  });

  test('een onbekend adres krijgt hetzelfde antwoord, maar geen mail', async ({ page }) => {
    const email = nieuwAdres();
    await vraagLinkAan(page, email);
    // Een mail aan een bekend lid komt binnen een seconde aan (zie de tests hierboven); wacht ruim langer.
    await wacht(2000);
    expect(await mailsAan(email)).toHaveLength(0);
  });

  test('een ongeldig adres geeft een melding bij het veld', async ({ page }) => {
    await page.goto('/inloggen');
    // De browser vindt "a@b" goed; de server niet. Zo wordt de controle op de server getest.
    await page.getByLabel('E-mailadres').fill('a@b');
    await page.getByRole('button', { name: 'Stuur inloglink' }).click();
    await expect(page).toHaveURL(/\/inloggen\?fout=ongeldig$/);
    const veld = page.getByLabel('E-mailadres');
    await expect(veld).toHaveAttribute('aria-invalid', 'true');
    await expect(veld).toHaveAccessibleDescription('Vul een geldig e-mailadres in.');
  });

  test('een lege of kapotte link geeft een duidelijke melding', async ({ page }) => {
    await page.goto('/auth/bevestigen');
    await expect(page).toHaveURL(/\/inloggen\?fout=link$/);

    await logInMet(page, '/auth/bevestigen?token_hash=bestaat-niet');
    await expect(page).toHaveURL(/\/inloggen\?fout=link$/);
  });

  test('mijn account is alleen te zien na inloggen', async ({ page }) => {
    await page.goto('/mijn');
    await expect(page).toHaveURL(/\/inloggen$/);
  });

  for (const pad of [
    '/inloggen',
    '/inloggen?verstuurd=1',
    '/inloggen?fout=ongeldig',
    '/inloggen?fout=link',
  ]) {
    test(`${pad} heeft geen toegankelijkheidsfouten en schuift niet opzij`, async ({ page }) => {
      await page.goto(pad);
      const resultaat = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(resultaat.violations).toEqual([]);
      const teBreed = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(teBreed).toBe(false);
    });
  }
});
