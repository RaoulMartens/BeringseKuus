// Mijn account toont waar je bij hoort: lid, de groepen (Raad van Elf, Dames, …) en beheer. De groepen bepalen welke activiteiten je
// ziet (R22), dus je moet ze hier terugzien. Echte gegevens, een eigen groep per test.
import { expect, test } from '@playwright/test';

import { lidIdVan } from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { nieuwAdres } from './inloggen-hulp.ts';
import { bevestigAdresVoor, maakLidMetRol, ruimLidOp } from './mfa-hulp.ts';

const kenmerk = `T${crypto.randomUUID().slice(0, 7)}`;
const aangemaakt: string[] = [];

test.afterAll(async () => {
  psql(`delete from public.groepen where naam like 'E2E Mijn % ${kenmerk}';`);
  for (const uid of aangemaakt.splice(0)) await ruimLidOp(uid);
});

test('Mijn account noemt je groepen, op volgorde, en zonder groep alleen "Lid"', async ({ page }) => {
  const email = nieuwAdres();
  const uid = await maakLidMetRol(email);
  aangemaakt.push(uid);
  await page.goto(await bevestigAdresVoor(email));
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page).toHaveURL(/\/mijn$/);

  await expect(page.getByText('Je bent').locator('xpath=following-sibling::dd')).toHaveText('Lid');

  const lid = lidIdVan(uid);
  psql(`
    begin;
    insert into public.groepen (naam, volgorde) values ('E2E Mijn tweede ${kenmerk}', 97), ('E2E Mijn eerste ${kenmerk}', 96);
    insert into public.lid_groep (lid_id, groep_id) select '${lid}', id from public.groepen where naam like 'E2E Mijn % ${kenmerk}';
    commit;
  `);
  await page.reload();
  await expect(page.getByText('Je bent').locator('xpath=following-sibling::dd')).toHaveText(
    `E2E Mijn eerste ${kenmerk} en E2E Mijn tweede ${kenmerk}`,
  );
});

test('een beheeraccount (alleen beheer) heet op Mijn account gewoon Beheerder', async ({ page }) => {
  const email = nieuwAdres();
  const uid = await maakLidMetRol(email);
  aangemaakt.push(uid);
  await page.goto(await bevestigAdresVoor(email));
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page).toHaveURL(/\/mijn$/);

  const lid = lidIdVan(uid);
  psql(`
    update public.leden set alleen_beheer = true where id = '${lid}';
    update public.leden_prive set is_admin = true, beheerder_sinds = now() where lid_id = '${lid}';
  `);
  await page.reload();
  await expect(page.getByText('Je bent').locator('xpath=following-sibling::dd')).toHaveText('Beheerder');
});

test('een lid zet zijn eigen telefoonnummer op Mijn account en kan het daarna wijzigen', async ({ page }) => {
  const email = nieuwAdres();
  const uid = await maakLidMetRol(email);
  aangemaakt.push(uid);
  await page.goto(await bevestigAdresVoor(email));
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page).toHaveURL(/\/mijn$/);

  const lid = lidIdVan(uid);
  const bewaard = () =>
    psql(`select coalesce(telefoon, '') from public.leden_prive where lid_id = '${lid}';`).trim();
  const veld = page.getByLabel('Telefoonnummer');
  await expect(veld).toHaveValue('');
  // Zonder nummer staat het veld meteen open, en er is niets om naar terug te gaan.
  await expect(page.getByRole('button', { name: 'Annuleren' })).toHaveCount(0);

  // Een nummer dat niet klopt: een melding bij het veld, niets bewaard.
  await veld.fill('abc');
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Dit nummer klopt niet' })).toBeVisible();
  expect(bewaard()).toBe('');

  // Een geldig nummer: bewaard in de vorm van de lijst, en je ziet het nummer als tekst met de melding dat het gelukt is.
  await veld.fill('0612345678');
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.getByText('Je nummer is opgeslagen.')).toBeVisible();
  await expect(page.getByText('06 12 34 56 78', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Telefoonnummer')).toHaveCount(0);
  expect(bewaard()).toBe('06 12 34 56 78');

  // Wijzigen: het veld opent met het huidige nummer; Annuleren laat alles zoals het was.
  await page.getByRole('button', { name: 'Wijzig telefoonnummer' }).click();
  await expect(page.getByLabel('Telefoonnummer')).toHaveValue('06 12 34 56 78');
  await page.getByRole('button', { name: 'Annuleren' }).click();
  await expect(page.getByText('06 12 34 56 78', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Telefoonnummer')).toHaveCount(0);

  // Een fout bij het wijzigen houdt het veld open met wat je typte; annuleren brengt je terug bij het opgeslagen nummer.
  await page.getByRole('button', { name: 'Wijzig telefoonnummer' }).click();
  await page.getByLabel('Telefoonnummer').fill('abc');
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Dit nummer klopt niet' })).toBeVisible();
  await expect(page.getByLabel('Telefoonnummer')).toHaveValue('abc');
  await page.getByRole('button', { name: 'Annuleren' }).click();
  await expect(page.getByText('06 12 34 56 78', { exact: true })).toBeVisible();
  expect(bewaard()).toBe('06 12 34 56 78');

  // Een nieuw nummer: bewaard, en weer als tekst.
  await page.getByRole('button', { name: 'Wijzig telefoonnummer' }).click();
  await page.getByLabel('Telefoonnummer').fill('0687654321');
  await page.getByRole('button', { name: 'Opslaan' }).click();
  await expect(page.getByText('06 87 65 43 21', { exact: true })).toBeVisible();
  expect(bewaard()).toBe('06 87 65 43 21');

  // Na een nieuwe aanvraag staat het nummer er nog, als tekst.
  await page.reload();
  await expect(page.getByText('06 87 65 43 21', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Telefoonnummer')).toHaveCount(0);
});
