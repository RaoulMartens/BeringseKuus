// Mijn diensten met echte gegevens (UC-007, fase 3 stap E): de eigen plekken op datum, het blok Afgemeld, wat al geweest is, de lege staat,
// de wisselaar in het programma en de twee ingangen op Start ("Al je diensten" op je eigen rij, of de kaart "Mijn diensten"). Wat een
// lid mag zien beslist de database (de view mijn_diensten; pgTAP); deze tests bewijzen dat het scherm het overneemt, en dat elke pagina
// toegankelijk is en op 375 px niet opzij schuift.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { lidIdVan, maakTestlid, ruimActiviteitenOp, ruimTestledenOp } from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { nieuwAdres } from './inloggen-hulp.ts';
import { bevestigAdresVoor, maakLidMetRol, ruimLidOp } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';

const kenmerk = `T${crypto.randomUUID().slice(0, 7)}`;
let reeks = 0;
function maakNaam(soort: string): string {
  reeks += 1;
  return `E2E Diensten ${soort} ${reeks} ${kenmerk}`;
}

// De dag in Nederland: de database rekent in UTC, en tussen middernacht en 01:00 of 02:00 is dat nog gisteren.
const VANDAAG = "(now() at time zone 'Europe/Amsterdam')::date";

const aangemaakt: string[] = [];

test.afterAll(async () => {
  ruimActiviteitenOp(`E2E Diensten % ${kenmerk}`);
  psql(`delete from public.groepen where naam like 'E2E Diensten g% ${kenmerk}';`);
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

/**
 * Een gepubliceerde activiteit, alleen voor de gegeven leden (een eigen groep, in één transactie): zo staat hij niet op het welkomscherm
 * van een ander lid, ook niet even tussen twee aanroepen door (de tests van andere bestanden draaien ernaast en tellen wat er vandaag op
 * Start staat). Met een eindverantwoordelijke met telefoonnummer. `dag` is een SQL-uitdrukking.
 */
function maakActiviteit(naam: string, ledenIds: string[], opties: { dag?: string } = {}): string {
  const ger = maakTestlid('Ger', kenmerk, { telefoon: '06 12 34 56 78', magEindverantwoordelijke: true });
  const id = crypto.randomUUID();
  const groep = `E2E Diensten g${crypto.randomUUID().slice(0, 8)} ${kenmerk}`;
  const leden = [...ledenIds, ger.id];
  psql(`
    begin;
    insert into public.groepen (naam, volgorde) values ('${groep}', 96);
    insert into public.lid_groep (lid_id, groep_id)
      select l.id, g.id from public.groepen g, (values ${leden.map((l) => `('${l}'::uuid)`).join(', ')}) as l(id)
       where g.naam = '${groep}';
    insert into public.activiteiten (id, naam, datum, verzameltijd, starttijd, eindtijd, locatie, status)
    values ('${id}', '${naam}', ${opties.dag ?? VANDAAG}, '18:30', '20:00', '23:59', 'Zaal Test, Kerkstraat 1', 'gepubliceerd');
    insert into public.activiteit_groep (activiteit_id, groep_id) select '${id}', id from public.groepen where naam = '${groep}';
    insert into public.rol_slots (activiteit_id, rol_type, bezetter_id) values ('${id}', 'eindverantwoordelijke', '${ger.id}');
    commit;
  `);
  return id;
}

function zetPlek(activiteitId: string, rol: string, bezetterId: string, volgorde = 1): void {
  psql(`
    insert into public.rol_slots (activiteit_id, rol_type, volgorde, bezetter_id)
    values ('${activiteitId}', '${rol}', ${volgorde}, '${bezetterId}');
  `);
}

const geenZijwaartsSchuiven = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

/** Toegankelijk (WCAG) en op deze breedte niets dat opzij schuift. */
async function isNetjes(page: Page): Promise<void> {
  // Eerst de pagina en de lettertypen af: axe meet de grootte van knoppen en links, en die verandert als de lettertypen laden.
  await page.waitForLoadState('load');
  await page.evaluate(() => document.fonts.ready);
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  expect(await geenZijwaartsSchuiven(page)).toBe(false);
}

const blok = (page: Page, kop: string) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: kop }) });

