// Meerdere activiteiten tegelijk aanmaken met een Excel-bestand (UC-006), met echte gegevens: het bestand wordt in de browser
// gelezen, de regels worden nagelopen op het controlescherm, en "N concepten aanmaken" maakt ze in één keer aan. De controles
// van de database (alles of niets, idempotent, elke foutcode) staan in bulk_aanmaken.test.sql; de leeslogica in
// src/lib/xlsx.test.ts en activiteitenimport.test.ts. Deze tests bewijzen het geheel: de pagina, de serveractie en de database.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { lidIdVan, logInAlsBeheerder, ruimActiviteitenOp } from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { ruimLidOp } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';
import { excelDatum, maakXlsx } from './xlsx-hulp.ts';

const lopende = crypto.randomUUID().slice(0, 8);
let teller = 0;
/** De naam van een activiteit van deze test; elke test maakt zijn eigen namen, zodat ze niet botsen. */
const maakNaam = (soort: string): string => `E2E Bulk ${soort} ${(teller += 1)} ${lopende}`;

const KOP = [
  'naam',
  'datum',
  'verzameltijd',
  'starttijd',
  'eindtijd',
  'locatie',
  'busvertrek',
  'notitie',
  'voor_wie',
];
const aangemaakt: string[] = [];

test.afterAll(async () => {
  ruimActiviteitenOp(`E2E Bulk % ${lopende}`);
  for (const uid of aangemaakt.splice(0)) {
    psql(`delete from public.wijzigingen_log where omschrijving like 'E2E Bulk % ${lopende}%';`);
    psql(`delete from public.bulk_aanmaken where door_lid_id = '${lidIdVan(uid)}';`);
    await ruimLidOp(uid);
  }
});

async function opBulkpagina(page: Page): Promise<void> {
  aangemaakt.push(await logInAlsBeheerder(page));
  await page.goto('/beheer/activiteiten/bulk');
  await expect(page.getByRole('heading', { level: 1, name: 'Meerdere activiteiten aanmaken' })).toBeVisible();
}

