// Mensen indelen op de plekken van een activiteit (UC-005), met echte gegevens: de keuzelijst per plek, "eraf halen" met de twee
// uitkomsten, wie je niet kunt kiezen, de waarschuwing bij een andere groep, en een plek die een ander net heeft gewijzigd.
// De logica van het formulier staat in src/lib; deze tests bewijzen het geheel: formulier, serveractie,
// public.activiteit_opslaan en de rechten.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  logInAlsBeheerder,
  maakTestlid,
  ruimActiviteitenOp,
  ruimTestledenOp,
  voegPlekToe,
} from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { ruimLidOp } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';

const kenmerk = `T${crypto.randomUUID().slice(0, 7)}`;
let reeks = 0;
function maakNaam(soort: string): string {
  reeks += 1;
  return `E2E Indelen ${soort} ${reeks} ${kenmerk}`;
}

const aangemaakt: string[] = [];

test.afterAll(async () => {
  ruimActiviteitenOp(`E2E Indelen % ${kenmerk}`);
  psql(`delete from public.wijzigingen_log where omschrijving like '%E2E Indelen % ${kenmerk}%';`);
  ruimTestledenOp(kenmerk);
  for (const uid of aangemaakt.splice(0)) await ruimLidOp(uid);
});

const opslaan = (page: Page) => page.getByRole('button', { name: 'Opslaan als concept' });

/** De keuzelijst van een plek; exact, want "Nieuwe plek 1 van tapper" is ook het begin van het label van het kruisje. */
const plek = (page: Page, label: string): Locator => page.getByLabel(label, { exact: true });

function activiteitId(naam: string): string {
  return psql(`select id from public.activiteiten where naam = '${naam}';`).trim();
}

/** De bezetters van de plekken van een rol, als voornamen op volgorde ("-" bij een lege plek). */
function bezetters(id: string, rol: string): string {
  return psql(
    `select coalesce(string_agg(coalesce(l.voornaam, '-'), ',' order by s.volgorde), '') from public.rol_slots s left join public.leden l on l.id = s.bezetter_id where s.activiteit_id = '${id}' and s.rol_type = '${rol}';`,
  ).trim();
}

/** Een nieuw concept met naam en datum, op het scherm klaar om plekken bij te zetten. */
async function begin(page: Page, naam: string, datum: string): Promise<void> {
  await page.goto('/beheer/activiteiten/nieuw');
  await page.getByLabel('Naam *').fill(naam);
  await page.getByLabel('Datum *').fill(datum);
}

test('iemand indelen, de eindverantwoordelijke kiezen, en daarna eraf halen: openlaten of weghalen', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const anna = maakTestlid('Anna', kenmerk);
  const bert = maakTestlid('Bert', kenmerk);
  const carla = maakTestlid('Carla', kenmerk, { magEindverantwoordelijke: true });
  const naam = maakNaam('stappen');

  await begin(page, naam, '2099-04-05');
  await voegPlekToe(page, 'tapper');
  await voegPlekToe(page, 'tapper');
  await plek(page, 'Nieuwe plek 1 van tapper').selectOption({ label: anna.naam });
  await plek(page, 'Nieuwe plek 2 van tapper').selectOption({ label: bert.naam });
  await plek(page, 'Eindverantwoordelijke').selectOption({ label: carla.naam });
  await opslaan(page).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);

  const id = activiteitId(naam);
  expect(bezetters(id, 'tapper')).toBe('Anna,Bert');
  expect(bezetters(id, 'eindverantwoordelijke')).toBe('Carla');
  expect(
    psql(
      `select count(*) from public.wijzigingen_log where actie = 'plek_toegewezen' and omschrijving like '%${naam}%';`,
    ).trim(),
  ).toBe('3');

  // Het concept staat er weer zoals het was opgeslagen.
  await page.getByRole('link', { name: new RegExp(naam) }).click();
  await expect(plek(page, 'Tapper 1')).toHaveValue(anna.id);
  await expect(plek(page, 'Tapper 2')).toHaveValue(bert.id);
  await expect(plek(page, 'Eindverantwoordelijke')).toHaveValue(carla.id);
  // Met een eindverantwoordelijke is er nog een telefoonnummer nodig om te publiceren.
  await expect(
    page.getByRole('listitem').filter({ hasText: /^Telefoonnummer van de eindverantwoordelijke$/ }),
  ).toBeVisible();

  // "Anna eraf halen": de plek openlaten. "Bert eraf halen": de plek weghalen.
  await plek(page, 'Tapper 1').selectOption({ label: 'Plek openlaten' });
  await plek(page, 'Tapper 2').selectOption({ label: 'Plek weghalen' });
  await opslaan(page).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);
  expect(bezetters(id, 'tapper')).toBe('-');
  expect(
    psql(
      `select count(*) from public.rol_slots where activiteit_id = '${id}' and rol_type = 'tapper';`,
    ).trim(),
  ).toBe('1');
  expect(psql(`select versie from public.activiteiten where id = '${id}';`).trim()).toBe('2');
  expect(
    psql(
      `select count(*) from public.wijzigingen_log where actie = 'plek_leeggemaakt' and omschrijving like '%${naam}%';`,
    ).trim(),
  ).toBe('2');

  // De eindverantwoordelijke vervangen kan; hij kan niet worden weggehaald, alleen opengelaten.
  await page.getByRole('link', { name: new RegExp(naam) }).click();
  const ev = plek(page, 'Eindverantwoordelijke');
  await expect(ev.getByRole('option', { name: 'Plek openlaten' })).toHaveCount(1);
  await expect(ev.getByRole('option', { name: 'Plek weghalen' })).toHaveCount(0);
  // Anna is niet aangemerkt als eindverantwoordelijke: een hint bij de naam, geen blokkade (R19).
  await ev.selectOption({ label: `${anna.naam} — nog niet aangemerkt als eindverantwoordelijke` });
  await opslaan(page).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);
  expect(bezetters(id, 'eindverantwoordelijke')).toBe('Anna');
});

