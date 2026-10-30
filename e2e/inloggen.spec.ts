import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  ingelogdLid,
  inloglinkVoor,
  maakAccountZonderLid,
  logInMet,
  mailsAan,
  maakLid,
  nieuwAdres,
  ruimLedenOp,
  vraagLinkAan,
  wacht,
} from './inloggen-hulp.ts';
import { WCAG } from './normen.ts';

// De hele route van de inloglink, tegen de lokale Supabase: het lid bestaat (het bestuur nodigt uit), de mail
// komt aan in Mailpit (de lokale postbus van Supabase), en de link geeft een sessie.

test.afterAll(ruimLedenOp);

test.describe('inloggen met een link per mail', () => {
  test('een lid logt in met de link en logt weer uit', async ({ page }) => {
    const email = nieuwAdres();
    await maakLid(email);
    await vraagLinkAan(page, email);
    await logInMet(page, await inloglinkVoor(email));

    await expect(page).toHaveURL(/\/mijn$/);
    await expect(page.getByRole('main')).toContainText(email);

    await page.getByRole('button', { name: 'Uitloggen' }).click();
    await expect(page).toHaveURL(/\/inloggen\?uitgelogd=1$/);
    await expect(page.getByRole('main').getByRole('status')).toHaveText(
      'Je bent uitgelogd. Tot de volgende keer.',
    );
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
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'De link uit je mail is verlopen of al gebruikt.',
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
    await page.getByRole('button', { name: 'Stuur mij een inloglink' }).click();
    await expect(page).toHaveURL(/\/inloggen\?fout=ongeldig$/);
    const veld = page.getByLabel('E-mailadres');
    await expect(veld).toHaveAttribute('aria-invalid', 'true');
    await expect(veld).toHaveAccessibleDescription(/Dit lijkt geen e-mailadres/);
  });

  test('een lege of kapotte link geeft een duidelijke melding', async ({ page }) => {
    await page.goto('/auth/bevestigen');
    await expect(page).toHaveURL(/\/inloggen\?fout=link$/);

    await logInMet(page, '/auth/bevestigen?token_hash=bestaat-niet');
    await expect(page).toHaveURL(/\/inloggen\?fout=link$/);
  });

  test('een lid dat inlogt komt op het programma als hij de voorpagina opent', async ({ page }) => {
    await ingelogdLid(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/programma$/);
  });

  test('een inlogaccount zonder lid krijgt een melding en wordt niet teruggestuurd naar inloggen', async ({
    page,
  }) => {
    const email = nieuwAdres();
    await maakAccountZonderLid(email);
    await vraagLinkAan(page, email);
    await logInMet(page, await inloglinkVoor(email));

    await expect(page).toHaveURL(/\/mijn$/);
    await expect(page.getByRole('main').getByRole('status')).toContainText('staat nog niet bij de leden');
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
    // De voorpagina stuurt dit account naar dezelfde melding in plaats van naar het programma.
    await page.goto('/');
    await expect(page).toHaveURL(/\/mijn$/);
    await page.getByRole('button', { name: 'Uitloggen' }).click();
    await expect(page).toHaveURL(/\/inloggen\?uitgelogd=1$/);
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

  // Ook de schermen achter de link en na het inloggen (review F0-15).
  test('de bevestigpagina en mijn account hebben geen toegankelijkheidsfouten', async ({ page }) => {
    const email = nieuwAdres();
    await maakLid(email);
    await vraagLinkAan(page, email);
    await page.goto(await inloglinkVoor(email));
    await expect(page.getByRole('button', { name: 'Inloggen' })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

    await page.getByRole('button', { name: 'Inloggen' }).click();
    await expect(page).toHaveURL(/\/mijn$/);
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  });
});