async function kiesBestand(page: Page, naam: string, buffer: Buffer): Promise<void> {
  await page.locator('input[type=file]').setInputFiles({
    name: naam,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
}

function aantal(voorwaarde: string): string {
  return psql(`select count(*) from public.activiteiten where ${voorwaarde};`).trim();
}

test('een Excel-bestand wordt in één keer meerdere concepten, met de groepen en lege plekken', async ({
  page,
}) => {
  await opBulkpagina(page);
  const een = maakNaam('een');
  const twee = maakNaam('twee');
  await kiesBestand(
    page,
    'activiteiten.xlsx',
    maakXlsx([
      KOP,
      [
        een,
        excelDatum('2099-03-15'),
        '18:30',
        0.8125,
        '23:00',
        'Testlocatie',
        null,
        'Let op',
        'Bestuur; Raad van Elf',
      ],
      [twee, '16-03-2099', null, '20:00', null, 'Kuus', '17:00', null, null],
      ['Voorbeeld: Bonte Avond', '11-02-2099', null, '19:00', null, 'x', null, null, null],
    ]),
  );

  // Het controlescherm: de regels, het aantal, en de overgeslagen voorbeeldregel.
  await expect(page.getByRole('heading', { level: 2, name: 'Controleer de activiteiten' })).toBeVisible();
  await expect(page.getByText(een)).toBeVisible();
  await expect(page.getByText(twee)).toBeVisible();
  await expect(page.getByText('1 voorbeeldregel is overgeslagen.')).toBeVisible();
  await expect(page.getByText('2 concepten', { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  // Een keer klikken op "2 concepten aanmaken": terug op het overzicht met de melding.
  await page.getByRole('button', { name: '2 concepten aanmaken' }).click();
  await expect(page).toHaveURL(/\/beheer\?aangemaakt=2$/);
  await expect(page.getByText('2 concepten aangemaakt.')).toBeVisible();

  // De database: twee concepten, de eerste voor twee groepen, elk met één lege eindverantwoordelijke.
  expect(aantal(`naam in ('${een}', '${twee}') and status = 'concept' and type = 'seizoen'`)).toBe('2');
  expect(
    psql(
      `select datum::text || '|' || verzameltijd::text || '|' || starttijd::text || '|' || eindtijd::text || '|' || locatie || '|' || notitie from public.activiteiten where naam = '${een}';`,
    ).trim(),
  ).toBe('2099-03-15|18:30:00|19:30:00|23:00:00|Testlocatie|Let op');
  expect(
    psql(
      `select datum::text || '|' || bus_vertrektijd::text from public.activiteiten where naam = '${twee}';`,
    ).trim(),
  ).toBe('2099-03-16|17:00:00');
  expect(
    psql(
      `select count(*) from public.activiteit_groep g join public.activiteiten a on a.id = g.activiteit_id where a.naam = '${een}';`,
    ).trim(),
  ).toBe('2');
  expect(
    psql(`select count(*) from public.rol_slots s join public.activiteiten a on a.id = s.activiteit_id
           where a.naam in ('${een}', '${twee}') and s.rol_type = 'eindverantwoordelijke' and s.bezetter_id is null;`).trim(),
  ).toBe('2');
});

test('een regel die niet klopt toont wat er mist en blokkeert het aanmaken tot het is opgelost', async ({
  page,
}) => {
  await opBulkpagina(page);
  const zonderLocatie = maakNaam('zonder locatie');
  const metGroep = maakNaam('met groep');
  const goed = maakNaam('goed');
  const zonderDatum = maakNaam('zonder datum');
  await kiesBestand(
    page,
    'activiteiten.xlsx',
    maakXlsx([
      KOP,
      [zonderLocatie, '15-03-2099', null, '19:00', null, null, null, null, null],
      [metGroep, '16-03-2099', null, '19:00', null, 'Kuus', null, null, 'Bestuur; RV 11'],
      [goed, '17-03-2099', null, '19:00', null, 'Kuus', null, null, null],
      [zonderDatum, 'binnenkort', null, '19:00', null, 'Kuus', null, null, null],
    ]),
  );

  const rij = (naam: string) => page.getByRole('listitem').filter({ hasText: naam });
  await expect(page.getByText('3 regels kloppen niet.')).toBeVisible();
  // Het aanmaken kan nog niet, en de foutmelding staat bij het veld zelf.
  await expect(page.getByRole('button', { name: '1 concept aanmaken' })).toBeDisabled();
  await expect(rij(zonderLocatie).getByText('Vul een locatie in.')).toBeVisible();
  await expect(rij(metGroep).getByText(/Groep onbekend: “RV 11”/)).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  // Invullen: het veld blijft staan terwijl je typt, en de regel is klaar zodra hij klopt.
  await rij(zonderLocatie).getByLabel('Locatie').fill('Gemeenschapshuis');
  await expect(rij(zonderLocatie).getByLabel('Locatie')).toHaveValue('Gemeenschapshuis');
  await rij(metGroep).getByLabel('Voor wie').fill('Bestuur');
  await expect(page.getByText('1 regel klopt niet.')).toBeVisible();

  // De regel zonder datum laat je weg: de melding verdwijnt en het aantal klopt.
  await rij(zonderDatum).getByRole('button', { name: 'Niet meenemen' }).click();
  await expect(rij(zonderDatum).getByRole('button', { name: 'Toch meenemen' })).toBeVisible();
  await expect(page.getByText(/regels? klopt(en)? niet/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '3 concepten aanmaken' })).toBeEnabled();

  // Weggelaten en teruggehaald: de fout is er weer, en het aanmaken is uit.
  await rij(zonderDatum).getByRole('button', { name: 'Toch meenemen' }).click();
  await expect(page.getByRole('button', { name: '3 concepten aanmaken' })).toBeDisabled();
  await rij(zonderDatum).getByRole('button', { name: 'Niet meenemen' }).click();

  // Dubbel klikken geeft één set concepten, niet twee (de database houdt de aanmaak_id bij).
  await page.getByRole('button', { name: '3 concepten aanmaken' }).dblclick();
  await expect(page).toHaveURL(/\/beheer\?aangemaakt=3$/);
  expect(aantal(`naam in ('${zonderLocatie}', '${metGroep}', '${goed}')`)).toBe('3');
  expect(aantal(`naam = '${zonderDatum}'`)).toBe('0');
  expect(psql(`select locatie from public.activiteiten where naam = '${zonderLocatie}';`).trim()).toBe(
    'Gemeenschapshuis',
  );
  expect(
    psql(
      `select count(*) from public.activiteit_groep g join public.activiteiten a on a.id = g.activiteit_id where a.naam = '${metGroep}';`,
    ).trim(),
  ).toBe('1');
});

test('een bestand dat niet kan wordt geweigerd met een duidelijke melding', async ({ page }) => {
  await opBulkpagina(page);
  const kies = (naam: string, inhoud: Buffer) =>
    page
      .locator('input[type=file]')
      .setInputFiles({ name: naam, mimeType: 'application/octet-stream', buffer: inhoud });

  // Geen Excel-bestand: een tekstbestand, ook als het .xlsx heet; een csv; een macrobestand.
  await kies(
    'activiteiten.xlsx',
    Buffer.from('dit is gewoon tekst en geen excelbestand, ook al heet het zo'),
  );
  await expect(page.getByText(/Dit is geen Excel-bestand/)).toBeVisible();
  await kies('activiteiten.csv', Buffer.from('naam;datum'));
  await expect(page.getByText(/Dit is geen Excel-bestand/)).toBeVisible();
  await kies('activiteiten.xlsm', maakXlsx([KOP]));
  await expect(page.getByText(/macro’s of is beveiligd/)).toBeVisible();

  // Een goed Excel-bestand, maar zonder de kolommen, of zonder regels.
  await kies(
    'activiteiten.xlsx',
    maakXlsx([
      ['naam', 'locatie'],
      ['x', 'y'],
    ]),
  );
  await expect(page.getByText(/ontbreken kolommen.*datum, starttijd/)).toBeVisible();
  await kies('activiteiten.xlsx', maakXlsx([KOP]));
  await expect(page.getByText(/Er staan geen activiteiten in dit bestand/)).toBeVisible();

  // Na al die fouten is er niets aangemaakt en staat er nog steeds geen controlescherm.
  await expect(page.getByRole('heading', { level: 2, name: 'Controleer de activiteiten' })).toHaveCount(0);
});

test('de ingang staat op het beheeroverzicht', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  await page.goto('/beheer');
  // Op een groot scherm in de zijkaart ("Meerdere tegelijk aanmaken"), op een telefoon onder de kop ("Meerdere aanmaken").
  await page.getByRole('link', { name: /^Meerdere (tegelijk )?aanmaken$/ }).click();
  await expect(page).toHaveURL(/\/beheer\/activiteiten\/bulk$/);
  await expect(page.getByRole('link', { name: 'Terug naar activiteiten' })).toBeVisible();
  // Het sjabloon is te downloaden en schuift de pagina niet opzij.
  await expect(page.getByRole('link', { name: /Sjabloon downloaden/ })).toHaveAttribute(
    'href',
    '/activiteiten-sjabloon.xlsx',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
