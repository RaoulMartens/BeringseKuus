// Beheerders beheren in de app (ronde 19), met echte gegevens: een beheerder maakt een lid beheerder, het lid stelt een app
// in, de beheerder leest de gegevens na en bevestigt, en trekt daarna de rechten weer in. De regels zelf (wie het mag, elke
// foutcode, dat een bevestigd lid echt beheerder is) staan in de databasetests (beheerders_beheren.test.sql); deze test
// bewijst de schermen, de serveracties en de routes ertussen.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { lidIdVan, logInAlsBeheerder } from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { nieuwAdres } from './inloggen-hulp.ts';
import { logInZonderBrowser, maakLidMetRol, ruimLidOp, schrijfAppIn } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';

const kenmerk = `T${crypto.randomUUID().slice(0, 7)}`;
const kandidaatNaam = `Kand ${kenmerk}`;
const aangemaakt: string[] = [];

test.afterAll(async () => {
  for (const uid of aangemaakt.splice(0)) {
    psql(`delete from public.wijzigingen_log where rij_id = '${lidIdVan(uid)}';`);
    await ruimLidOp(uid);
  }
});

test('een beheerder maakt een lid beheerder, bevestigt de toegang en trekt de rechten in', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));

  // Een lid met een inlogaccount dat nog geen beheerder is.
  const kandidaatMail = nieuwAdres();
  const kandidaatUid = await maakLidMetRol(kandidaatMail);
  aangemaakt.push(kandidaatUid);
  psql(
    `update public.leden set voornaam = 'Kand', achternaam = '${kenmerk}' where auth_user_id = '${kandidaatUid}';`,
  );

  // De ingang staat op het activiteitenoverzicht.
  await page.goto('/beheer');
  await page.getByRole('link', { name: /Beheerders bekijken|toegang(en)? bevestigen/ }).click();
  await expect(page).toHaveURL(/\/beheer\/beheerders$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Beheerders' })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  // Kiezen en bevestigen.
  await page.getByRole('link', { name: 'Beheerder toevoegen' }).click();
  await page.getByLabel('Zoek op naam').fill(kenmerk);
  await expect(page.getByText('1 lid gevonden.')).toBeVisible();
  await page.getByRole('link', { name: kandidaatNaam }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: `${kandidaatNaam} beheerder maken?` }),
  ).toBeVisible();
  await expect(page.getByText('Er gaat geen bericht uit.')).toBeVisible();
  await page.getByRole('button', { name: 'Beheerder maken' }).click();

  // Terug op het overzicht, met de melding in de woorden van de knop; het lid moet nog een app instellen.
  await expect(page).toHaveURL(/\/beheer\/beheerders\?toegevoegd=/);
  await expect(page.getByText(`${kandidaatNaam} is beheerder gemaakt.`)).toBeVisible();
  const kandidaatRij = page.getByRole('listitem').filter({ hasText: kandidaatNaam });
  await expect(kandidaatRij).toContainText('Moet nog een app instellen');
  expect(
    psql(`select is_admin from public.leden_prive where lid_id = '${lidIdVan(kandidaatUid)}';`).trim(),
  ).toBe('t');

  // Het lid stelt zelf een app in. Daarna vraagt het overzicht jouw aandacht.
  await schrijfAppIn(await logInZonderBrowser(kandidaatMail));
  await page.goto('/beheer/beheerders');
  const aandacht = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Vraagt aandacht' }) });
  await expect(aandacht).toContainText(kandidaatNaam);
  await expect(aandacht).toContainText('Toegang bevestigen');
  await aandacht.getByRole('link', { name: new RegExp(kandidaatNaam) }).click();

  // Nalezen en bevestigen.
  await expect(
    page.getByRole('heading', { level: 1, name: `Toegang van ${kandidaatNaam} bevestigen?` }),
  ).toBeVisible();
  await expect(page.getByText('Aantal apps')).toBeVisible();
  await expect(page.getByText('Vraag het')).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Toegang bevestigen' }).click();
  await expect(page).toHaveURL(/\/beheer\/beheerders\?bevestigd=/);
  await expect(page.getByText(`De toegang van ${kandidaatNaam} is bevestigd.`)).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: kandidaatNaam })).toContainText(
    'Beheerder sinds',
  );
  // De bevestiging is een beheerder_sinds ná de app: het lid telt nu echt als beheerder.
  expect(
    psql(`
      select count(*) from public.leden_prive p
        join auth.mfa_factors f on f.user_id = '${kandidaatUid}' and f.status = 'verified'
       where p.lid_id = '${lidIdVan(kandidaatUid)}' and p.beheerder_sinds > f.created_at;
    `).trim(),
  ).toBe('1');

  // Intrekken: eigen pagina, daarna is het lid geen beheerder meer en is de app los.
  await page
    .getByRole('listitem')
    .filter({ hasText: kandidaatNaam })
    .getByRole('link', { name: 'Rechten intrekken' })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: `Beheerrechten van ${kandidaatNaam} intrekken?` }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Rechten intrekken' }).click();
  await expect(page).toHaveURL(/\/beheer\/beheerders\?ingetrokken=/);
  await expect(page.getByText(`${kandidaatNaam} is geen beheerder meer.`)).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: kandidaatNaam })).toHaveCount(0);
  expect(
    psql(`select is_admin from public.leden_prive where lid_id = '${lidIdVan(kandidaatUid)}';`).trim(),
  ).toBe('f');
  expect(psql(`select count(*) from auth.mfa_factors where user_id = '${kandidaatUid}';`).trim()).toBe('0');
});

test('je eigen toegang bevestig of trek je niet in', async ({ page }) => {
  const uid = await logInAlsBeheerder(page);
  aangemaakt.push(uid);

  await page.goto('/beheer/beheerders');
  await expect(page.getByText('(jij)')).toBeVisible();
  const eigenRij = page.getByRole('listitem').filter({ hasText: '(jij)' });
  await expect(eigenRij.getByRole('link', { name: 'Rechten intrekken' })).toHaveCount(0);

  // Via de adresbalk kom je er ook niet: je wordt teruggestuurd naar het overzicht.
  await page.goto(`/beheer/beheerders/${lidIdVan(uid)}/intrekken`);
  await expect(page).toHaveURL(/\/beheer\/beheerders$/);
  await page.goto(`/beheer/beheerders/${lidIdVan(uid)}/bevestigen`);
  await expect(page).toHaveURL(/\/beheer\/beheerders$/);
});
