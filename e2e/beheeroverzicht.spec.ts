// Het beheeroverzicht met echte gegevens (tegen de lokale Supabase): wat de beheerder ziet komt uit public.beheeroverzicht()
// (alleen voor een beheerder met een code), en wat er te doen is staat per regel in woorden. De logica van de tekst staat in
// src/lib/beheeroverzicht.test.ts; deze tests bewijzen het geheel: de rechten, de database, de pagina, de filters.
//
// De tellers bevatten ook wat andere tests tegelijk aanmaken (twee projecten, desktop en telefoon, draaien tegelijk). De
// tests kijken daarom naar de eigen regels met een eigen naam, en bij de tellers alleen naar "minstens het eigen deel".
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { lidIdVan, logInAlsBeheerder, ruimActiviteitenOp } from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { nieuwAdres } from './inloggen-hulp.ts';
import { bevestigAdresVoor, maakLidMetRol, ruimLidOp } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';

const lopende = crypto.randomUUID().slice(0, 8);
let reeks = 0;
/** De naam van een activiteit van deze test: elke test maakt zijn eigen set, met een volgnummer, zodat namen niet botsen. */
const maakNaam =
  (nummer: number) =>
  (soort: string): string =>
    `E2E Overzicht ${soort} ${nummer} ${lopende}`;
type Naam = ReturnType<typeof maakNaam>;

/** De kaart met deze titel: een <section> zonder eigen naam, dus via zijn kop. */
function kaart(page: Page, titel: string): Locator {
  return page.locator('section', { has: page.getByRole('heading', { level: 2, name: titel }) });
}

const aangemaakt: string[] = [];

test.afterAll(async () => {
  ruimActiviteitenOp(`E2E Overzicht % ${lopende}`);
  for (const uid of aangemaakt.splice(0)) await ruimLidOp(uid);
});

/** Drie activiteiten voor het overzicht, met de eigenaar van de eindverantwoordelijke-plek als het account van de test. */
function maakActiviteiten(lid: string): Naam {
  reeks += 1;
  const naam = maakNaam(reeks);
  // Het minimum staat uit (leeg), zodat het aantal aanwezigen van de lokale leden de test niet beïnvloedt.
  psql(`
    insert into public.activiteiten (naam, datum, verzameltijd, starttijd, eindtijd, locatie, status, min_aanwezigen) values
      ('${naam('orde')}', current_date + 10, '18:00', '19:00', '23:00', 'Testlocatie', 'gepubliceerd', null),
      ('${naam('dienst')}', current_date + 11, '18:00', '19:00', '23:00', 'Testlocatie', 'gepubliceerd', null);
    insert into public.activiteiten (naam, datum) values ('${naam('concept')}', current_date + 12);

    -- Op orde: de eindverantwoordelijke is bezet en er is geen lege plek.
    insert into public.rol_slots (activiteit_id, rol_type, volgorde, bezetter_id)
    select id, 'eindverantwoordelijke', 0, '${lid}' from public.activiteiten where naam = '${naam('orde')}';

    -- Dienst: de eindverantwoordelijke is bezet, en er is één lege werker.
    insert into public.rol_slots (activiteit_id, rol_type, volgorde, bezetter_id)
    select id, 'eindverantwoordelijke', 0, '${lid}' from public.activiteiten where naam = '${naam('dienst')}';
    insert into public.rol_slots (activiteit_id, rol_type, volgorde)
    select id, 'werker', 1 from public.activiteiten where naam = '${naam('dienst')}';

    -- Concept: een lege eindverantwoordelijke en twee lege werkers, zonder tijden en locatie.
    insert into public.rol_slots (activiteit_id, rol_type, volgorde)
    select id, r.rol, r.volgorde from public.activiteiten
     cross join (values ('eindverantwoordelijke', 0), ('werker', 1), ('werker', 2)) as r(rol, volgorde)
     where naam = '${naam('concept')}';
  `);
  return naam;
}

test('het overzicht zegt per regel wat er te doen is, en verdeelt in aandacht en op orde', async ({
  page,
}) => {
  const uid = await logInAlsBeheerder(page);
  aangemaakt.push(uid);
  const naam = maakActiviteiten(lidIdVan(uid));
  await page.goto('/beheer');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Activiteiten');
  const menu = page.getByRole('navigation', { name: 'Hoofdmenu' });
  await expect(menu.getByRole('link', { name: 'Beheer' })).toHaveAttribute('aria-current', 'page');

  const aandacht = kaart(page, 'Vraagt aandacht');
  const opOrde = kaart(page, 'Op orde');
  const dienst = aandacht.getByRole('listitem').filter({ hasText: naam('dienst') });
  await expect(dienst).toContainText('1 werker indelen');
  await expect(dienst).toContainText('— 18:00');
  const concept = aandacht.getByRole('listitem').filter({ hasText: naam('concept') });
  await expect(concept).toContainText(
    'Starttijd, eindtijd, locatie en eindverantwoordelijke invullen, 2 werkers indelen',
  );
  await expect(concept).toContainText('Concept');
  const orde = opOrde.getByRole('listitem').filter({ hasText: naam('orde') });
  await expect(orde).toContainText(/\d+ aanwezig/);
  await expect(aandacht.getByText(naam('orde'))).toHaveCount(0);

  // Een rij loopt niet over de hele pagina: de hoofdkolom is hooguit 680 px (ontwerpregel: geen volle breedte).
  expect((await dienst.boundingBox())?.width ?? Infinity).toBeLessThanOrEqual(680);
});