test('Mijn diensten: komende diensten op datum, afgemeld, en wat al geweest is', async ({ page }) => {
  const { lidId } = await logInAlsLid(page);
  const truus = maakTestlid('Truus', kenmerk);
  const vandaag = maakNaam('vandaag');
  const later = maakNaam('later');
  const afgemeld = maakNaam('afgemeld');
  const geweest = maakNaam('geweest');
  const anders = maakNaam('van een ander');
  const leden = [lidId, truus.id];

  const a = maakActiviteit(later, leden, { dag: `${VANDAAG} + 10` });
  zetPlek(a, 'drankhaler', lidId);
  const b = maakActiviteit(vandaag, leden);
  zetPlek(b, 'werker', lidId);
  const c = maakActiviteit(afgemeld, leden, { dag: `${VANDAAG} + 5` });
  psql(`insert into public.afmeldingen (activiteit_id, lid_id) values ('${c}', '${lidId}');`);
  const d = maakActiviteit(geweest, leden, { dag: `${VANDAAG} - 3` });
  zetPlek(d, 'fotograaf', lidId);
  const e = maakActiviteit(anders, leden, { dag: `${VANDAAG} + 7` });
  zetPlek(e, 'werker', truus.id);

  // Van Start: "Al je diensten" op je eigen rij in de rolbezetting.
  await page.goto('/');
  await page.getByRole('link', { name: 'Al je diensten' }).first().click();
  await expect(page).toHaveURL(/\/programma\/mijn$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Vastelaovend');

  // Komende diensten: alleen de eigen plekken, op datum, met de rol.
  const komend = blok(page, 'Komende diensten');
  const rijen = komend.getByRole('listitem');
  await expect(rijen).toHaveCount(2);
  await expect(rijen.nth(0)).toContainText(vandaag);
  await expect(rijen.nth(0)).toContainText('werker');
  await expect(rijen.nth(1)).toContainText(later);
  await expect(rijen.nth(1)).toContainText('drankhaler');
  await expect(page.getByText(anders)).toHaveCount(0);

  // Afgemeld: de activiteit waarvoor je bent afgemeld, met de afmelding in te trekken op de activiteit zelf.
  const afgemeldBlok = blok(page, 'Afgemeld');
  await expect(afgemeldBlok.getByRole('listitem')).toHaveCount(1);
  await expect(afgemeldBlok).toContainText(afgemeld);
  // Het label zelf, niet de naam van de activiteit (die bevat het woord ook).
  await expect(afgemeldBlok.getByText('afgemeld', { exact: true })).toBeVisible();

  // Geweest dit seizoen: grijs onderaan.
  await expect(page.getByRole('heading', { level: 2, name: 'Geweest dit seizoen' })).toBeVisible();
  await expect(page.getByText(geweest)).toBeVisible();
  await isNetjes(page);

  // De wisselaar: de tegel "komende diensten" is gekozen; nog een keer klikken gaat terug naar alles.
  const tegel = page.getByRole('navigation', { name: 'Wat toont het programma' });
  await expect(tegel.getByRole('link', { name: '2 komende diensten' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await tegel.getByRole('link', { name: '2 komende diensten' }).click();
  await expect(page).toHaveURL(/\/programma$/);
  await expect(
    page
      .getByRole('navigation', { name: 'Wat toont het programma' })
      .getByRole('link', { name: /komende activiteiten/ }),
  ).toHaveAttribute('aria-current', 'true');
  await isNetjes(page);

  // Terug naar Mijn diensten en een regel openen: de activiteit zelf.
  await page
    .getByRole('navigation', { name: 'Wat toont het programma' })
    .getByRole('link', { name: '2 komende diensten' })
    .click();
  await expect(page).toHaveURL(/\/programma\/mijn$/);
  await page.getByRole('link', { name: new RegExp(later) }).click();
  await expect(page).toHaveURL(new RegExp(`/programma/${a}$`));

  // De afmelding intrekken kan vanuit de activiteit (R9); daarna staat die niet meer onder Afgemeld.
  await page.goto(`/programma/${c}`);
  await page
    .getByRole('region', { name: 'Jouw status' })
    .getByRole('button', { name: 'Afmelding intrekken' })
    .click();
  await expect(page).toHaveURL(new RegExp(`/afmelden/${c}/ingetrokken$`));
  await page.goto('/programma/mijn');
  await expect(page.getByRole('heading', { name: 'Afgemeld' })).toHaveCount(0);
});

test('Mijn diensten zonder diensten: de lege staat, en geen kaart op Start', async ({ page }) => {
  const { lidId } = await logInAlsLid(page);
  const naam = maakNaam('zonder dienst');
  maakActiviteit(naam, [lidId]);

  // Op Start staat geen eigen rij en ook geen kaart "Mijn diensten": zonder komende diensten zegt die niets. Mijn diensten blijft
  // bereikbaar via het programma.
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2, name: naam })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Al je diensten' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Mijn diensten/ })).toHaveCount(0);
  await page.goto('/programma/mijn');

  await expect(page.getByText('Je staat nog nergens als dienst ingedeeld.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Afgemeld' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Geweest dit seizoen' })).toHaveCount(0);
  await expect(
    page
      .getByRole('navigation', { name: 'Wat toont het programma' })
      .getByRole('link', { name: '0 komende diensten' }),
  ).toBeVisible();
  await isNetjes(page);
});

test('Mijn diensten: de kaart op Start telt de komende diensten, ook als je bent afgemeld', async ({
  page,
}) => {
  const { lidId } = await logInAlsLid(page);
  const naam = maakNaam('afgemeld op start');
  const later = maakNaam('later op start');
  const id = maakActiviteit(naam, [lidId]);
  psql(`insert into public.afmeldingen (activiteit_id, lid_id) values ('${id}', '${lidId}');`);
  const b = maakActiviteit(later, [lidId], { dag: `${VANDAAG} + 20` });
  zetPlek(b, 'werker', lidId);

  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Al je diensten' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Mijn diensten/ }).first()).toContainText('1 komende');
  await isNetjes(page);
});

test('Mijn diensten: niet ingelogd naar het inloggen', async ({ page }) => {
  await page.goto('/programma/mijn');
  await expect(page).toHaveURL(/\/inloggen/);
});

// Een lange naam met een lange rol: het label staat naast de tekst (groot scherm) of eronder (telefoon), maar valt er nooit overheen.
// Op een telefoon verdween de naam eerst achter het label ("eindverantwoordelijke").
test('Mijn diensten: label en tekst vallen niet over elkaar, ook niet met een lange naam', async ({
  page,
}) => {
  const { lidId } = await logInAlsLid(page);
  const naam = maakNaam('Intern kennis maken met Prins/Adjudant en de Raad van Elf');
  const id = maakActiviteit(naam, [lidId], { dag: `${VANDAAG} + 3` });
  zetPlek(id, 'bonnenkassa', lidId);

  await page.goto('/programma/mijn');
  const rij = blok(page, 'Komende diensten').getByRole('listitem').first();
  await expect(rij).toContainText(naam);
  await expect(rij).toContainText('bonnenkassa');
  await page.evaluate(() => document.fonts.ready);

  const tekst = await rij.locator('strong').boundingBox();
  const regel = await rij.getByText(/Zaal Test/).boundingBox();
  const label = await rij.getByText('bonnenkassa').boundingBox();
  if (!tekst || !regel || !label) throw new Error('de rij heeft geen afmetingen');
  const overlap = (a: NonNullable<typeof tekst>, b: NonNullable<typeof tekst>) =>
    a.x < b.x + b.width - 1 &&
    b.x < a.x + a.width - 1 &&
    a.y < b.y + b.height - 1 &&
    b.y < a.y + a.height - 1;
  expect(overlap(tekst, label)).toBe(false);
  expect(overlap(regel, label)).toBe(false);
  await isNetjes(page);
});
