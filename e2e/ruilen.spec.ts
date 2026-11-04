// Je dienst overdragen en afmelden met een dienst met echte gegevens (UC-002 en UC-003 AF-1, fase 3 stap D): de lijst met
// vervangers en de redenen, de bevestiging, het resultaat, de twee stappen van afmelden met de Stappenbalk, en wat er gebeurt als
// een vervanger zich intussen afmeldt of ergens anders wordt ingedeeld. Wat mag en niet mag beslist de database (ruil_dienst,
// beschikbare_vervangers; pgTAP en e2e/ledenacties-gelijktijdig.spec.ts); deze tests bewijzen dat de schermen het overnemen, en dat
// elke pagina toegankelijk is en op 375 px niet opzij schuift.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { lidIdVan, maakTestlid, ruimActiviteitenOp, ruimTestledenOp, type Testlid } from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { nieuwAdres } from './inloggen-hulp.ts';
import { bevestigAdresVoor, maakLidMetRol, ruimLidOp } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';

const kenmerk = `T${crypto.randomUUID().slice(0, 7)}`;
let reeks = 0;
function maakNaam(soort: string): string {
  reeks += 1;
  return `E2E Ruilen ${soort} ${reeks} ${kenmerk}`;
}

// De dag in Nederland: de database rekent in UTC, en tussen middernacht en 01:00 of 02:00 is dat nog gisteren.
const VANDAAG = "(now() at time zone 'Europe/Amsterdam')::date";

const aangemaakt: string[] = [];

