// De ledenschermen met echte gegevens (UC-001): het welkomscherm (de activiteit van vandaag, twee op één dag) en de
// activiteit uit het programma, met de tijdlijn, de rolbezetting zoals een lid die ziet, het telefoonnummer van alleen de
// eindverantwoordelijke en wat er over jezelf staat. Wat een lid mag zien beslist de database (RLS, R13, R15, R22); deze
// tests bewijzen dat de schermen het overnemen. Het scherm voor "niets gepland" (AF-1) is hier niet te testen: de
// database heeft altijd andere activiteiten van parallelle tests.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import {
  lidIdVan,
  logInAlsBeheerder,
  maakTestlid,
  ruimActiviteitenOp,
  ruimTestledenOp,
} from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { nieuwAdres } from './inloggen-hulp.ts';
import { bevestigAdresVoor, maakLidMetRol, ruimLidOp } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';

const kenmerk = `T${crypto.randomUUID().slice(0, 7)}`;
let reeks = 0;
function maakNaam(soort: string): string {
  reeks += 1;
  return `E2E Welkom ${soort} ${reeks} ${kenmerk}`;
}

// De dag in Nederland: de database rekent in UTC, en tussen middernacht en 01:00 of 02:00 is dat nog gisteren.
const VANDAAG = "(now() at time zone 'Europe/Amsterdam')::date";

const aangemaakt: string[] = [];

