// Alle dagen van een reeks tegelijk bewerken, met echte gegevens: vanuit het beheeroverzicht naar het formulier, dezelfde tijden, plaats
// en eindverantwoordelijke voor alle dagen invullen, opslaan als concept en alle dagen tegelijk publiceren. De controles van de database
// (per dag dezelfde als bij één activiteit, alles of niets, elke foutcode) staan in bulk_wijzigen.test.sql; de logica in
// src/lib/reeksbewerken.test.ts. Deze tests bewijzen het geheel: de pagina, de serveractie en de database.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { logInAlsBeheerder, maakTestlid, ruimActiviteitenOp, ruimTestledenOp } from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { ruimLidOp } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';

const lopende = crypto.randomUUID().slice(0, 8);
const kenmerk = `T${lopende.slice(0, 7)}`;
let teller = 0;
const maakNaam = (soort: string): string => `E2E Reeks ${soort} ${(teller += 1)} ${lopende}`;
const aangemaakt: string[] = [];

test.afterAll(async () => {
  ruimActiviteitenOp(`E2E Reeks % ${lopende}`);
  psql(`delete from public.wijzigingen_log where omschrijving like 'E2E Reeks % ${lopende}%';`);
  ruimTestledenOp(kenmerk);
  for (const uid of aangemaakt.splice(0)) await ruimLidOp(uid);
});

/** Een reeks concepten met dezelfde naam op opeenvolgende dagen, elk met de lege eindverantwoordelijke. Geeft de id's, op datum. */
function maakReeks(naam: string, dagen: number, begin = 60): string {
  psql(`
    insert into public.activiteiten (naam, datum) select '${naam}', current_date + ${begin} + g from generate_series(0, ${dagen - 1}) g;
    insert into public.rol_slots (activiteit_id, rol_type, volgorde)
      select id, 'eindverantwoordelijke', 0 from public.activiteiten where naam = '${naam}';
  `);
  return psql(
    `select string_agg(id::text, ',' order by datum) from public.activiteiten where naam = '${naam}';`,
  ).trim();
}

function veldWaarden(naam: string, kolom: string): string {
  return psql(
    `select string_agg(coalesce(${kolom}::text, '-'), ',' order by datum) from public.activiteiten where naam = '${naam}';`,
  ).trim();
}

async function opFormulier(page: Page, ids: string): Promise<void> {
  aangemaakt.push(await logInAlsBeheerder(page));
  await page.goto(`/beheer/activiteiten/reeks?ids=${ids}`);
}

test('vanuit de reeks in het overzicht: alle dagen krijgen dezelfde gegevens en dezelfde eindverantwoordelijke', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const naam = maakNaam('gegevens');
  maakReeks(naam, 3);
  const ev = maakTestlid('Eva', kenmerk, { magEindverantwoordelijke: true, telefoon: '06 12 34 56 78' });

  // De reeks staat als één rij in het overzicht; open hem en kies "Alle 3 dagen bewerken".
  await page.goto('/beheer');
  const samenvatting = page.locator('summary').filter({ hasText: naam });
  await expect(samenvatting).toHaveCount(1);
  await samenvatting.click();
  await page
    .locator('details', { has: samenvatting })
    .getByRole('link', { name: 'Alle 3 dagen bewerken' })
    .click();
  await expect(page).toHaveURL(/\/beheer\/activiteiten\/reeks\?ids=/);
  await expect(page.getByRole('heading', { level: 1, name: `${naam} bewerken` })).toBeVisible();
  await expect(page.getByText('Voor alle 3 dagen')).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  await page.getByLabel('Starttijd').fill('10:00');
  await page.getByLabel('Eindtijd').fill('12:30');
  await page.getByLabel('Locatie', { exact: true }).fill('Teststraat 1');
  await page.getByLabel('Belangrijk om te weten').fill('Voor alle dagen');
  await page.getByLabel('Eindverantwoordelijke voor alle dagen').selectOption({ label: ev.naam });
  await page.getByRole('button', { name: 'Opslaan als concept' }).click();

  await expect(page).toHaveURL(/\/beheer\?reekswijzigd=3$/);
  await expect(page.getByText('3 dagen bijgewerkt.')).toBeVisible();
  expect(veldWaarden(naam, 'starttijd')).toBe('10:00:00,10:00:00,10:00:00');
  expect(veldWaarden(naam, 'eindtijd')).toBe('12:30:00,12:30:00,12:30:00');
  expect(veldWaarden(naam, 'locatie')).toBe('Teststraat 1,Teststraat 1,Teststraat 1');
  expect(veldWaarden(naam, 'notitie')).toBe('Voor alle dagen,Voor alle dagen,Voor alle dagen');
  expect(veldWaarden(naam, 'status')).toBe('concept,concept,concept');
  expect(
    psql(`select count(*) from public.rol_slots s join public.activiteiten a on a.id = s.activiteit_id
           where a.naam = '${naam}' and s.rol_type = 'eindverantwoordelijke' and s.bezetter_id = '${ev.id}';`).trim(),
  ).toBe('3');
});

