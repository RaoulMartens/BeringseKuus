// Leden beheren in de app (UC-013), met echte gegevens: een beheerder zoekt een lid, wijzigt telefoon en aanmerking, zet het lid op inactief (de plek
// valt leeg) en maakt het weer actief. De regels zelf (wie het mag, elke foutcode, de blokkade, dat de historie blijft) staan in de databasetests
// (ledenbeheer.test.sql); deze test bewijst de schermen, de serveracties en de routes ertussen.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  lidIdVan,
  logInAlsBeheerder,
  maakTestlid,
  ruimActiviteitenOp,
  ruimTestledenOp,
} from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { ruimLidOp } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';

const kenmerk = `T${crypto.randomUUID().slice(0, 7)}`;
const activiteitNaam = `Leden ${kenmerk}`;
const aangemaakt: string[] = [];

test.afterAll(async () => {
  psql(
    `delete from public.wijzigingen_log where rij_id in (select id from public.leden where achternaam = '${kenmerk}');`,
  );
  ruimActiviteitenOp(`%${kenmerk}`);
  ruimTestledenOp(kenmerk);
  for (const uid of aangemaakt.splice(0)) {
    psql(`delete from public.wijzigingen_log where rij_id = '${lidIdVan(uid)}';`);
    await ruimLidOp(uid);
  }
});

test('een beheerder wijzigt een lid, zet het op inactief en maakt het weer actief', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const lid = maakTestlid('Truus', kenmerk);
  psql(`
    insert into public.lid_groep (lid_id, groep_id) select '${lid.id}', id from public.groepen where naam = 'Dames';
    with a as (insert into public.activiteiten (naam, datum) values ('${activiteitNaam}', current_date + 30) returning id)
    insert into public.rol_slots (activiteit_id, rol_type, bezetter_id) select id, 'werker', '${lid.id}' from a;
  `);

  // De ingang staat op het activiteitenoverzicht; het lid heeft geen account en staat dus onder "Vraagt aandacht".
  await page.goto('/beheer');
  // Eén kaart "Ledenbeheer" met een rij Leden (en de taak: wie nog niet is ingelogd), een rij Beheerders en een rij Wijzigingen.
  const ledenbeheer = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Ledenbeheer' }) });
  await expect(ledenbeheer.getByRole('link')).toHaveCount(3);
  await expect(ledenbeheer.getByRole('link', { name: /^Leden\b.*nog niet ingelogd/ })).toBeVisible();
  await ledenbeheer.getByRole('link', { name: /^Leden\b/ }).click();
  await expect(page).toHaveURL(/\/beheer\/leden$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Leden' })).toBeVisible();
  const aandacht = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Vraagt aandacht' }) });
  await expect(aandacht).toContainText(lid.naam);
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  // Zoeken filtert de lijst terwijl je typt.
  await page.getByLabel('Zoek een lid').fill(kenmerk);
  await page
    .getByRole('main')
    .getByRole('link', { name: new RegExp(lid.naam) })
    .last()
    .click();
  await expect(page).toHaveURL(new RegExp(`/beheer/leden/${lid.id}$`));
  await expect(page.getByRole('heading', { level: 1, name: lid.naam })).toBeVisible();
  await expect(page.getByText(activiteitNaam)).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  // Zonder wijziging valt er niets op te slaan; met een wijziging telt het paneel mee en wordt de knop actief.
  const opslaan = page.getByRole('button', { name: 'Wijzigingen opslaan' });
  await expect(page.getByText('Niets gewijzigd')).toBeVisible();
  await expect(opslaan).toBeDisabled();
  await page.getByLabel('Telefoonnummer').fill('06 12 34 56 78');
  await expect(page.getByText('1 wijziging nog niet opgeslagen')).toBeVisible();
  await page.getByLabel('Mag BOB zijn').check();
  await expect(page.getByText('2 wijzigingen nog niet opgeslagen')).toBeVisible();
  await expect(opslaan).toBeEnabled();
  await opslaan.click();

  // Terug op het overzicht, met de melding in de woorden van de knop; de database heeft het.
  await expect(page).toHaveURL(/\/beheer\/leden\?opgeslagen=/);
  await expect(page.getByText(`De wijzigingen voor ${lid.naam} zijn opgeslagen.`)).toBeVisible();
  expect(
    psql(`select telefoon || ' ' || mag_bob from public.leden_prive where lid_id = '${lid.id}';`).trim(),
  ).toBe('06 12 34 56 78 true');

  // Een telefoonnummer dat niet klopt blijft op de pagina, met de reden.
  await page.goto(`/beheer/leden/${lid.id}`);
  await page.getByLabel('Telefoonnummer').fill('12345');
  await opslaan.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Dit telefoonnummer klopt niet' })).toBeVisible();
  expect(psql(`select telefoon from public.leden_prive where lid_id = '${lid.id}';`).trim()).toBe(
    '06 12 34 56 78',
  );

  // Op inactief zetten: een eigen pagina die vooraf toont wat er open valt.
  await page.goto(`/beheer/leden/${lid.id}/inactief`);
  await expect(
    page.getByRole('heading', { level: 1, name: `${lid.naam} op inactief zetten?` }),
  ).toBeVisible();
  await expect(page.getByText('Deze plekken vallen open (1)')).toBeVisible();
  await expect(page.getByText(activiteitNaam)).toBeVisible();
  await expect(page.getByText('Er gaat geen bericht uit')).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Op inactief zetten' }).click();
  await expect(page).toHaveURL(/\/beheer\/leden\?inactief=.*&open=1/);
  await expect(page.getByText(`${lid.naam} staat op inactief.`)).toBeVisible();
  expect(psql(`select actief from public.leden where id = '${lid.id}';`).trim()).toBe('f');
  expect(psql(`select count(*) from public.rol_slots where bezetter_id = '${lid.id}';`).trim()).toBe('0');

  // Een inactief lid staat bij de inactieve leden; weer actief maken kan op een eigen pagina.
  await page.goto('/beheer/leden/inactief');
  await expect(page.getByRole('heading', { level: 1, name: 'Inactieve leden' })).toBeVisible();
  await page
    .getByRole('main')
    .getByRole('link', { name: new RegExp(lid.naam) })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: `${lid.naam} weer actief maken?` })).toBeVisible();
  await page.getByRole('button', { name: 'Weer actief maken' }).click();
  await expect(page).toHaveURL(/\/beheer\/leden\?actief=/);
  await expect(page.getByText(`${lid.naam} is weer actief.`)).toBeVisible();
  expect(psql(`select actief from public.leden where id = '${lid.id}';`).trim()).toBe('t');
});

test('zonder inloggen komt niemand bij ledenbeheer', async ({ page }) => {
  await page.goto('/beheer/leden');
  await expect(page).not.toHaveURL(/\/beheer\/leden$/);
});