test.afterAll(async () => {
  ruimActiviteitenOp(`E2E Welkom % ${kenmerk}`);
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

interface Opties {
  verzameltijd?: string | null;
  starttijd?: string;
  eindtijd?: string;
  bus?: { tijd: string; plaats: string };
  notitie?: string;
  /** Vandaag is de standaard: de activiteit staat dan op het welkomscherm, het hele etmaal. */
  dag?: string;
}

/** Een gepubliceerde activiteit (tijden en locatie zijn nodig, R21); vandaag, tot kort voor middernacht. */
function maakActiviteit(naam: string, opties: Opties = {}): string {
  const tekst = (waarde: string | null | undefined) => (waarde ? `'${waarde}'` : 'null');
  return psql(`
    insert into public.activiteiten (naam, datum, verzameltijd, starttijd, eindtijd, locatie, bus_vertrektijd, bus_locatie, notitie, status)
    values ('${naam}', ${opties.dag ?? VANDAAG}, ${tekst(opties.verzameltijd)}, '${opties.starttijd ?? '20:00'}',
            '${opties.eindtijd ?? '23:59'}', 'Zaal Test, Kerkstraat 1', ${tekst(opties.bus?.tijd)}, ${tekst(opties.bus?.plaats)},
            ${tekst(opties.notitie)}, 'gepubliceerd')
    returning id;
  `)
    .trim()
    .split('\n')[0]!;
}

function zetPlek(activiteitId: string, rol: string, bezetterId: string | null, volgorde = 0): void {
  psql(`
    insert into public.rol_slots (activiteit_id, rol_type, volgorde, bezetter_id)
    values ('${activiteitId}', '${rol}', ${volgorde}, ${bezetterId ? `'${bezetterId}'` : 'null'});
  `);
}

const geenZijwaartsSchuiven = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

test('het welkomscherm toont de activiteit van vandaag met tijden, rolbezetting en jouw status', async ({
  page,
}) => {
  const { lidId } = await logInAlsLid(page);
  const ger = maakTestlid('Ger', kenmerk, { telefoon: '06 12 34 56 78', magEindverantwoordelijke: true });
  const truus = maakTestlid('Truus', kenmerk, { telefoon: '06 99 99 99 99' });
  const naam = maakNaam('avond');
  // Elke test draait ook in het andere project, en beide hebben vandaag een activiteit: de notitie is dus per run uniek.
  const notitie = `Zaal moet om 19:30 klaarstaan. ${kenmerk}`;
  const id = maakActiviteit(naam, {
    verzameltijd: '18:30',
    bus: { tijd: '18:45', plaats: 'Parkeerplaats Sporthal' },
    notitie,
  });
  zetPlek(id, 'eindverantwoordelijke', ger.id);
  zetPlek(id, 'werker', truus.id, 1);
  zetPlek(id, 'werker', null, 2); // een lege plek ziet een lid niet (R13)
  zetPlek(id, 'drankhaler', lidId, 3);
  zetPlek(id, 'fotograaf', null, 4);

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Alaaf, Mfa' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: naam })).toBeVisible();
  await expect(page.getByText(/^Vandaag, /).first()).toBeVisible();

  // De tijdlijn: met een bus verzamel je bij de bus (de vertrekplaats staat bij Verzamelen) en is de locatie waar je naartoe gaat
  // (die staat bij Begint); daarna het einde.
  const tijdlijn = page.getByRole('region').filter({ has: page.getByRole('heading', { name: naam }) });
  const stop = (wat: string) => tijdlijn.getByRole('listitem').filter({ hasText: wat });
  await expect(stop('Verzamelen')).toContainText('18:30');
  await expect(stop('Verzamelen')).toContainText('Parkeerplaats Sporthal');
  await expect(stop('Verzamelen')).not.toContainText('Zaal Test, Kerkstraat 1');
  await expect(stop('Bus vertrekt')).toContainText('18:45');
  await expect(stop('Begint')).toContainText('Zaal Test, Kerkstraat 1');
  await expect(stop('Is afgelopen')).toBeVisible();
  await expect(page.getByText(notitie)).toBeVisible();

  // De rolbezetting: alleen bezette plekken, jezelf herkenbaar, het nummer alleen bij de eindverantwoordelijke (R10).
  const rollen = page.getByRole('region', { name: `Rolbezetting ${naam}` });
  await expect(rollen.getByRole('listitem')).toHaveCount(3);
  await expect(rollen.getByText(ger.naam)).toBeVisible();
  await expect(rollen.getByRole('link', { name: '06 12 34 56 78' })).toHaveAttribute(
    'href',
    'tel:0612345678',
  );
  await expect(rollen.getByText(truus.naam)).toBeVisible();
  await expect(rollen.getByText('Mfa Test (jij)')).toBeVisible();
  await expect(page.getByText('06 99 99 99 99')).toHaveCount(0);
  await expect(page.getByText('De rest van de indeling volgt nog.')).toHaveCount(0);

  // Jouw status: één paneel zichtbaar (op een telefoon staat hij bovenaan, op een groot scherm in de zijkolom).
  const status = page.getByRole('region', { name: 'Jouw status' });
  await expect(status.getByText('Je staat op aanwezig als drankhaler.')).toBeVisible();
  // Met een ruilbare dienst: afmelden (eerst overdragen, R7) en alleen je dienst overdragen. Op Start staan ook de activiteiten
  // van andere tests van vandaag, dus de knoppen heten "… voor <naam>"; hier telt alleen die van deze activiteit.
  await expect(status.getByRole('link', { name: new RegExp(`^Afmelden( voor ${naam})?$`) })).toHaveCount(1);
  await expect(
    status.getByRole('link', { name: new RegExp(`^Dienst overdragen( voor ${naam})?$`) }),
  ).toHaveCount(1);

  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  expect(await geenZijwaartsSchuiven(page)).toBe(false);
});

test('twee activiteiten op één dag staan op tijd onder elkaar, met een regel per activiteit in jouw status', async ({
  page,
}) => {
  const { lidId } = await logInAlsLid(page);
  const ger = maakTestlid('Ger', kenmerk, { telefoon: '06 12 34 56 78' });
  const ochtend = maakNaam('ochtend');
  const middag = maakNaam('middag');
  // Eerst de latere aanmaken: de volgorde komt van de tijd, niet van het aanmaken.
  const idMiddag = maakActiviteit(middag, { starttijd: '00:02', verzameltijd: '00:01' });
  const idOchtend = maakActiviteit(ochtend, { starttijd: '00:01', verzameltijd: '00:00' });
  zetPlek(idOchtend, 'eindverantwoordelijke', ger.id);
  zetPlek(idOchtend, 'werker', lidId, 1);
  zetPlek(idMiddag, 'eindverantwoordelijke', ger.id);

  await page.goto('/');
  const koppen = await page.getByRole('heading', { level: 2 }).allInnerTexts();
  const eerste = koppen.indexOf(ochtend);
  const tweede = koppen.indexOf(middag);
  expect(eerste).toBeGreaterThanOrEqual(0);
  expect(tweede).toBeGreaterThan(eerste);

  const status = page.getByRole('region', { name: 'Jouw status' });
  await expect(status.getByText(`${ochtend} — Je staat op aanwezig als werker.`)).toBeVisible();
  await expect(status.getByText(`${middag} — Je staat op aanwezig, zonder dienst.`)).toBeVisible();
  expect(await geenZijwaartsSchuiven(page)).toBe(false);
});

test('een afgemeld lid ziet dat; een activiteit zonder indeling, bus en notitie zegt wat nog niet is ingevuld', async ({
  page,
}) => {
  const { lidId } = await logInAlsLid(page);
  const ger = maakTestlid('Ger', kenmerk, { telefoon: '06 12 34 56 78' });
  const naam = maakNaam('kaal');
  const id = maakActiviteit(naam, { dag: `${VANDAAG} + 1`, eindtijd: '23:00' });
  zetPlek(id, 'eindverantwoordelijke', ger.id);
  psql(`insert into public.afmeldingen (activiteit_id, lid_id) values ('${id}', '${lidId}');`);

  await page.goto(`/programma/${id}`);
  await expect(
    page.getByRole('heading', { level: 1, name: new RegExp(`^${naam} — [a-z]+ \\d+ [a-z]+$`) }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Terug naar het programma' })).toHaveAttribute(
    'href',
    '/programma',
  );
  await expect(
    page.getByText('Busvertrek en de notitie “belangrijk om te weten” zijn nog niet ingevuld.'),
  ).toBeVisible();
  await expect(page.getByText('De rest van de indeling volgt nog.')).toBeVisible();
  await expect(page.getByRole('region', { name: `Rolbezetting ${naam}` }).getByText(ger.naam)).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Jouw status' }).getByText('Je bent afgemeld.'),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  expect(await geenZijwaartsSchuiven(page)).toBe(false);
});

test('vanuit het programma open je een activiteit; een concept en een andere groep bestaan niet voor een lid', async ({
  page,
}) => {
  await logInAlsLid(page);
  const zichtbaar = maakNaam('zichtbaar');
  const idZichtbaar = maakActiviteit(zichtbaar, { dag: `${VANDAAG} + 8` });
  const idConcept = psql(`
    insert into public.activiteiten (naam, datum, status) values ('${maakNaam('concept')}', ${VANDAAG} + 9, 'concept')
    returning id;
  `)
    .trim()
    .split('\n')[0]!;
  const idBestuur = maakActiviteit(maakNaam('bestuur'), { dag: `${VANDAAG} + 10` });
  psql(`
    insert into public.activiteit_groep (activiteit_id, groep_id)
    select '${idBestuur}', id from public.groepen where naam = 'Bestuur';
  `);

  await page.goto('/programma');
  await page.getByRole('link', { name: new RegExp(zichtbaar) }).click();
  await expect(page).toHaveURL(new RegExp(`/programma/${idZichtbaar}$`));
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(zichtbaar) })).toBeVisible();

  for (const verborgen of [idConcept, idBestuur, crypto.randomUUID()]) {
    const antwoord = await page.goto(`/programma/${verborgen}`);
    expect(antwoord?.status()).toBe(404);
  }
  const geenId = await page.goto('/programma/geen-id');
  expect(geenId?.status()).toBe(404);
});