test.afterAll(async () => {
  ruimActiviteitenOp(`E2E Ruilen % ${kenmerk}`);
  psql(`delete from public.groepen where naam like 'E2E Ruilen g% ${kenmerk}';`);
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
 * Een gepubliceerde activiteit van vandaag, alleen voor de gegeven leden (een eigen groep): zo staat hij niet op het welkomscherm van
 * een ander lid (de tests van andere bestanden draaien ernaast en tellen wat er vandaag op Start staat). Met een eindverantwoordelijke
 * met telefoonnummer, zodat het nummer op de pagina staat.
 */
function maakActiviteit(
  naam: string,
  ledenIds: string[],
  opties: { dag?: string } = {},
): { id: string; ger: Testlid } {
  const ger = maakTestlid('Ger', kenmerk, { telefoon: '06 12 34 56 78', magEindverantwoordelijke: true });
  const id = crypto.randomUUID();
  const groep = `E2E Ruilen g${crypto.randomUUID().slice(0, 8)} ${kenmerk}`;
  const leden = [...ledenIds, ger.id];
  // In één transactie: de activiteit bestaat nooit even zonder doelgroep, want dan staat hij op het welkomscherm van andere tests.
  psql(`
    begin;
    insert into public.groepen (naam, volgorde) values ('${groep}', 97);
    insert into public.lid_groep (lid_id, groep_id)
      select l.id, g.id from public.groepen g, (values ${leden.map((l) => `('${l}'::uuid)`).join(', ')}) as l(id)
       where g.naam = '${groep}';
    insert into public.activiteiten (id, naam, datum, verzameltijd, starttijd, eindtijd, locatie, status)
    values ('${id}', '${naam}', ${opties.dag ?? VANDAAG}, '18:30', '20:00', '23:59', 'Zaal Test, Kerkstraat 1', 'gepubliceerd');
    insert into public.activiteit_groep (activiteit_id, groep_id) select '${id}', id from public.groepen where naam = '${groep}';
    insert into public.rol_slots (activiteit_id, rol_type, bezetter_id) values ('${id}', 'eindverantwoordelijke', '${ger.id}');
    commit;
  `);
  return { id, ger };
}

function zetPlek(activiteitId: string, rol: string, bezetterId: string | null, volgorde = 0): string {
  return psql(`
    insert into public.rol_slots (activiteit_id, rol_type, volgorde, bezetter_id)
    values ('${activiteitId}', '${rol}', ${volgorde}, ${bezetterId ? `'${bezetterId}'` : 'null'})
    returning id;
  `)
    .trim()
    .split('\n')[0]!;
}

const bezetter = (slotId: string): string =>
  psql(`select coalesce(bezetter_id::text, '(leeg)') from public.rol_slots where id = '${slotId}';`).trim();
const plekken = (activiteitId: string, lidId: string): string =>
  psql(
    `select count(*) from public.rol_slots where activiteit_id = '${activiteitId}' and bezetter_id = '${lidId}';`,
  ).trim();
const afmeldingen = (activiteitId: string, lidId: string): string =>
  psql(
    `select count(*) from public.afmeldingen where activiteit_id = '${activiteitId}' and lid_id = '${lidId}';`,
  ).trim();

const geenZijwaartsSchuiven = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

/** Toegankelijk (WCAG) en op deze breedte niets dat opzij schuift. */
async function isNetjes(page: Page): Promise<void> {
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  expect(await geenZijwaartsSchuiven(page)).toBe(false);
}

const statusPaneel = (page: Page) => page.getByRole('region', { name: 'Jouw status' });
const geenFoutmelding = (page: Page) => page.getByRole('alert').filter({ hasText: /niet gelukt/ });

test('je dienst overdragen: de lijst met redenen, de bevestiging en het resultaat', async ({ page }) => {
  const { lidId } = await logInAlsLid(page);
  const truus = maakTestlid('Truus', kenmerk);
  const bert = maakTestlid('Bert', kenmerk);
  const carla = maakTestlid('Carla', kenmerk);
  const naam = maakNaam('hoofdpad');
  const { id, ger } = maakActiviteit(naam, [lidId, truus.id, bert.id, carla.id]);
  const dienst = zetPlek(id, 'drankhaler', lidId, 1);
  zetPlek(id, 'fotograaf', carla.id, 2);
  psql(`insert into public.afmeldingen (activiteit_id, lid_id) values ('${id}', '${bert.id}');`);

  // Van de activiteit naar de lijst.
  await page.goto(`/programma/${id}`);
  await expect(statusPaneel(page).getByText('Je staat op aanwezig als drankhaler.')).toBeVisible();
  await statusPaneel(page).getByRole('link', { name: 'Dienst overdragen' }).click();
  await expect(page).toHaveURL(new RegExp(`/ruilen/${id}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Wie neemt je dienst over?' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Stappen' })).toHaveCount(0);

  // Wie kan overnemen is te kiezen; de anderen staan er grijs bij met de reden.
  await expect(page.getByRole('radio', { name: new RegExp(truus.naam) })).toBeEnabled();
  await expect(page.getByRole('radio', { name: new RegExp(bert.naam) })).toBeDisabled();
  await expect(page.getByText('Afgemeld voor deze activiteit')).toBeVisible();
  await expect(page.getByRole('radio', { name: new RegExp(carla.naam) })).toBeDisabled();
  // Carla én de eindverantwoordelijke (die staat ook al op een plek).
  await expect(page.getByText('Staat al op een plek bij deze activiteit')).toHaveCount(2);
  await expect(page.getByRole('radio', { name: /Mfa Test/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '06 12 34 56 78' })).toBeVisible();
  await expect(page.getByText(`Bel ${ger.naam}`)).toBeVisible();
  await isNetjes(page);

  // Zoeken op naam: de rest verdwijnt uit de lijst.
  await page.getByLabel('Zoek op naam').fill('Truus');
  await expect(page.getByRole('radio', { name: new RegExp(truus.naam) })).toBeVisible();
  await expect(page.getByRole('radio', { name: new RegExp(carla.naam) })).toHaveCount(0);
  await expect(page.getByText('1 lid gevonden.')).toBeVisible();

  // Kiezen en verder naar de bevestiging.
  await page.getByRole('radio', { name: new RegExp(truus.naam) }).check();
  await page.getByRole('button', { name: 'Verder' }).click();
  await expect(page).toHaveURL(new RegExp(`/ruilen/${id}/bevestigen\\?vervanger=`));
  await expect(
    page.getByRole('heading', { level: 1, name: `Dienst overdragen aan ${truus.naam}?` }),
  ).toBeVisible();
  await expect(page.getByText('Mfa Test (jij)')).toBeVisible();
  await expect(page.getByText('Dit kun je niet zelf terugdraaien')).toBeVisible();
  await expect(page.getByText('Daarna volgt stap 2')).toHaveCount(0);
  await isNetjes(page);
  expect(bezetter(dienst)).toBe(lidId);

  // Bevestigen: de dienst is van de vervanger, en jij staat nog op aanwezig.
  await page.getByRole('button', { name: 'Dienst overdragen' }).click();
  await expect(page).toHaveURL(new RegExp(`/ruilen/${id}/gelukt\\?v=`));
  await expect(
    page.getByRole('heading', { level: 1, name: `De dienst staat nu op naam van ${truus.naam}` }),
  ).toBeVisible();
  await expect(page.getByText('Je hebt nu geen dienst meer bij deze activiteit')).toBeVisible();
  expect(bezetter(dienst)).toBe(truus.id);
  expect(plekken(id, lidId)).toBe('0');
  expect(afmeldingen(id, lidId)).toBe('0');
  await isNetjes(page);

  // Ook afmelden: het gewone afmelden zonder dienst.
  await page.getByRole('link', { name: 'Ook afmelden' }).click();
  await expect(page).toHaveURL(new RegExp(`/afmelden/${id}$`));
  await expect(page.getByText('Geen — je kunt je vrij afmelden')).toBeVisible();
});

test('afmelden met een dienst: eerst overdragen, dan afmelden, in twee stappen', async ({ page }) => {
  const { lidId } = await logInAlsLid(page);
  const truus = maakTestlid('Truus', kenmerk);
  const naam = maakNaam('afmelden');
  const { id } = maakActiviteit(naam, [lidId, truus.id]);
  const dienst = zetPlek(id, 'werker', lidId, 1);

  // Afmelden kondigt de twee stappen aan.
  await page.goto(`/programma/${id}`);
  await statusPaneel(page).getByRole('link', { name: 'Afmelden' }).click();
  await expect(page).toHaveURL(new RegExp(`/afmelden/${id}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Afmelden in twee stappen' })).toBeVisible();
  await expect(page.getByText('Stap 1 — vervanger aanwijzen')).toBeVisible();
  await expect(page.getByText('Stap 2 — afmelden bevestigen')).toBeVisible();
  await expect(page.getByText('De overdracht kun je niet terugdraaien.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Afmelden bevestigen' })).toHaveCount(0);
  await isNetjes(page);
  expect(afmeldingen(id, lidId)).toBe('0');

  // Stap 1: de vervanger kiezen, met de Stappenbalk.
  await page.getByRole('link', { name: 'Beginnen met stap 1' }).click();
  await expect(page).toHaveURL(new RegExp(`/ruilen/${id}\\?taak=afmelden$`));
  await expect(page.getByRole('list', { name: 'Stappen' })).toBeVisible();
  await expect(
    page.getByText('Dan kun je je niet afmelden en blijft de dienst bij jou staan.'),
  ).toBeVisible();
  await isNetjes(page);
  await page.getByRole('radio', { name: new RegExp(truus.naam) }).check();
  await page.getByRole('button', { name: 'Verder' }).click();
  await expect(page).toHaveURL(new RegExp(`/ruilen/${id}/bevestigen\\?(?=.*vervanger=)(?=.*taak=afmelden)`));
  await expect(page.getByText('Daarna volgt stap 2: je afmelding zelf.')).toBeVisible();
  await isNetjes(page);

  // De overdracht bevestigen loopt door naar stap 2, zonder tussenscherm.
  await page.getByRole('button', { name: 'Dienst overdragen' }).click();
  await expect(page).toHaveURL(new RegExp(`/afmelden/${id}\\?stap=2&v=`));
  await expect(page.getByRole('heading', { level: 1, name: `Afmelden voor ${naam}?` })).toBeVisible();
  await expect(page.getByText('Stap 1 — vervanger aangewezen (klaar)')).toBeVisible();
  await expect(page.getByText(`staat nu op naam van ${truus.naam}`)).toBeVisible();
  await expect(page.getByText('Jouw dienst')).toBeVisible();
  expect(bezetter(dienst)).toBe(truus.id);
  expect(afmeldingen(id, lidId)).toBe('0');
  await isNetjes(page);

  // Stap 2: afmelden.
  await page.getByLabel('Toelichting (optioneel)').fill('Werk.');
  await page.getByRole('button', { name: 'Afmelden bevestigen' }).click();
  await expect(page).toHaveURL(new RegExp(`/afmelden/${id}/gelukt$`));
  expect(afmeldingen(id, lidId)).toBe('1');
  expect(bezetter(dienst)).toBe(truus.id);
});

test('een vervanger die zich net afmeldt of ergens anders wordt ingedeeld: niets verandert, kies een ander', async ({
  page,
}) => {
  const { lidId } = await logInAlsLid(page);
  const truus = maakTestlid('Truus', kenmerk);
  const piet = maakTestlid('Piet', kenmerk);
  const naam = maakNaam('race');
  const { id } = maakActiviteit(naam, [lidId, truus.id, piet.id]);
  const dienst = zetPlek(id, 'werker', lidId, 1);

  // Truus meldt zich af terwijl het lid aan het bevestigen is.
  await page.goto(`/ruilen/${id}`);
  await page.getByRole('radio', { name: new RegExp(truus.naam) }).check();
  await page.getByRole('button', { name: 'Verder' }).click();
  await expect(page).toHaveURL(new RegExp(`/ruilen/${id}/bevestigen`));
  psql(`insert into public.afmeldingen (activiteit_id, lid_id) values ('${id}', '${truus.id}');`);
  await page.getByRole('button', { name: 'Dienst overdragen' }).click();
  await expect(page).toHaveURL(new RegExp(`/ruilen/${id}/niet-gelukt\\?reden=afgemeld`));
  await expect(
    page.getByRole('heading', { level: 1, name: 'Dit lid kan de dienst niet overnemen' }),
  ).toBeVisible();
  await expect(page.getByText(`${truus.naam} heeft zich net afgemeld voor ${naam}`)).toBeVisible();
  await expect(page.getByText('Er is niets gewijzigd')).toBeVisible();
  await expect(page.getByText('Mfa Test (jij)')).toBeVisible();
  expect(bezetter(dienst)).toBe(lidId);
  await isNetjes(page);

  // Iemand anders kiezen: Truus staat nu grijs in de lijst. Piet wordt ergens anders ingedeeld.
  await page.getByRole('link', { name: 'Iemand anders kiezen' }).click();
  await expect(page).toHaveURL(new RegExp(`/ruilen/${id}$`));
  await expect(page.getByRole('radio', { name: new RegExp(truus.naam) })).toBeDisabled();
  await page.getByRole('radio', { name: new RegExp(piet.naam) }).check();
  await page.getByRole('button', { name: 'Verder' }).click();
  await expect(page).toHaveURL(new RegExp(`/ruilen/${id}/bevestigen`));
  zetPlek(id, 'fotograaf', piet.id, 2);
  await page.getByRole('button', { name: 'Dienst overdragen' }).click();
  await expect(page).toHaveURL(new RegExp(`/ruilen/${id}/niet-gelukt\\?reden=dubbel`));
  await expect(page.getByRole('heading', { level: 1, name: 'Dit lid staat al ingedeeld' })).toBeVisible();
  await expect(page.getByText(`${piet.naam} is net als fotograaf ingedeeld bij ${naam}`)).toBeVisible();
  expect(bezetter(dienst)).toBe(lidId);
  expect(plekken(id, lidId)).toBe('1');
});

test('wie niets over te dragen heeft, krijgt een uitleg; een ongeldige keuze gaat terug naar de lijst', async ({
  page,
}) => {
  const { lidId } = await logInAlsLid(page);
  const truus = maakTestlid('Truus', kenmerk);
  const naam = maakNaam('uitleg');
  const { id } = maakActiviteit(naam, [lidId, truus.id]);

  // Zonder dienst.
  await page.goto(`/ruilen/${id}`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Dienst overdragen kan hier niet' }),
  ).toBeVisible();
  await expect(page.getByText('Je hebt bij deze activiteit geen dienst om over te dragen.')).toBeVisible();
  await isNetjes(page);

  // Met een beheerrol: alleen het bestuur wijzigt die.
  zetPlek(id, 'bob', lidId, 1);
  await page.goto(`/ruilen/${id}`);
  await expect(page.getByText('Deze dienst kun je niet zelf overdragen.')).toBeVisible();
  await page.goto(`/programma/${id}`);
  await expect(statusPaneel(page).getByRole('link', { name: 'Dienst overdragen' })).toHaveCount(0);
  await expect(statusPaneel(page).getByText('Deze rol wijzigt alleen het bestuur.')).toBeVisible();

  // Met een dienst, maar een kapotte of niet te kiezen vervanger: terug naar de lijst.
  const naam2 = maakNaam('ongeldig');
  const tweede = maakActiviteit(naam2, [lidId, truus.id]);
  zetPlek(tweede.id, 'werker', lidId, 1);
  psql(`insert into public.afmeldingen (activiteit_id, lid_id) values ('${tweede.id}', '${truus.id}');`);
  await page.goto(`/ruilen/${tweede.id}/bevestigen?vervanger=kapot`);
  await expect(page).toHaveURL(new RegExp(`/ruilen/${tweede.id}$`));
  await page.goto(`/ruilen/${tweede.id}/bevestigen?vervanger=${truus.id}`);
  await expect(page).toHaveURL(new RegExp(`/ruilen/${tweede.id}$`));
  // Het resultaat van een overdracht die er niet is, bestaat niet.
  await page.goto(`/ruilen/${tweede.id}/gelukt?v=${truus.id}`);
  await expect(page).toHaveURL(/\/$/);
});

test('dubbel klikken op Dienst overdragen geeft één overdracht en geen fout', async ({ page }) => {
  const { lidId } = await logInAlsLid(page);
  const truus = maakTestlid('Truus', kenmerk);
  const { id } = maakActiviteit(maakNaam('dubbel'), [lidId, truus.id]);
  const dienst = zetPlek(id, 'fotograaf', lidId, 1);

  await page.goto(`/ruilen/${id}/bevestigen?vervanger=${truus.id}`);
  await page.getByRole('button', { name: 'Dienst overdragen' }).dblclick();
  await expect(page).toHaveURL(new RegExp(`/ruilen/${id}/gelukt`));
  await expect(geenFoutmelding(page)).toHaveCount(0);
  expect(bezetter(dienst)).toBe(truus.id);
});

test('de pagina’s van het overdragen: niet ingelogd naar het inloggen, een verborgen activiteit bestaat niet', async ({
  page,
}) => {
  const id = crypto.randomUUID();
  for (const adres of [
    `/ruilen/${id}`,
    `/ruilen/${id}/bevestigen`,
    `/ruilen/${id}/gelukt`,
    `/ruilen/${id}/niet-gelukt`,
  ]) {
    await page.goto(adres);
    await expect(page, adres).toHaveURL(/\/inloggen/);
  }

  await logInAlsLid(page);
  for (const adres of [`/ruilen/${id}`, `/ruilen/${id}/bevestigen`, '/ruilen/geen-id']) {
    const antwoord = await page.goto(adres);
    expect(antwoord?.status(), adres).toBe(404);
  }
});
