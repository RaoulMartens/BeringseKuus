// MFA voor het bestuur in de browser (stap D): beheer vraagt eerst een authenticator-app, dan wachten op bevestiging van
// een andere beheerder, en daarna bij elke sessie een code. Tegen de lokale Supabase en de Worker; de "app" is
// e2e/totp.ts, dat de zes cijfers uitrekent uit de sleutel die op de pagina staat.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { psql } from './database-hulp.ts';
import { inloglinkVoor, logInMet, nieuwAdres, vraagLinkAan } from './inloggen-hulp.ts';
import { bevestigAdresVoor, logInZonderBrowser, maakLidMetRol, ruimLidOp, schrijfAppIn } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';
import { totpCode } from './totp.ts';

const aangemaakt: string[] = [];
test.afterAll(async () => {
  for (const uid of aangemaakt.splice(0)) await ruimLidOp(uid);
});

/** Inloggen met een verse link van de beheer-API; de mail is voor deze test niet het onderwerp. */
async function logInZonderMail(page: Page, email: string): Promise<void> {
  await page.goto(await bevestigAdresVoor(email));
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page).toHaveURL(/\/mijn$/);
}

/** Een bestuurslid dat in deze pagina is ingelogd via de link in de mail. */
async function ingelogdAls(page: Page, beheerderSinds?: string): Promise<{ email: string; uid: string }> {
  const email = nieuwAdres();
  const uid = await maakLidMetRol(email, beheerderSinds);
  aangemaakt.push(uid);
  await vraagLinkAan(page, email);
  await logInMet(page, await inloglinkVoor(email));
  await expect(page).toHaveURL(/\/mijn$/);
  return { email, uid };
}

async function geenZijwaartsScrollen(page: Page): Promise<void> {
  const teBreed = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(teBreed).toBe(false);
}

test.describe('MFA voor het bestuur', () => {
  test('eerst een app instellen, dan wachten op bevestiging, daarna beheer', async ({ page }) => {
    // beheerder_sinds ligt ver in het verleden: de app die nu wordt ingesteld is "van na" en moet bevestigd worden.
    const { email } = await ingelogdAls(page, "timestamptz '2000-01-01'");

    await page.goto('/beheer');
    await expect(page).toHaveURL(/\/mfa\/instellen$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Beheer beveiligen');
    const geheim = (await page.locator('code').innerText()).replace(/\s/g, '');
    expect(geheim).toMatch(/^[A-Z2-7]{16,}$/);

    // Een foute code: dezelfde pagina, dezelfde sleutel (anders zou de al gescande app onbruikbaar worden).
    await page.getByLabel('Code uit de app').fill('000000');
    await page.getByRole('button', { name: 'Bevestigen' }).click();
    await expect(page.locator('#code-fout')).toContainText('Deze code klopt niet');
    expect((await page.locator('code').innerText()).replace(/\s/g, '')).toBe(geheim);

    await page.getByLabel('Code uit de app').fill(totpCode(geheim));
    await page.getByRole('button', { name: 'Bevestigen' }).click();
    await expect(page).toHaveURL(/\/mfa\/wacht$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Je app is ingesteld');

    // Beheer is dicht tot een andere beheerder bevestigt.
    await page.goto('/beheer');
    await expect(page).toHaveURL(/\/mfa\/wacht$/);

    psql(`update public.leden_prive set beheerder_sinds = now() where email = '${email}';`);
    await page.goto('/beheer');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Beheer');
  });

  test('een nieuwe sessie vraagt de code; een foute wordt geweigerd', async ({ page }) => {
    const email = nieuwAdres();
    // De app staat er al (van vóór beheerder_sinds): de bevestiging is gedaan.
    const uid = await maakLidMetRol(email, "timestamptz '2099-01-01'");
    aangemaakt.push(uid);
    const { geheim } = await schrijfAppIn(await logInZonderBrowser(email));

    await logInZonderMail(page, email);
    await page.goto('/beheer');
    await expect(page).toHaveURL(/\/mfa\/code$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Code voor beheer');

    await page.getByLabel('Code uit de app').fill('123456');
    await page.getByRole('button', { name: 'Verder naar beheer' }).click();
    await expect(page).toHaveURL(/\/mfa\/code\?fout=code$/);
    await expect(page.locator('#code-fout')).toContainText('Deze code klopt niet');

    await page.getByLabel('Code uit de app').fill(totpCode(geheim));
    await page.getByRole('button', { name: 'Verder naar beheer' }).click();
    await expect(page).toHaveURL(/\/beheer$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Beheer');

    // De code-pagina is nu niet meer nodig: wie er toch komt, gaat door naar beheer.
    await page.goto('/mfa/code');
    await expect(page).toHaveURL(/\/beheer$/);
  });

  test('een gewoon lid komt niet in beheer', async ({ page }) => {
    const email = nieuwAdres();
    aangemaakt.push(await maakLidMetRol(email));
    await logInZonderMail(page, email);

    await page.goto('/beheer');
    await expect(page).toHaveURL(/\/geen-toegang$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dit is alleen voor het bestuur');
  });

  test('beheer is niet te openen zonder in te loggen', async ({ page }) => {
    await page.goto('/beheer');
    await expect(page).toHaveURL(/\/inloggen$/);
    await page.goto('/mfa/code');
    await expect(page).toHaveURL(/\/inloggen$/);
    await page.goto('/mfa/instellen');
    await expect(page).toHaveURL(/\/inloggen$/);
  });

  test('de schermen hebben geen toegankelijkheidsfouten en schuiven niet opzij', async ({ page }) => {
    await ingelogdAls(page, "timestamptz '2000-01-01'");
    for (const pad of ['/mfa/instellen', '/mfa/toestel-kwijt', '/geen-toegang']) {
      await page.goto(pad);
      expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations, pad).toEqual([]);
      await geenZijwaartsScrollen(page);
    }

    // Met een foutmelding, en na het instellen de wachtpagina.
    await page.goto('/mfa/instellen');
    await page.getByLabel('Code uit de app').fill('000000');
    await page.getByRole('button', { name: 'Bevestigen' }).click();
    await expect(page.locator('#code-fout')).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

    const geheim = (await page.locator('code').innerText()).replace(/\s/g, '');
    await page.getByLabel('Code uit de app').fill(totpCode(geheim));
    await page.getByRole('button', { name: 'Bevestigen' }).click();
    await expect(page).toHaveURL(/\/mfa\/wacht$/);
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
    await geenZijwaartsScrollen(page);
  });

  test('de codepagina heeft geen toegankelijkheidsfouten', async ({ page }) => {
    const email = nieuwAdres();
    aangemaakt.push(await maakLidMetRol(email, "timestamptz '2099-01-01'"));
    await schrijfAppIn(await logInZonderBrowser(email));
    await logInZonderMail(page, email);

    for (const pad of ['/mfa/code', '/mfa/code?fout=code', '/mfa/code?fout=druk']) {
      await page.goto(pad);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Code voor beheer');
      expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations, pad).toEqual([]);
      await geenZijwaartsScrollen(page);
    }
  });
});