test('een teller is ook een filter, en "Alles tonen" brengt je terug', async ({ page }) => {
  const uid = await logInAlsBeheerder(page);
  aangemaakt.push(uid);
  const naam = maakActiviteiten(lidIdVan(uid));
  await page.goto('/beheer');

  const filter = page.getByRole('navigation', { name: 'Filter op wat er te doen is' });
  const diensten = filter.getByRole('link', { name: /diensten nog in te delen$/ });
  // Het eigen deel: de lege werker van "dienst" en de eindverantwoordelijke en twee werkers van "concept".
  const aantal = Number((await diensten.innerText()).match(/\d+/)?.[0]);
  expect(aantal).toBeGreaterThanOrEqual(4);
  await expect(filter.getByRole('link', { name: /concept(en)?$/ })).toBeVisible();

  await diensten.click();
  await expect(page).toHaveURL(/\/beheer\?filter=diensten$/);
  await expect(page.getByRole('heading', { level: 2, name: 'Diensten nog in te delen' })).toBeVisible();
  await expect(page.getByRole('link', { name: /diensten nog in te delen$/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(page.getByRole('listitem').filter({ hasText: naam('dienst') })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: naam('orde') })).toHaveCount(0);

  await page.getByRole('link', { name: 'Alles tonen' }).click();
  await expect(page).toHaveURL(/\/beheer$/);
  await expect(kaart(page, 'Op orde')).toBeVisible();

  await filter.getByRole('link', { name: /concept(en)?$/ }).click();
  await expect(page).toHaveURL(/\/beheer\?filter=concepten$/);
  await expect(page.getByRole('listitem').filter({ hasText: naam('concept') })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: naam('dienst') })).toHaveCount(0);

  // Nog een keer op het gekozen filter klikken haalt het weg.
  await page.getByRole('link', { name: /concept(en)?$/ }).click();
  await expect(page).toHaveURL(/\/beheer$/);

  // Een filter dat we niet kennen is gewoon "alles".
  await page.goto('/beheer?filter=onzin');
  await expect(kaart(page, 'Op orde')).toBeVisible();
});

test('dezelfde activiteit met dezelfde taak op vier dagen na elkaar is één rij die opengaat', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  reeks += 1;
  const naam = maakNaam(reeks)('reeks');
  // Vier concepten met dezelfde naam op vier dagen na elkaar: hetzelfde ontbreekt bij alle vier.
  psql(`
    insert into public.activiteiten (naam, datum)
    select '${naam}', current_date + 40 + g from generate_series(0, 3) g;
  `);

  await page.goto('/beheer');
  // Eén rij voor de reeks, niet vier keer dezelfde naam onder elkaar.
  const samenvatting = page.locator('summary').filter({ hasText: naam });
  await expect(samenvatting).toHaveCount(1);
  await expect(page.getByText(naam)).toHaveCount(1);
  await expect(samenvatting).toContainText('t/m');

  // Opengeklapt staat eerst "Alle 4 dagen bewerken" (een concept-reeks), dan de vier dagen, elk een link naar zijn eigen activiteit.
  await samenvatting.click();
  const dagen = page.locator('details', { has: samenvatting }).getByRole('link');
  await expect(dagen).toHaveCount(5);
  await expect(dagen.first()).toHaveText('Alle 4 dagen bewerken');
  await dagen.nth(1).click();
  await expect(page).toHaveURL(/\/beheer\/activiteiten\/[0-9a-f-]{36}$/);
});

test('een lid zonder beheerrechten komt er niet in', async ({ page }) => {
  const email = nieuwAdres();
  aangemaakt.push(await maakLidMetRol(email));
  await page.goto(await bevestigAdresVoor(email));
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page).toHaveURL(/\/mijn$/);
  await page.goto('/beheer?filter=diensten');
  await expect(page).toHaveURL(/\/geen-toegang$/);
});

test('het overzicht heeft geen toegankelijkheidsfouten en schuift niet opzij', async ({ page }) => {
  const uid = await logInAlsBeheerder(page);
  aangemaakt.push(uid);
  maakActiviteiten(lidIdVan(uid));
  for (const pad of ['/beheer', '/beheer?filter=diensten', '/beheer?filter=concepten']) {
    await page.goto(pad);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Activiteiten');
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations, pad).toEqual([]);
    const teBreed = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(teBreed, pad).toBe(false);
  }
});
