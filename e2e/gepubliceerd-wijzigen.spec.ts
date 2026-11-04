// Een gepubliceerde activiteit wijzigen (review F2-01), met echte gegevens: na het publiceren kan het bestuur nog indelen en
// corrigeren. Leden zien elke wijziging meteen; er gaat nog geen bericht uit (O-1). De eindverantwoordelijke is vast: alleen
// rechtstreeks te vervangen, door iemand met een telefoonnummer (R21). De controles zelf staan in public.activiteit_opslaan
// (pgTAP, `fase2_opslaan.test.sql`); deze tests bewijzen formulier, serveractie en wat een lid daarna ziet.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { logInAlsBeheerder, maakTestlid, ruimActiviteitenOp, ruimTestledenOp } from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { ruimLidOp } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';

const kenmerk = `T${crypto.randomUUID().slice(0, 7)}`;
let reeks = 0;
function maakNaam(soort: string): string {
  reeks += 1;
  return `E2E Wijzigen ${soort} ${reeks} ${kenmerk}`;
}

const aangemaakt: string[] = [];

test.afterAll(async () => {
  ruimActiviteitenOp(`E2E Wijzigen % ${kenmerk}`);
  psql(`delete from public.wijzigingen_log where omschrijving like '%E2E Wijzigen % ${kenmerk}%';`);
  ruimTestledenOp(kenmerk);
  for (const uid of aangemaakt.splice(0)) await ruimLidOp(uid);
});

const opslaan = (page: Page) => page.getByRole('button', { name: 'Wijzigingen opslaan' });

function aantal(tabel: string, voorwaarde: string): string {
  return psql(`select count(*) from public.${tabel} where ${voorwaarde};`).trim();
}

/** Een gepubliceerde activiteit met een eindverantwoordelijke (met nummer) en een werker, en een lege werkerplek. */
function maakGepubliceerd(naam: string, datum: string, ev: string, werker: string): string {
  const id = psql(`
    insert into public.activiteiten (naam, datum, starttijd, eindtijd, locatie, status)
    values ('${naam}', '${datum}', '20:00', '23:00', 'Oude zaal', 'gepubliceerd')
    returning id;
  `)
    .trim()
    .split('\n')[0]!;
  psql(`
    insert into public.rol_slots (activiteit_id, rol_type, volgorde, bezetter_id) values
      ('${id}', 'eindverantwoordelijke', 0, '${ev}'),
      ('${id}', 'werker', 1, '${werker}'),
      ('${id}', 'werker', 2, null);
  `);
  return id;
}

test('een gepubliceerde activiteit bewerken: de eindverantwoordelijke is vast en leden zien de wijziging meteen', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const ger = maakTestlid(`Ger${reeks + 1}`, kenmerk, {
    telefoon: '06 12 34 56 78',
    magEindverantwoordelijke: true,
  });
  const anna = maakTestlid(`Anna${reeks + 1}`, kenmerk);
  const bert = maakTestlid(`Bert${reeks + 1}`, kenmerk);
  const naam = maakNaam('stappen');
  const id = maakGepubliceerd(naam, '2099-07-07', ger.id, anna.id);

  await page.goto(`/beheer/activiteiten/${id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(naam);
  await expect(page.getByLabel('Naam *')).toHaveValue(naam);
  await expect(opslaan(page)).toBeVisible();
  // Geen publiceren en geen verwijderen meer: dat is voor een concept.
  await expect(page.getByRole('button', { name: 'Publiceren' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Concept verwijderen' })).toHaveCount(0);
  // De eindverantwoordelijke kun je vervangen, maar niet openlaten of weghalen (R21); een werker wel.
  await expect(
    page.getByLabel('Eindverantwoordelijke', { exact: true }).getByRole('option', { name: 'Plek openlaten' }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel('Werker 1', { exact: true }).getByRole('option', { name: 'Plek openlaten' }),
  ).toHaveCount(1);

  await page.getByLabel('Locatie *').fill('Nieuwe zaal');
  await page.getByLabel('Werker 2', { exact: true }).selectOption({ label: bert.naam });
  await opslaan(page).click();

  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);
  await expect(page.getByText(`${naam} is bijgewerkt.`)).toBeVisible();
  expect(psql(`select locatie from public.activiteiten where id = '${id}';`).trim()).toBe('Nieuwe zaal');
  expect(psql(`select versie from public.activiteiten where id = '${id}';`).trim()).toBe('2');
  expect(aantal('rol_slots', `activiteit_id = '${id}' and bezetter_id = '${bert.id}'`)).toBe('1');
  expect(aantal('wijzigingen_log', `actie = 'plek_toegewezen' and omschrijving like '%${naam}%'`)).toBe('1');

  // Een lid ziet het meteen: de nieuwe locatie en de nieuwe werker op het activiteitscherm.
  await page.goto(`/programma/${id}`);
  await expect(page.getByText('Nieuwe zaal').first()).toBeVisible();
  await expect(page.getByRole('region', { name: `Rolbezetting ${naam}` }).getByText(bert.naam)).toBeVisible();
  await expect(
    page.getByRole('region', { name: `Rolbezetting ${naam}` }).getByText('06 12 34 56 78'),
  ).toBeVisible();
});

test('een eindverantwoordelijke zonder telefoonnummer: waarschuwing, en er wordt niets opgeslagen', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const ger = maakTestlid(`Ger${reeks + 1}`, kenmerk, {
    telefoon: '06 12 34 56 78',
    magEindverantwoordelijke: true,
  });
  const anna = maakTestlid(`Anna${reeks + 1}`, kenmerk);
  const carla = maakTestlid(`Carla${reeks + 1}`, kenmerk, { magEindverantwoordelijke: true });
  const naam = maakNaam('zonder-nummer');
  const id = maakGepubliceerd(naam, '2099-07-08', ger.id, anna.id);

  await page.goto(`/beheer/activiteiten/${id}`);
  await page.getByLabel('Eindverantwoordelijke', { exact: true }).selectOption({ label: carla.naam });
  // De waarschuwing zegt ook hoe het nummer erbij komt: er is nog geen scherm voor, dus via de ledenlijst.
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: `${carla.naam} heeft nog geen telefoonnummer` })
      .filter({ hasText: 'ledenlijst' }),
  ).toBeVisible();
  await opslaan(page).click();

  await expect(
    page.getByRole('alert').filter({ hasText: 'geen telefoonnummer' }).filter({ hasText: 'ledenlijst' }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}$`));
  expect(aantal('rol_slots', `activiteit_id = '${id}' and bezetter_id = '${ger.id}'`)).toBe('1');
  expect(psql(`select versie from public.activiteiten where id = '${id}';`).trim()).toBe('1');
});

