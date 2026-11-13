// "Wie komt er?" (UC-010) met echte gegevens: het raster van alle leden voor wie een activiteit is, op Start en in het programma;
// wie komt en wie is afgemeld, jezelf als "(jij)", de naam bij een bolletje, en dat de reden van een afmelding nergens staat. Wat een
// lid mag zien beslist de database (wie_komt_er, pgTAP: supabase/tests/database/wie_komt_er.test.sql); deze tests bewijzen dat het
// scherm het overneemt en toegankelijk is, ook op 375 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { lidIdVan, maakTestlid, ruimActiviteitenOp, ruimTestledenOp } from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { nieuwAdres } from './inloggen-hulp.ts';
import { bevestigAdresVoor, maakLidMetRol, ruimLidOp } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';

const kenmerk = `T${crypto.randomUUID().slice(0, 7)}`;
const VANDAAG = "(now() at time zone 'Europe/Amsterdam')::date";
const aangemaakt: string[] = [];

test.afterAll(async () => {
  ruimActiviteitenOp(`E2E Wie komt er % ${kenmerk}`);
  psql(`delete from public.groepen where naam like 'E2E Wie komt er g% ${kenmerk}';`);
  ruimTestledenOp(kenmerk);
  for (const uid of aangemaakt.splice(0)) await ruimLidOp(uid);
});

async function logInAlsLid(page: Page): Promise<{ lidId: string }> {
  const email = nieuwAdres();
  const uid = await maakLidMetRol(email);
  aangemaakt.push(uid);
  await page.goto(await bevestigAdresVoor(email));
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page).toHaveURL(/\/mijn$/);
  return { lidId: lidIdVan(uid) };
}

/** Een gepubliceerde activiteit alleen voor deze leden (een eigen groep): zo staat hij niet op Start van andere tests. */
function maakActiviteit(naam: string, ledenIds: string[]): string {
  const id = crypto.randomUUID();
  const groep = `E2E Wie komt er g${crypto.randomUUID().slice(0, 8)} ${kenmerk}`;
  psql(`
    begin;
    insert into public.groepen (naam, volgorde) values ('${groep}', 98);
    ${ledenIds
      .map(
        (lid) =>
          `insert into public.lid_groep (lid_id, groep_id) select '${lid}', id from public.groepen where naam = '${groep}';`,
      )
      .join('\n')}
    insert into public.activiteiten (id, naam, datum, verzameltijd, starttijd, eindtijd, locatie, status)
    values ('${id}', '${naam}', ${VANDAAG}, '18:30', '20:00', '23:59', 'Zaal Test, Kerkstraat 1', 'gepubliceerd');
    insert into public.activiteit_groep (activiteit_id, groep_id) select '${id}', id from public.groepen where naam = '${groep}';
    commit;
  `);
  return id;
}

function meldAf(activiteitId: string, lidId: string, toelichting: string | null): void {
  psql(`
    insert into public.afmeldingen (activiteit_id, lid_id, toelichting)
    values ('${activiteitId}', '${lidId}', ${toelichting ? `'${toelichting}'` : 'null'});
  `);
}

async function isNetjes(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready);
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
  ).toBe(false);
}

test('het raster toont wie komt en wie is afgemeld, zonder reden', async ({ page }) => {
  const { lidId } = await logInAlsLid(page);
  const anne = maakTestlid('Anne', kenmerk);
  const bram = maakTestlid('Bram', kenmerk);
  const carla = maakTestlid('Carla', kenmerk);
  const naam = `E2E Wie komt er hoofdpad ${kenmerk}`;
  const id = maakActiviteit(naam, [lidId, anne.id, bram.id, carla.id]);
  meldAf(id, bram.id, 'Privéreden die niemand hoort te zien');

  await page.goto(`/programma/${id}`);
  const kaart = page.getByRole('region', { name: `Wie komt er ${naam}` });
  await expect(kaart).toBeVisible();
  await expect(kaart.getByRole('heading', { name: 'Wie komt er?' })).toBeVisible();
  await expect(kaart.getByText(/^3\s+aanwezig\s+·\s+1\s+afgemeld$/)).toBeVisible();

  const leden = kaart.getByRole('list', { name: `Alle leden voor wie ${naam} is` }).getByRole('listitem');
  await expect(leden).toHaveCount(4);
  await expect(leden.filter({ hasText: /^AT$/ })).toHaveAttribute('aria-label', `${anne.naam}, aanwezig`);
  await expect(kaart.getByLabel(`${bram.naam}, afgemeld`)).toBeVisible();
  await expect(kaart.getByLabel(`${carla.naam}, aanwezig`)).toBeVisible();
  await expect(kaart.getByLabel(/\(jij\), aanwezig$/)).toBeVisible();

  // De naam staat bij het bolletje, ook met het toetsenbord; de reden staat nergens.
  const bramBolletje = kaart.getByLabel(`${bram.naam}, afgemeld`);
  await bramBolletje.focus();
  const tooltip = await bramBolletje.evaluate((el) => getComputedStyle(el, '::after').content);
  expect(tooltip).toBe(`"${bram.naam}"`);
  await expect(page.getByText('Privéreden')).toHaveCount(0);
  expect(await page.content()).not.toContain('Privéreden');

  await isNetjes(page);

  // Hetzelfde raster staat op Start, en een afmelding erbij verandert de telling.
  meldAf(id, anne.id, null);
  await page.goto('/');
  const opStart = page.getByRole('region', { name: `Wie komt er ${naam}` });
  await expect(opStart).toBeVisible();
  await expect(opStart.getByText(/^2\s+aanwezig\s+·\s+2\s+afgemeld$/)).toBeVisible();
  await isNetjes(page);
});

test('een lid dat de activiteit niet mag zien, ziet er ook geen raster van', async ({ page }) => {
  await logInAlsLid(page);
  const anne = maakTestlid('Anne', kenmerk);
  const naam = `E2E Wie komt er buitenstaander ${kenmerk}`;
  const id = maakActiviteit(naam, [anne.id]);

  const antwoord = await page.goto(`/programma/${id}`);
  expect(antwoord?.status()).toBe(404);
  await expect(page.getByRole('region', { name: `Wie komt er ${naam}` })).toHaveCount(0);
});