test('zonder in te loggen gaat een activiteit naar het inloggen', async ({ page }) => {
  await page.goto(`/programma/${crypto.randomUUID()}`);
  await expect(page).toHaveURL(/\/inloggen$/);
});

test('het bestuur ziet een link om de activiteit te beheren, een gewoon lid niet', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const naam = maakNaam('beheren');
  const id = maakActiviteit(naam, { dag: `${VANDAAG} + 11` });
  await page.goto(`/programma/${id}`);
  await expect(page.getByRole('link', { name: 'Deze activiteit beheren' })).toHaveAttribute(
    'href',
    `/beheer/activiteiten/${id}`,
  );

  // Uitlijning in het paneel (visueel ontwerp, 13g): de knop Afmelden en de link naar beheer beginnen op dezelfde lijn. Op een
  // groot scherm is de knop zo breed als zijn tekst; op een telefoon vult hij het paneel (even veel ruimte links als rechts).
  const paneel = page.getByRole('region', { name: 'Jouw status' });
  const afmelden = paneel.getByRole('link', { name: 'Afmelden', exact: true });
  await expect(afmelden).toBeVisible();
  const [kader, knop, beheren] = await Promise.all([
    paneel.boundingBox(),
    afmelden.boundingBox(),
    paneel.getByRole('link', { name: 'Deze activiteit beheren' }).boundingBox(),
  ]);
  if (!kader || !knop || !beheren) throw new Error('paneel, knop of link heeft geen afmetingen');
  expect(Math.abs(knop.x - beheren.x)).toBeLessThanOrEqual(1);
  const ruimteLinks = knop.x - kader.x;
  const ruimteRechts = kader.x + kader.width - (knop.x + knop.width);
  if ((page.viewportSize()?.width ?? 0) > 700) {
    expect(knop.width).toBeLessThan(kader.width / 2);
  } else {
    expect(Math.abs(ruimteLinks - ruimteRechts)).toBeLessThanOrEqual(1);
  }
});

test('een gewoon lid heeft geen link naar beheer', async ({ page }) => {
  await logInAlsLid(page);
  const id = maakActiviteit(maakNaam('geen-beheer'), { dag: `${VANDAAG} + 12` });
  await page.goto(`/programma/${id}`);
  await expect(page.getByRole('region', { name: 'Jouw status' })).toBeVisible();
  await expect(page.getByRole('link', { name: /beheren/ })).toHaveCount(0);
});
