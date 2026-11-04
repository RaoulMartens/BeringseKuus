// Afmelden en je afmelding intrekken met echte gegevens (UC-003, fase 3 stap C): de bevestigingspagina, het resultaat, intrekken
// vanaf Start en vanuit het programma, de blokkade onder de ondergrens, wie geen knop krijgt, en dubbel klikken. Wat mag en niet mag
// beslist de database (meld_af, trek_afmelding_in; pgTAP en e2e/ledenacties-gelijktijdig.spec.ts); deze tests bewijzen dat de
// schermen het overnemen, en dat elke pagina toegankelijk is en op 375 px niet opzij schuift.
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
  return `E2E Afmelden ${soort} ${reeks} ${kenmerk}`;
}

// De dag in Nederland: de database rekent in UTC, en tussen middernacht en 01:00 of 02:00 is dat nog gisteren.
const VANDAAG = "(now() at time zone 'Europe/Amsterdam')::date";

const aangemaakt: string[] = [];

test.afterAll(async () => {
  ruimActiviteitenOp(`E2E Afmelden % ${kenmerk}`);
  psql(`delete from public.groepen where naam = 'E2E Afmelden ${kenmerk}';`);
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

/** Een gepubliceerde activiteit (tijden en locatie zijn nodig, R21); vandaag tot kort voor middernacht, tenzij `dag` anders zegt. */
function maakActiviteit(
  naam: string,
  opties: { dag?: string; eindtijd?: string; status?: string } = {},
): string {
  return psql(`
    insert into public.activiteiten (naam, datum, verzameltijd, starttijd, eindtijd, locatie, status)
    values ('${naam}', ${opties.dag ?? VANDAAG}, '18:30', '20:00', '${opties.eindtijd ?? '23:59'}', 'Zaal Test, Kerkstraat 1',
            '${opties.status ?? 'gepubliceerd'}')
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

// Op Start staan alle activiteiten van vandaag, ook die van andere tests: dan heten de knoppen "Afmelden voor <naam>". Een knop wordt
// dus op de eigen naam gezocht; de teksten van het paneel lezen de tests op de pagina van die ene activiteit (/programma/<id>).
const afmeldLink = (page: Page, naam: string) =>
  statusPaneel(page).getByRole('link', { name: new RegExp(`^Afmelden( voor ${naam})?$`) });
const intrekKnop = (page: Page, naam: string) =>
  statusPaneel(page).getByRole('button', { name: new RegExp(`^Afmelding (voor ${naam} )?intrekken$`) });
const geenFoutmelding = (page: Page) => page.getByRole('alert').filter({ hasText: /niet gelukt/ });

test('afmelden zonder dienst, het resultaat, en weer intrekken', async ({ page }) => {
  const { lidId } = await logInAlsLid(page);
  const ger = maakTestlid('Ger', kenmerk, { telefoon: '06 12 34 56 78', magEindverantwoordelijke: true });
  const naam = maakNaam('hoofdpad');
  const id = maakActiviteit(naam);
  zetPlek(id, 'eindverantwoordelijke', ger.id);

  // Van Start naar de bevestiging: wat je afmeldt, je dienst, de deadline en een toelichting.
  await page.goto(`/programma/${id}`);
  await expect(statusPaneel(page).getByText('Je staat op aanwezig, zonder dienst.')).toBeVisible();
  await page.goto('/');
  await afmeldLink(page, naam).click();
  await expect(page).toHaveURL(new RegExp(`/afmelden/${id}$`));
  await expect(page.getByRole('heading', { level: 1, name: `Afmelden voor ${naam}?` })).toBeVisible();
  await expect(page.getByText('Geen — je kunt je vrij afmelden')).toBeVisible();
  await expect(page.getByText('Geen deadline: je kunt je vrij afmelden')).toBeVisible();
  await expect(page.getByText('Je kunt je afmelding altijd weer intrekken')).toBeVisible();
  await isNetjes(page);
  expect(afmeldingen(id, lidId)).toBe('0');

  // Annuleren laat alles staan.
  await page.getByRole('link', { name: 'Annuleren' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(afmeldingen(id, lidId)).toBe('0');

  // Afmelden, met een toelichting.
  await page.goto(`/afmelden/${id}`);
  await page.getByLabel('Toelichting (optioneel)').fill('Werk, kan er niet bij zijn.');
  await page.getByRole('button', { name: 'Afmelden bevestigen' }).click();
  await expect(page).toHaveURL(new RegExp(`/afmelden/${id}/gelukt$`));
  await expect(page.getByRole('heading', { level: 1, name: `Je bent afgemeld voor ${naam}` })).toBeVisible();
  await expect(page.getByText('Werk, kan er niet bij zijn.')).toBeVisible();
  await expect(page.getByText('Afgemeld op')).toBeVisible();
  expect(afmeldingen(id, lidId)).toBe('1');
  expect(
    psql(
      `select toelichting from public.afmeldingen where activiteit_id = '${id}' and lid_id = '${lidId}';`,
    ).trim(),
  ).toBe('Werk, kan er niet bij zijn.');
  await isNetjes(page);

  // Van gedachten veranderd: intrekken, zonder bevestigingspagina, naar "weer aanwezig".
  await page.getByRole('button', { name: 'Afmelding intrekken' }).click();
  await expect(page).toHaveURL(new RegExp(`/afmelden/${id}/ingetrokken$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Je staat weer op aanwezig' })).toBeVisible();
  expect(afmeldingen(id, lidId)).toBe('0');
  await isNetjes(page);

  await page.goto(`/programma/${id}`);
  await expect(statusPaneel(page).getByText('Je staat op aanwezig, zonder dienst.')).toBeVisible();
  await expect(statusPaneel(page).getByRole('link', { name: 'Afmelden' })).toBeVisible();
});

test('een afgemeld lid ziet het op Start en in het programma, en kan overal intrekken', async ({ page }) => {
  const { lidId } = await logInAlsLid(page);
  const ger = maakTestlid('Ger', kenmerk, { telefoon: '06 12 34 56 78', magEindverantwoordelijke: true });
  const naam = maakNaam('intrekken');
  const id = maakActiviteit(naam);
  zetPlek(id, 'eindverantwoordelijke', ger.id);
  psql(
    `insert into public.afmeldingen (activiteit_id, lid_id, toelichting) values ('${id}', '${lidId}', 'Ziek');`,
  );

  // Op de pagina van de activiteit: de status en de knop, zonder Afmelden.
  await page.goto(`/programma/${id}`);
  await expect(statusPaneel(page).getByText('Je bent afgemeld.')).toBeVisible();
  await expect(statusPaneel(page).getByRole('link', { name: 'Afmelden' })).toHaveCount(0);
  await expect(statusPaneel(page).getByRole('button', { name: 'Afmelding intrekken' })).toBeVisible();
  await isNetjes(page);

  // Op Start staat dezelfde knop (R9: overal waar de afmelding zichtbaar is).
  await page.goto('/');
  await expect(intrekKnop(page, naam)).toBeVisible();

  // Intrekken vanuit het programma.
  await page.goto(`/programma/${id}`);
  await statusPaneel(page).getByRole('button', { name: 'Afmelding intrekken' }).click();
  await expect(page).toHaveURL(new RegExp(`/afmelden/${id}/ingetrokken$`));
  expect(afmeldingen(id, lidId)).toBe('0');

  // Nog een keer intrekken (een tweede tabblad, een oude pagina): geen fout, je staat gewoon op aanwezig.
  psql(`insert into public.afmeldingen (activiteit_id, lid_id) values ('${id}', '${lidId}');`);
  await page.goto(`/programma/${id}`);
  psql(`delete from public.afmeldingen where activiteit_id = '${id}' and lid_id = '${lidId}';`);
  await statusPaneel(page).getByRole('button', { name: 'Afmelding intrekken' }).click();
  await expect(page).toHaveURL(new RegExp(`/afmelden/${id}/ingetrokken$`));
  await expect(geenFoutmelding(page)).toHaveCount(0);
});

test('onder de ondergrens na de deadline kan afmelden niet: de blokkade met het nummer van de eindverantwoordelijke', async ({
  page,
}) => {
  const { lidId } = await logInAlsLid(page);
  const ger = maakTestlid('Ger', kenmerk, { telefoon: '06 12 34 56 78', magEindverantwoordelijke: true });
  const naam = maakNaam('ondergrens');
  const id = maakActiviteit(naam);
  zetPlek(id, 'eindverantwoordelijke', ger.id);
  // Een eigen groep met alleen dit lid: één aanwezige, het minimum is één, en de deadline is voorbij.
  psql(`
    insert into public.groepen (naam, volgorde) values ('E2E Afmelden ${kenmerk}', 98) on conflict do nothing;
    insert into public.lid_groep (lid_id, groep_id)
      select '${lidId}', id from public.groepen where naam = 'E2E Afmelden ${kenmerk}';
    insert into public.activiteit_groep (activiteit_id, groep_id)
      select '${id}', id from public.groepen where naam = 'E2E Afmelden ${kenmerk}';
    update public.activiteiten set min_aanwezigen = 1, afmeld_deadline = now() - interval '1 day' where id = '${id}';
  `);

  await page.goto(`/afmelden/${id}`);
  await expect(page.getByText(/\(verstreken\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Afmelden bevestigen' }).click();

  await expect(page).toHaveURL(new RegExp(`/afmelden/${id}/kan-niet\\?min=1&nu=1$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Afmelden kan nu niet' })).toBeVisible();
  await expect(
    page.getByText(
      'Meld je bij de eindverantwoordelijke, afmelden gaat nu niet i.v.m. laag aantal aanwezigen.',
    ),
  ).toBeVisible();
  await expect(page.getByText('Er is niets vastgelegd')).toBeVisible();
  await expect(page.getByText(ger.naam)).toBeVisible();
  await expect(page.getByRole('link', { name: '06 12 34 56 78' })).toHaveAttribute('href', 'tel:0612345678');
  await expect(
    page.getByText('Nu 1 aanwezig, het minimum is 1. Met jouw afmelding worden het er 0.'),
  ).toBeVisible();
  expect(afmeldingen(id, lidId)).toBe('0');
  await isNetjes(page);

  // Terug naar start.
  await page.getByRole('link', { name: 'Terug naar start' }).first().click();
  await expect(page).toHaveURL(/\/$/);
});

test('wie een dienst of een beheerrol heeft, krijgt geen knop Afmelden maar een uitleg', async ({ page }) => {
  const { lidId } = await logInAlsLid(page);
  const ger = maakTestlid('Ger', kenmerk, { telefoon: '06 12 34 56 78', magEindverantwoordelijke: true });

  // Een dienst: eerst overdragen (R7), en dat scherm volgt in stap D.
  const dienst = maakNaam('dienst');
  const dienstId = maakActiviteit(dienst);
  zetPlek(dienstId, 'eindverantwoordelijke', ger.id);
  zetPlek(dienstId, 'werker', lidId, 1);
  await page.goto(`/programma/${dienstId}`);
  await expect(statusPaneel(page).getByText('Je staat op aanwezig als werker.')).toBeVisible();
  await expect(statusPaneel(page).getByRole('link', { name: /^Afmelden/ })).toHaveCount(0);
  await expect(
    statusPaneel(page).getByText(/Afmelden en je dienst overdragen kunnen hier nog niet/),
  ).toBeVisible();
  // Ook rechtstreeks naar het adres: een uitleg, geen formulier.
  await page.goto(`/afmelden/${dienstId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Afmelden kan hier niet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Afmelden bevestigen' })).toHaveCount(0);
  await isNetjes(page);

  // Een beheerrol (BOB): alleen het bestuur wijzigt die.
  const bobNaam = maakNaam('bob');
  const bobId = maakActiviteit(bobNaam, { dag: `${VANDAAG} + 1` });
  zetPlek(bobId, 'eindverantwoordelijke', ger.id);
  zetPlek(bobId, 'bob', lidId, 1);
  await page.goto(`/programma/${bobId}`);
  await expect(statusPaneel(page).getByText('Deze rol wijzigt alleen het bestuur.')).toBeVisible();
  await expect(statusPaneel(page).getByRole('link', { name: /^Afmelden/ })).toHaveCount(0);
});

test('dubbel klikken op Afmelden bevestigen geeft één afmelding en geen fout', async ({ page }) => {
  const { lidId } = await logInAlsLid(page);
  const ger = maakTestlid('Ger', kenmerk, { telefoon: '06 12 34 56 78', magEindverantwoordelijke: true });
  const id = maakActiviteit(maakNaam('dubbel'));
  zetPlek(id, 'eindverantwoordelijke', ger.id);

  await page.goto(`/afmelden/${id}`);
  await page.getByRole('button', { name: 'Afmelden bevestigen' }).dblclick();
  await expect(page).toHaveURL(new RegExp(`/afmelden/${id}/gelukt$`));
  await expect(geenFoutmelding(page)).toHaveCount(0);
  expect(afmeldingen(id, lidId)).toBe('1');

  // Wie al is afgemeld en de bevestigingspagina nog eens opent, gaat naar het resultaat.
  await page.goto(`/afmelden/${id}`);
  await expect(page).toHaveURL(new RegExp(`/afmelden/${id}/gelukt$`));
});

test('een activiteit die is geweest, is niet meer af te melden; een onbekende of verborgen bestaat niet', async ({
  page,
}) => {
  await logInAlsLid(page);
  const ger = maakTestlid('Ger', kenmerk, { telefoon: '06 12 34 56 78', magEindverantwoordelijke: true });

  const geweest = maakActiviteit(maakNaam('geweest'), { dag: `${VANDAAG} - 1`, eindtijd: '23:00' });
  zetPlek(geweest, 'eindverantwoordelijke', ger.id);
  await page.goto(`/afmelden/${geweest}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Afmelden kan hier niet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Afmelden bevestigen' })).toHaveCount(0);

  const concept = maakActiviteit(maakNaam('concept'), { status: 'concept' });
  for (const adres of [`/afmelden/${concept}`, `/afmelden/${crypto.randomUUID()}`, '/afmelden/geen-id']) {
    const antwoord = await page.goto(adres);
    expect(antwoord?.status(), adres).toBe(404);
  }
});

test('zonder in te loggen gaan de afmeldpagina’s naar het inloggen', async ({ page }) => {
  const id = crypto.randomUUID();
  for (const adres of [
    `/afmelden/${id}`,
    `/afmelden/${id}/gelukt`,
    `/afmelden/${id}/ingetrokken`,
    `/afmelden/${id}/kan-niet`,
  ]) {
    await page.goto(adres);
    await expect(page, adres).toHaveURL(/\/inloggen/);
  }
});