test('een gepubliceerde activiteit zonder eindtijd kan niet worden opgeslagen', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const ger = maakTestlid(`Ger${reeks + 1}`, kenmerk, { telefoon: '06 12 34 56 78' });
  const anna = maakTestlid(`Anna${reeks + 1}`, kenmerk);
  const naam = maakNaam('eindtijd');
  const id = maakGepubliceerd(naam, '2099-07-09', ger.id, anna.id);

  await page.goto(`/beheer/activiteiten/${id}`);
  await page.getByLabel('Eindtijd *').fill('');
  await opslaan(page).click();

  await expect(page.getByText('Vul een eindtijd in.')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}$`));
  expect(psql(`select eindtijd from public.activiteiten where id = '${id}';`).trim()).toBe('23:00:00');
});

test('een activiteit die al geweest is, laat zich niet meer wijzigen', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const ger = maakTestlid(`Ger${reeks + 1}`, kenmerk, { telefoon: '06 12 34 56 78' });
  const anna = maakTestlid(`Anna${reeks + 1}`, kenmerk);
  const naam = maakNaam('geweest');
  const id = maakGepubliceerd(naam, '2020-01-15', ger.id, anna.id);

  await page.goto(`/beheer/activiteiten/${id}`);
  await page.getByLabel('Locatie *').fill('Te laat');
  await opslaan(page).click();

  await expect(
    page.getByRole('alert').filter({ hasText: 'Deze activiteit staat niet meer open voor wijzigingen.' }),
  ).toBeVisible();
  expect(psql(`select locatie from public.activiteiten where id = '${id}';`).trim()).toBe('Oude zaal');
});

test('een geannuleerde activiteit toont wat er staat en heeft geen formulier', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const naam = maakNaam('geannuleerd');
  const id = psql(`
    insert into public.activiteiten (naam, datum, starttijd, eindtijd, locatie, status)
    values ('${naam}', '2099-07-10', '20:00', '23:00', 'Testlocatie', 'geannuleerd')
    returning id;
  `)
    .trim()
    .split('\n')[0]!;

  await page.goto(`/beheer/activiteiten/${id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(naam);
  await expect(page.getByText('Een geannuleerde activiteit is niet meer te wijzigen.')).toBeVisible();
  await expect(page.getByLabel('Naam *')).toHaveCount(0);
});

test('het formulier van een gepubliceerde activiteit heeft geen toegankelijkheidsfouten en schuift niet opzij', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const ger = maakTestlid(`Ger${reeks + 1}`, kenmerk, { telefoon: '06 12 34 56 78' });
  const anna = maakTestlid(`Anna${reeks + 1}`, kenmerk);
  const id = maakGepubliceerd(maakNaam('axe'), '2099-07-11', ger.id, anna.id);

  await page.goto(`/beheer/activiteiten/${id}`);
  await expect(opslaan(page)).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
  ).toBe(false);
});
