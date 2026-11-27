// Een dienst overnemen (bestuur), met echte gegevens: een bestuurslid ziet "Neem over" achter de naam van een ander, bevestigt, en staat daarna zelf op de plek. De regels
// (wie het mag, elke foutcode, de locks) staan in de databasetests (dienst_overnemen.test.sql); deze test bewijst de schermen en de route ertussen.
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
const naam = `Overname ${kenmerk}`;
const aangemaakt: string[] = [];

test.afterAll(async () => {
  psql(`delete from public.wijzigingen_log where omschrijving like '%${kenmerk}%';`);
  ruimActiviteitenOp(`%${kenmerk}`);
  ruimTestledenOp(kenmerk);
  for (const uid of aangemaakt.splice(0)) {
    psql(
      `delete from public.wijzigingen_log where rij_id = '${lidIdVan(uid)}' or door_lid_id = '${lidIdVan(uid)}';`,
    );
    await ruimLidOp(uid);
  }
});

test('het bestuur neemt een dienst over in drie klikken', async ({ page }) => {
  const uid = await logInAlsBeheerder(page);
  aangemaakt.push(uid);
  const ik = lidIdVan(uid);
  const lid = maakTestlid('Truus', kenmerk);
  const activiteit = crypto.randomUUID();
  psql(`
    insert into public.activiteiten (id, naam, datum, starttijd, eindtijd, locatie, status)
    values ('${activiteit}', '${naam}', current_date + 30, '19:00', '23:00', 'Testzaal', 'gepubliceerd');
    insert into public.rol_slots (activiteit_id, rol_type, bezetter_id, volgorde) values ('${activiteit}', 'werker', '${lid.id}', 1);
  `);

  await page.goto(`/programma/${activiteit}`);
  await expect(page.getByText(lid.naam, { exact: true })).toBeVisible();
  await page.getByRole('link', { name: /^Neem de dienst van .* over$/ }).click();

  // De bevestigingspagina: wat er gebeurt, met het werkwoord op de knop.
  await expect(
    page.getByRole('heading', { level: 1, name: `Dienst van ${lid.naam} overnemen?` }),
  ).toBeVisible();
  await expect(page.getByText('krijgt een mail dat je de dienst hebt overgenomen')).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Dienst overnemen' }).click();

  // Terug op de activiteit: de melding, en jij staat op de plek.
  await expect(page).toHaveURL(new RegExp(`/programma/${activiteit}\\?overgenomen=`));
  await expect(page.getByText('Je hebt de dienst als werker overgenomen.')).toBeVisible();
  expect(
    psql(
      `select bezetter_id from public.rol_slots where activiteit_id = '${activiteit}' and rol_type = 'werker';`,
    ).trim(),
  ).toBe(ik);
  expect(
    psql(
      `select count(*) from public.wijzigingen_log where actie = 'dienst_overgenomen' and omschrijving like '%${naam}%';`,
    ).trim(),
  ).toBe('1');
});

test('een gewoon lid ziet geen "Neem over"', async ({ page }) => {
  await page.goto('/programma');
  await expect(page).not.toHaveURL(/\/programma\/.+\/overnemen\//);
});
