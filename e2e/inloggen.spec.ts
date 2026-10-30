import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { psql } from './database-hulp.ts';
import {
  inlogcodeVoor,
  inlogmailVoor,
  logInMetCode,
  mailsAan,
  maakLid,
  nieuwAdres,
  ruimLedenOp,
  vraagCodeAan,
  wacht,
} from './inloggen-hulp.ts';
import { bevestigAdresVoor } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';

test.afterAll(ruimLedenOp);

test.describe('inloggen met een code uit de mail', () => {
  test('een lid ontvangt een code, logt in en logt weer uit', async ({ page }) => {
    const email = nieuwAdres();
    await maakLid(email);
    await vraagCodeAan(page, email);
    await expect(page.getByLabel('E-mailadres')).toHaveValue(email);
    await expect(page.getByLabel('Code uit je mail')).toBeFocused();
    const mail = await inlogmailVoor(email);
    expect(mail.html).not.toMatch(/href=|https?:\/\//i);
    await logInMetCode(page, email, mail.code);
    await expect(page).toHaveURL(/\/mijn$/);
    await expect(page.getByRole('main')).toContainText(email);
    await page.getByRole('button', { name: 'Uitloggen' }).click();
    await expect(page).toHaveURL(/\/inloggen\?uitgelogd=1$/);
    await page.goto('/mijn');
    await expect(page).toHaveURL(/\/inloggen$/);
  });

  test('de code werkt op een ander apparaat', async ({ page, browser }) => {
    const email = nieuwAdres();
    await maakLid(email);
    await vraagCodeAan(page, email);
    const telefoon = await browser.newContext();
    const anderePagina = await telefoon.newPage();
    await logInMetCode(anderePagina, email, await inlogcodeVoor(email));
    await expect(anderePagina).toHaveURL(/\/mijn$/);
    await telefoon.close();
  });

  test('een foute code laat de goede code bruikbaar', async ({ page }) => {
    const email = nieuwAdres();
    await maakLid(email);
    await vraagCodeAan(page, email);
    const code = await inlogcodeVoor(email);
    const fout = code.slice(0, -1) + String((Number(code.at(-1)) + 1) % 10);
    await logInMetCode(page, email, fout);
    await expect(page.locator('#code-fout')).toContainText('Deze code klopt niet of is verlopen');
    await expect(page.getByLabel('E-mailadres')).toHaveValue(email);
    await logInMetCode(page, email, code);
    await expect(page).toHaveURL(/\/mijn$/);
  });

  test('een code werkt maar een keer', async ({ page }) => {
    const email = nieuwAdres();
    await maakLid(email);
    await vraagCodeAan(page, email);
    const code = await inlogcodeVoor(email);
    await logInMetCode(page, email, code);
    await expect(page).toHaveURL(/\/mijn$/);
    await page.getByRole('button', { name: 'Uitloggen' }).click();
    await expect(page).toHaveURL(/\/inloggen\?uitgelogd=1$/);
    await logInMetCode(page, email, code);
    await expect(page.locator('#code-fout')).toContainText('Deze code klopt niet of is verlopen');
    await page.goto('/mijn');
    await expect(page).toHaveURL(/\/inloggen$/);
  });

  test('een verlopen code geeft geen sessie', async ({ page }) => {
    const email = nieuwAdres();
    await maakLid(email);
    await vraagCodeAan(page, email);
    const code = await inlogcodeVoor(email);
    psql(`update auth.users set recovery_sent_at = now() - interval '25 hours' where email = '${email}';`);
    await logInMetCode(page, email, code);
    await expect(page.locator('#code-fout')).toContainText('Deze code klopt niet of is verlopen');
    await page.goto('/mijn');
    await expect(page).toHaveURL(/\/inloggen$/);
  });

  test('een code geeft geen toegang tot een ander account', async ({ page }) => {
    const email = nieuwAdres();
    const ander = nieuwAdres();
    await maakLid(email);
    await maakLid(ander);
    await vraagCodeAan(page, email);
    await logInMetCode(page, ander, await inlogcodeVoor(email));
    await expect(page.locator('#code-fout')).toContainText('Deze code klopt niet of is verlopen');
    await page.goto('/mijn');
    await expect(page).toHaveURL(/\/inloggen$/);
  });

  test('opnieuw aanvragen keert terug naar het adresformulier', async ({ page }) => {
    await vraagCodeAan(page, nieuwAdres());
    await page.getByRole('button', { name: 'Nieuwe code aanvragen' }).click();
    await expect(page.getByRole('heading', { name: 'Log in met je e-mailadres' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stuur mij een inlogcode' })).toBeVisible();
  });

  test('een onbekend adres krijgt hetzelfde antwoord, maar geen mail', async ({ page }) => {
    const email = nieuwAdres();
    await vraagCodeAan(page, email);
    await wacht(2000);
    expect(await mailsAan(email)).toHaveLength(0);
  });

  test('een ongeldig adres krijgt een fout bij het veld', async ({ page }) => {
    await page.goto('/inloggen');
    await page.getByLabel('E-mailadres').fill('a@b');
    await page.getByRole('button', { name: 'Stuur mij een inlogcode' }).click();
    await expect(page.getByLabel('E-mailadres')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('E-mailadres')).toHaveAccessibleDescription(/Dit lijkt geen e-mailadres/);
  });

  test('een kapotte code krijgt een fout bij het veld', async ({ page }) => {
    await page.goto('/inloggen?code=1');
    await logInMetCode(page, 'lid@example.com', 'geen-code');
    await expect(page.getByLabel('Code uit je mail')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#code-fout')).toContainText('Vul de volledige cijfercode');
  });

  test('de route werkt ook zonder JavaScript', async ({ browser }) => {
    const email = nieuwAdres();
    await maakLid(email);
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await vraagCodeAan(page, email);
    const code = await inlogcodeVoor(email);
    await logInMetCode(page, email, 'fout');
    await expect(page.locator('#code-fout')).toContainText('Vul de volledige cijfercode');
    await logInMetCode(page, email, code);
    await expect(page).toHaveURL(/\/mijn$/);
    await context.close();
  });

  test('bestaande handmatig gemaakte links blijven werken zonder verbruik bij vooraf openen', async ({
    page,
    request,
  }) => {
    const email = nieuwAdres();
    await maakLid(email);
    const link = await bevestigAdresVoor(email);
    expect((await request.get(link)).status()).toBe(200);
    await page.goto(link);
    await page.getByRole('button', { name: 'Inloggen', exact: true }).click();
    await expect(page).toHaveURL(/\/mijn$/);
  });

  test('een lege of kapotte oude link geeft een duidelijke melding', async ({ page }) => {
    await page.goto('/auth/bevestigen');
    await expect(page).toHaveURL(/\/inloggen\?fout=link$/);
    await expect(page.getByRole('main').getByRole('alert')).toContainText(
      'Vraag hieronder een inlogcode aan',
    );
    await page.goto('/auth/bevestigen?token_hash=bestaat-niet');
    await page.getByRole('button', { name: 'Inloggen', exact: true }).click();
    await expect(page).toHaveURL(/\/inloggen\?fout=link$/);
  });

  for (const pad of [
    '/inloggen',
    '/inloggen?code=1',
    '/inloggen?verstuurd=1',
    '/inloggen?fout=ongeldig',
    '/inloggen?fout=link',
  ]) {
    test(`${pad} is toegankelijk en past op het scherm`, async ({ page }) => {
      await page.goto(pad);
      expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        ),
      ).toBe(false);
    });
  }

  test('een ingevuld codeformulier en een codefout zijn toegankelijk', async ({ page }) => {
    const email = nieuwAdres();
    await maakLid(email);
    await vraagCodeAan(page, email);
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
    await logInMetCode(page, email, 'fout');
    await expect(page.locator('#code-fout')).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  });
});
