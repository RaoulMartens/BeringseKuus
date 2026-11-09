// Een concept verwijderen (UC-004 AF-10), met echte gegevens: de link onderaan het statuspaneel gaat naar een eigen
// bevestigingspagina; Annuleren wijzigt niets, Concept verwijderen haalt de activiteit met zijn plekken weg en laat het
// overzicht de naam noemen. Een activiteit die intussen is gepubliceerd, blijft staan. De controles zelf staan in
// public.concept_verwijderen (databasetests); deze tests bewijzen formulier, serveractie en rechten.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

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
  return `E2E Verwijderen ${soort} ${reeks} ${kenmerk}`;
}

const aangemaakt: string[] = [];

test.afterAll(async () => {
  ruimActiviteitenOp(`E2E Verwijderen % ${kenmerk}`);
  psql(`delete from public.wijzigingen_log where omschrijving like '%E2E Verwijderen % ${kenmerk}%';`);
  ruimTestledenOp(kenmerk);
  for (const uid of aangemaakt.splice(0)) await ruimLidOp(uid);
});

function activiteitId(naam: string): string {
  return psql(`select id from public.activiteiten where naam = '${naam}';`).trim();
}

function aantal(tabel: string, voorwaarde: string): string {
  return psql(`select count(*) from public.${tabel} where ${voorwaarde};`).trim();
}

/** Een nieuw concept met twee ingedeelde mensen (een werker en de eindverantwoordelijke), bewaard en weer geopend. */
async function maakConcept(page: Page, naam: string) {
  const anna = maakTestlid(`Anna${reeks}`, kenmerk);
  const ger = maakTestlid(`Ger${reeks}`, kenmerk, { magEindverantwoordelijke: true });
  await page.goto('/beheer/activiteiten/nieuw');
  await page.getByLabel('Naam *').fill(naam);
  await page.getByLabel('Datum *').fill('2099-06-06');
  await voegPlekToe(page, 'tapper');
  await page.getByLabel('Nieuwe plek 1 van tapper', { exact: true }).selectOption({ label: anna.naam });
  await page.getByLabel('Eindverantwoordelijke', { exact: true }).selectOption({ label: ger.naam });
  await page.getByRole('button', { name: 'Opslaan als concept' }).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);
  await page.getByRole('link', { name: new RegExp(naam) }).click();
  return { anna, ger, id: activiteitId(naam) };
}

test('Concept verwijderen vraagt eerst een bevestiging; Annuleren laat alles staan, verwijderen haalt de activiteit weg', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const naam = maakNaam('stappen');
  const { anna, id } = await maakConcept(page, naam);

  // De link staat in het scherm (op een telefoon onder het formulier, op een groot scherm onderaan het statuspaneel).
  await page.getByRole('link', { name: 'Concept verwijderen' }).click();
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}/verwijderen$`));
  await expect(page.getByRole('heading', { level: 1, name: `${naam} verwijderen?` })).toBeVisible();
  await expect(page.getByText('2 mensen zijn al ingedeeld. Die indeling verdwijnt.')).toBeVisible();
  await expect(page.getByText('Dit kun je niet terugdraaien.')).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
  ).toBe(false);

  // Annuleren: terug naar de activiteit, alles staat er nog.
  await page.getByRole('link', { name: 'Annuleren' }).click();
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}$`));
  expect(aantal('activiteiten', `id = '${id}'`)).toBe('1');

  // Verwijderen: naar het overzicht met de naam in de melding; de activiteit en zijn plekken zijn weg, de leden niet.
  await page.getByRole('link', { name: 'Concept verwijderen' }).click();
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}/verwijderen$`));
  await page.getByRole('button', { name: 'Concept verwijderen' }).click();
  await expect(page).toHaveURL(/\/beheer\?verwijderd=/);
  await expect(page.getByText(`${naam} is verwijderd.`)).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(naam) })).toHaveCount(0);
  expect(aantal('activiteiten', `id = '${id}'`)).toBe('0');
  expect(aantal('rol_slots', `activiteit_id = '${id}'`)).toBe('0');
  expect(aantal('leden', `id = '${anna.id}'`)).toBe('1');
  expect(aantal('wijzigingen_log', `actie = 'concept_verwijderd' and rij_id = '${id}'`)).toBe('1');
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  // De bevestigingspagina van een activiteit die er niet meer is, bestaat niet.
  const antwoord = await page.goto(`/beheer/activiteiten/${id}/verwijderen`);
  expect(antwoord?.status()).toBe(404);
});

test('een gepubliceerde activiteit verwijderen: de bevestiging zegt dat leden hem zien en geen bericht krijgen', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const naam = maakNaam('gepubliceerd');
  const { anna, id } = await maakConcept(page, naam);
  const els = maakTestlid(`Els${reeks}`, kenmerk);
  psql(
    `update public.activiteiten set status = 'gepubliceerd', starttijd = '20:00', eindtijd = '23:00', locatie = 'Testlocatie' where id = '${id}';
     insert into public.afmeldingen (activiteit_id, lid_id) values ('${id}', '${els.id}');`,
  );

  // Rechtstreeks naar het bewerkscherm: een herlaadbeurt kan nog de pagina van vóór de klik in maakConcept treffen.
  await page.goto(`/beheer/activiteiten/${id}`);
  await page.getByRole('link', { name: 'Activiteit verwijderen' }).click();
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}/verwijderen$`));
  await expect(page.getByRole('heading', { level: 1, name: `${naam} verwijderen?` })).toBeVisible();
  await expect(page.getByText('Leden zien deze activiteit nu in het programma.')).toBeVisible();
  await expect(page.getByText('2 mensen zijn al ingedeeld. Die indeling verdwijnt.')).toBeVisible();
  await expect(page.getByText('1 lid heeft zich afgemeld. Die afmelding verdwijnt ook.')).toBeVisible();
  await expect(page.getByText('Er gaat geen bericht uit.')).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  await page.getByRole('button', { name: 'Activiteit verwijderen' }).click();
  await expect(page).toHaveURL(/\/beheer\?verwijderd=/);
  await expect(page.getByText(`${naam} is verwijderd.`)).toBeVisible();
  expect(aantal('activiteiten', `id = '${id}'`)).toBe('0');
  expect(aantal('rol_slots', `activiteit_id = '${id}'`)).toBe('0');
  expect(aantal('afmeldingen', `activiteit_id = '${id}'`)).toBe('0');
  expect(aantal('leden', `id = '${anna.id}'`)).toBe('1');
  expect(aantal('wijzigingen_log', `actie = 'activiteit_verwijderd' and rij_id = '${id}'`)).toBe('1');
});

test('een gepubliceerde activiteit die al geweest is, blijft staan', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const naam = maakNaam('geweest');
  const { id } = await maakConcept(page, naam);

  await page.getByRole('link', { name: 'Concept verwijderen' }).click();
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}/verwijderen$`));

  // Intussen is hij gepubliceerd en voorbij (in de tijd van de test: een datum in het verleden).
  psql(
    `update public.activiteiten set status = 'gepubliceerd', datum = '2020-06-06', starttijd = '20:00', eindtijd = '23:00', locatie = 'Testlocatie' where id = '${id}';`,
  );

  await page.getByRole('button', { name: 'Concept verwijderen' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'al geweest' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}/verwijderen$`));
  expect(aantal('activiteiten', `id = '${id}'`)).toBe('1');
});

test('een nieuwe activiteit, die nog niet bestaat, heeft geen link om te verwijderen', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  await page.goto('/beheer/activiteiten/nieuw');
  await expect(page.getByRole('link', { name: 'Concept verwijderen' })).toHaveCount(0);
});