test('wie al is ingedeeld of zich heeft afgemeld, staat niet te kiezen', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const dirk = maakTestlid('Dirk', kenmerk);
  const els = maakTestlid('Els', kenmerk);
  const naam = maakNaam('beschikbaar');

  await begin(page, naam, '2099-04-06');
  await voegPlekToe(page, 'tapper');
  await voegPlekToe(page, 'tapper');
  await plek(page, 'Nieuwe plek 1 van tapper').selectOption({ label: dirk.naam });
  // Dirk staat nu op plek 1: op plek 2 is hij niet te kiezen.
  await expect(
    plek(page, 'Nieuwe plek 2 van tapper').getByRole('option', { name: `${dirk.naam} — al ingedeeld` }),
  ).toBeDisabled();
  await opslaan(page).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);

  // Wie zich heeft afgemeld, ook niet.
  const id = activiteitId(naam);
  psql(
    `insert into public.afmeldingen (activiteit_id, lid_id, toelichting) values ('${id}', '${els.id}', 'Verzonnen reden');`,
  );
  await page.getByRole('link', { name: new RegExp(naam) }).click();
  await voegPlekToe(page, 'tapper');
  await expect(
    plek(page, 'Nieuwe plek 1 van tapper').getByRole('option', { name: `${els.naam} — afgemeld` }),
  ).toBeDisabled();
});

test('een externe helper kan tapper en BOB zijn maar geen eindverantwoordelijke; een BOB zonder aanmerking krijgt een hint', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const extern = maakTestlid('Eddie', kenmerk, { extern: true });
  const gewoon = maakTestlid('Fien', kenmerk);
  const naam = maakNaam('rollen');

  await begin(page, naam, '2099-04-07');
  await voegPlekToe(page, 'tapper');
  await voegPlekToe(page, 'bob');
  await expect(
    plek(page, 'Nieuwe plek 1 van tapper').getByRole('option', { name: `${extern.naam} (extern)` }),
  ).toHaveCount(1);
  // BOB mag ook iemand van buiten de vereniging zijn (09-11-2026); de eindverantwoordelijke niet.
  await expect(
    plek(page, 'Nieuwe plek 1 van BOB').getByRole('option', { name: new RegExp(extern.naam) }),
  ).toHaveCount(1);
  await expect(
    plek(page, 'Nieuwe plek 1 van BOB').getByRole('option', { name: 'Iemand van buiten de vereniging…' }),
  ).toHaveCount(1);
  await expect(
    plek(page, 'Eindverantwoordelijke').getByRole('option', { name: new RegExp(extern.naam) }),
  ).toHaveCount(0);
  await expect(
    plek(page, 'Eindverantwoordelijke').getByRole('option', { name: 'Iemand van buiten de vereniging…' }),
  ).toHaveCount(0);

  // Een hulp bij het kiezen, geen blokkade (R19).
  const hint = `${gewoon.naam} — nog niet aangemerkt als BOB`;
  await expect(plek(page, 'Nieuwe plek 1 van BOB').getByRole('option', { name: hint })).toHaveCount(1);
  await plek(page, 'Nieuwe plek 1 van BOB').selectOption({ label: hint });
  await plek(page, 'Nieuwe plek 1 van tapper').selectOption({ label: `${extern.naam} (extern)` });
  await opslaan(page).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);
  const id = activiteitId(naam);
  expect(bezetters(id, 'bob')).toBe('Fien');
  expect(bezetters(id, 'tapper')).toBe('Eddie');
});