test('een dag die niet kan, blokkeert alle dagen: er verandert niets en wat je invulde blijft staan', async ({
  page,
}) => {
  const naam = maakNaam('blokkade');
  const ids = maakReeks(naam, 3);
  await opFormulier(page, ids);

  // Publiceren zonder eindverantwoordelijke kan niet: de melding noemt de dag, en niets is gewijzigd.
  await page.getByLabel('Starttijd').fill('10:00');
  await page.getByLabel('Eindtijd').fill('12:00');
  await page.getByLabel('Locatie', { exact: true }).fill('Teststraat 2');
  await page.getByRole('button', { name: 'Alle 3 dagen publiceren' }).click();
  await expect(
    page.getByText(/Publiceren kan nog niet: op .* ontbreekt een eindverantwoordelijke/),
  ).toBeVisible();
  await expect(page.getByText(/geen enkele dag iets gewijzigd/)).toBeVisible();
  await expect(page.getByLabel('Locatie', { exact: true })).toHaveValue('Teststraat 2');
  await expect(page).toHaveURL(/\/beheer\/activiteiten\/reeks\?ids=/);
  expect(veldWaarden(naam, 'status')).toBe('concept,concept,concept');
  expect(veldWaarden(naam, 'locatie')).toBe('-,-,-');
  expect(veldWaarden(naam, 'versie')).toBe('1,1,1');
});

test('alle dagen tegelijk publiceren, als elke dag compleet is', async ({ page }) => {
  const naam = maakNaam('publiceren');
  const ids = maakReeks(naam, 3);
  const ev = maakTestlid('Pim', kenmerk, { magEindverantwoordelijke: true, telefoon: '06 12 34 56 78' });
  await opFormulier(page, ids);

  await page.getByLabel('Starttijd').fill('10:00');
  await page.getByLabel('Eindtijd').fill('12:00');
  await page.getByLabel('Locatie', { exact: true }).fill('Teststraat 3');
  await page.getByLabel('Eindverantwoordelijke voor alle dagen').selectOption({ label: ev.naam });
  await page.getByRole('button', { name: 'Alle 3 dagen publiceren' }).click();

  await expect(page).toHaveURL(/\/beheer\?reekspubliceerd=3$/);
  await expect(page.getByText('3 dagen gepubliceerd.')).toBeVisible();
  expect(veldWaarden(naam, 'status')).toBe('gepubliceerd,gepubliceerd,gepubliceerd');

  // Een reeks die gepubliceerd is, bewerk je hier niet meer: je wordt teruggestuurd.
  await page.goto(`/beheer/activiteiten/reeks?ids=${ids}`);
  await expect(page).toHaveURL(/\/beheer$/);
});

test('dagen die verschillen blijven zoals ze zijn tenzij je er iets invult, en zonder wijziging zegt het scherm dat', async ({
  page,
}) => {
  const naam = maakNaam('verschil');
  const ids = maakReeks(naam, 3);
  psql(`update public.activiteiten set eindtijd = '21:00' where naam = '${naam}' and datum = current_date + 60;
        update public.activiteiten set eindtijd = '22:00' where naam = '${naam}' and datum = current_date + 61;`);
  await opFormulier(page, ids);

  // De dagen verschillen bij de eindtijd: het veld staat leeg met "Verschilt per dag".
  await expect(page.getByLabel('Eindtijd')).toHaveAttribute('placeholder', 'Verschilt per dag');
  await expect(page.getByLabel('Eindtijd')).toHaveValue('');
  await expect(page.getByLabel('Starttijd')).not.toHaveAttribute('placeholder', 'Verschilt per dag');

  // Zonder iets in te vullen: er is niets gewijzigd.
  await page.getByRole('button', { name: 'Opslaan als concept' }).click();
  await expect(page.getByText('Er is niets gewijzigd.')).toBeVisible();

  // Alleen de locatie invullen: de verschillende eindtijden blijven.
  await page.getByLabel('Locatie', { exact: true }).fill('Teststraat 4');
  await page.getByRole('button', { name: 'Opslaan als concept' }).click();
  await expect(page).toHaveURL(/\/beheer\?reekswijzigd=3$/);
  expect(veldWaarden(naam, 'locatie')).toBe('Teststraat 4,Teststraat 4,Teststraat 4');
  expect(veldWaarden(naam, 'eindtijd')).toBe('21:00:00,22:00:00,-');
});

test('de dagen kunnen alle dezelfde groep krijgen, en een tijd die geen tijd is wordt bij het veld gemeld', async ({
  page,
}) => {
  const naam = maakNaam('groep');
  const ids = maakReeks(naam, 2);
  await opFormulier(page, ids);

  await page.getByLabel('Eindtijd').fill('laat');
  await page.getByRole('button', { name: 'Opslaan als concept' }).click();
  await expect(page.getByText('Dit is geen tijd. Vul hem in als 18:30.')).toBeVisible();
  await expect(page.getByLabel('Eindtijd')).toHaveValue('laat');

  await page.getByLabel('Eindtijd').fill('');
  await page.getByLabel('Voor wie voor alle dagen instellen').check();
  await page.getByRole('checkbox', { name: /^Bestuur/ }).check();
  await page.getByRole('button', { name: 'Opslaan als concept' }).click();
  await expect(page).toHaveURL(/\/beheer\?reekswijzigd=2$/);
  expect(
    psql(`select count(*) from public.activiteit_groep g join public.activiteiten a on a.id = g.activiteit_id
           join public.groepen gr on gr.id = g.groep_id where a.naam = '${naam}' and gr.naam = 'Bestuur';`).trim(),
  ).toBe('2');
});

test('zonder bruikbare dagen gaat de beheerder terug naar het overzicht', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  await page.goto(`/beheer/activiteiten/reeks?ids=${crypto.randomUUID()},${crypto.randomUUID()}`);
  await expect(page).toHaveURL(/\/beheer$/);
  await page.goto('/beheer/activiteiten/reeks?ids=geen-id');
  await expect(page).toHaveURL(/\/beheer$/);
});