test('iemand buiten de groep voor wie de activiteit is, geeft een fout bij de plekken en je keuze blijft staan', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const gerrit = maakTestlid('Gerrit', kenmerk);
  const naam = maakNaam('groep');

  await begin(page, naam, '2099-04-08');
  await page.getByRole('checkbox', { name: /Bestuur/ }).check();
  await voegPlekToe(page, 'tapper');
  await plek(page, 'Nieuwe plek 1 van tapper').selectOption({ label: gerrit.naam });
  await opslaan(page).click();

  await expect(page).toHaveURL(/\/beheer\/activiteiten\/nieuw$/);
  await expect(page.getByText(/hoort niet bij de groep voor wie deze activiteit is/)).toBeVisible();
  await expect(plek(page, 'Nieuwe plek 1 van tapper')).toHaveValue(gerrit.id);
  await expect(page.getByRole('checkbox', { name: /Bestuur/ })).toBeChecked();

  // Zonder de groep gaat het door.
  await page.getByRole('checkbox', { name: /Iedereen/ }).check();
  await opslaan(page).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);
  expect(bezetters(activiteitId(naam), 'tapper')).toBe('Gerrit');
});

test('als een ander de plek net heeft ingevuld, gaat jouw keuze niet door en overschrijf je niets', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const hans = maakTestlid('Hans', kenmerk);
  const ine = maakTestlid('Ine', kenmerk);
  const naam = maakNaam('slot');

  await begin(page, naam, '2099-04-09');
  await voegPlekToe(page, 'tapper');
  await opslaan(page).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);
  const id = activiteitId(naam);

  await page.getByRole('link', { name: new RegExp(naam) }).click();
  await expect(plek(page, 'Tapper 1')).toHaveValue('');
  // Een ander bestuurslid deelt Hans in terwijl deze beheerder nog kijkt.
  psql(
    `update public.rol_slots set bezetter_id = '${hans.id}' where activiteit_id = '${id}' and rol_type = 'tapper';`,
  );

  await plek(page, 'Tapper 1').selectOption({ label: ine.naam });
  await opslaan(page).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Deze plek is inmiddels gewijzigd' })).toBeVisible();
  await expect(plek(page, 'Tapper 1')).toHaveValue(ine.id);
  expect(bezetters(id, 'tapper')).toBe('Hans');
});

test('het formulier met keuzelijsten heeft geen toegankelijkheidsfouten en schuift niet opzij', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const jos = maakTestlid('Jos', kenmerk);
  const naam = maakNaam('axe');
  await begin(page, naam, '2099-04-10');
  await voegPlekToe(page, 'tapper');
  await plek(page, 'Nieuwe plek 1 van tapper').selectOption({ label: jos.naam });
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
  ).toBe(false);
  await opslaan(page).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);
  await page.getByRole('link', { name: new RegExp(naam) }).click();
  await expect(plek(page, 'Tapper 1')).toHaveValue(jos.id);
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
});

test('de rollen komen uit de lijst; iemand van buiten de vereniging zet je erop met alleen een naam', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const gijs = maakTestlid('Gijs', kenmerk, { magEindverantwoordelijke: true });
  const naam = maakNaam('buiten');

  await begin(page, naam, '2099-04-09');
  // Werker is te algemeen en "Anders" bestaat niet: alleen de rollen uit de lijst.
  const rolkeuze = page.getByLabel('Plek toevoegen', { exact: true });
  await expect(rolkeuze.getByRole('option')).toHaveText([
    'Tapper',
    'Buffet',
    'Ober',
    'Bonnenkassa',
    'Drankhaler',
    'Fotograaf',
    'BOB',
  ]);

  await voegPlekToe(page, 'bonnenkassa');
  const nieuwePlek = plek(page, 'Nieuwe plek 1 van bonnenkassa');
  await nieuwePlek.selectOption({ label: 'Iemand van buiten de vereniging…' });
  await page
    .getByLabel('Naam van iemand van buiten de vereniging, nieuwe plek 1 van bonnenkassa', { exact: true })
    .fill(`Henk ${kenmerk}`);
  await plek(page, 'Eindverantwoordelijke').selectOption({ label: gijs.naam });
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
  ).toBe(false);
  await opslaan(page).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);

  expect(bezetters(activiteitId(naam), 'bonnenkassa')).toBe('Henk');
  expect(
    psql(
      `select l.type || ' ' || (select count(*) from public.leden_prive p where p.lid_id = l.id) from public.leden l where l.voornaam = 'Henk' and l.achternaam = '${kenmerk}';`,
    ).trim(),
  ).toBe('extern 0');

  // De volgende keer staat hij gewoon in de keuzelijst.
  await page.goto('/beheer/activiteiten/nieuw');
  await voegPlekToe(page, 'tapper');
  await expect(
    plek(page, 'Nieuwe plek 1 van tapper').getByRole('option', { name: `Henk ${kenmerk} (extern)` }),
  ).toHaveCount(1);
});
