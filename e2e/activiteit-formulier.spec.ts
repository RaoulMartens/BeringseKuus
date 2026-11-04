// Het formulier voor een activiteit met echte gegevens (tegen de lokale Supabase en de Worker): aanmaken als concept,
// de fouten bij het veld, bewerken, een wijziging van een ander tussendoor. Een gepubliceerde activiteit wijzigen staat in gepubliceerd-wijzigen.spec.ts. De
// logica van de teksten en de controles staat in src/lib/activiteitformulier.test.ts; deze tests bewijzen het geheel:
// formulier, serveractie, public.activiteit_opslaan en de rechten.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { logInAlsBeheerder, ruimActiviteitenOp } from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { nieuwAdres } from './inloggen-hulp.ts';
import { bevestigAdresVoor, maakLidMetRol, ruimLidOp } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';

const lopende = crypto.randomUUID().slice(0, 8);
let reeks = 0;
/** Een unieke naam per test: de tests draaien tegelijk (desktop en telefoon) tegen dezelfde database. */
function maakNaam(soort: string): string {
  reeks += 1;
  return `E2E Formulier ${soort} ${reeks} ${lopende}`;
}

const aangemaakt: string[] = [];

test.afterAll(async () => {
  ruimActiviteitenOp(`E2E Formulier % ${lopende}`);
  psql(`delete from public.wijzigingen_log where omschrijving like '%E2E Formulier % ${lopende}%';`);
  for (const uid of aangemaakt.splice(0)) await ruimLidOp(uid);
});

const opslaan = (page: Page) => page.getByRole('button', { name: 'Opslaan als concept' });

/** Een volledig ingevuld formulier, behalve wat de test zelf wil weglaten. */
async function vulIn(page: Page, naam: string, datum: string): Promise<void> {
  await page.getByLabel('Naam *').fill(naam);
  await page.getByLabel('Datum *').fill(datum);
  await page.getByLabel('Verzameltijd').fill('13:30');
  await page.getByLabel('Starttijd *').fill('14:00');
  await page.getByLabel('Eindtijd *').fill('17:00');
  await page.getByLabel('Locatie *').fill('Testlocatie');
}

function activiteitId(naam: string): string {
  return psql(`select id from public.activiteiten where naam = '${naam}';`).trim();
}

test('een nieuw concept aanmaken met een doelgroep en plekken, en terug in het overzicht', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const naam = maakNaam('nieuw');

  await page.goto('/beheer');
  await page.getByRole('link', { name: 'Activiteit aanmaken' }).click();
  await expect(page).toHaveURL(/\/beheer\/activiteiten\/nieuw$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nieuwe activiteit');
  await expect(page.getByLabel('Minimaal aanwezig')).toHaveValue('13');
  await expect(page.getByRole('heading', { level: 2, name: 'Concept' })).toBeVisible();

  await vulIn(page, naam, '2099-03-05');
  await page.getByRole('checkbox', { name: /Bestuur/ }).check();
  await expect(page.getByRole('checkbox', { name: /Iedereen/ })).not.toBeChecked();
  await page.getByRole('button', { name: '+ werker-plek' }).click();
  await page.getByRole('button', { name: '+ werker-plek' }).click();
  await page.getByLabel('Belangrijk om te weten').fill('Neem je kostuum mee.');
  await opslaan(page).click();

  // Terug in het overzicht, met de melding in de woorden van de knop (ontwerpbesluit B3).
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=[0-9a-f-]{36}$/);
  await expect(page.getByText(`${naam} is opgeslagen als concept.`)).toBeVisible();
  const rij = page.getByRole('listitem').filter({ hasText: naam });
  await expect(rij).toContainText('Concept');
  await expect(rij).toContainText('Eindverantwoordelijke invullen, 2 werkers indelen');

  const id = activiteitId(naam);
  expect(psql(`select status, notitie, versie from public.activiteiten where id = '${id}';`).trim()).toBe(
    'concept|Neem je kostuum mee.|1',
  );
  expect(psql(`select count(*) from public.activiteit_groep where activiteit_id = '${id}';`).trim()).toBe(
    '1',
  );
  expect(
    psql(
      `select count(*) from public.rol_slots where activiteit_id = '${id}' and rol_type = 'werker';`,
    ).trim(),
  ).toBe('2');
  expect(
    psql(
      `select count(*) from public.rol_slots where activiteit_id = '${id}' and rol_type = 'eindverantwoordelijke';`,
    ).trim(),
  ).toBe('1');
  expect(
    psql(
      `select count(*) from public.wijzigingen_log where actie = 'activiteit_aangemaakt' and rij_id = '${id}';`,
    ).trim(),
  ).toBe('1');
});

test('opslaan als concept kan halfaf, met alleen een naam en een datum', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const naam = maakNaam('halfaf');
  await page.goto('/beheer/activiteiten/nieuw');
  await page.getByLabel('Naam *').fill(naam);
  await page.getByLabel('Datum *').fill('2099-03-06');
  await opslaan(page).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);
  await expect(page.getByText(`${naam} is opgeslagen als concept.`)).toBeVisible();
  const rij = page.getByRole('listitem').filter({ hasText: naam });
  await expect(rij).toContainText('Starttijd, eindtijd, locatie en eindverantwoordelijke invullen');
});

test('een fout staat bij het veld en wat je had ingevuld blijft staan', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  await page.goto('/beheer/activiteiten/nieuw');

  // Alles leeg: naam en datum zijn de enige verplichte velden voor een concept.
  await opslaan(page).click();
  await expect(page.getByLabel('Naam *')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Naam *')).toBeFocused();
  await expect(page.getByLabel('Naam *')).toHaveAccessibleDescription(/Vul een naam in\./);
  await expect(page.getByLabel('Datum *')).toHaveAccessibleDescription(/Vul een datum in\./);
  await expect(page.getByRole('alert').filter({ hasText: 'Het opslaan is niet gelukt' })).toBeVisible();
  await expect(page).toHaveURL(/\/beheer\/activiteiten\/nieuw$/);

  // Een eindtijd gelijk aan de starttijd, met een groep en een plek erbij: dat alles blijft staan.
  const naam = maakNaam('fout');
  await page.getByLabel('Naam *').fill(naam);
  await page.getByLabel('Datum *').fill('2099-03-07');
  await page.getByLabel('Starttijd *').fill('20:00');
  await page.getByLabel('Eindtijd *').fill('20:00');
  await page.getByLabel('Locatie *').fill('Testlocatie');
  await page.getByRole('checkbox', { name: /Dames/ }).check();
  await page.getByRole('button', { name: '+ drankhaler-plek' }).click();
  await opslaan(page).click();

  await expect(page.getByLabel('Eindtijd *')).toHaveAccessibleDescription(/gelijk zijn aan de starttijd/);
  await expect(page.getByLabel('Naam *')).toHaveValue(naam);
  await expect(page.getByLabel('Locatie *')).toHaveValue('Testlocatie');
  await expect(page.getByRole('checkbox', { name: /Dames/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Iedereen/ })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Nieuwe plek 1 van drankhaler weghalen' })).toBeVisible();

  // Verbeteren en opnieuw opslaan lukt, met de groep en de plek.
  await page.getByLabel('Eindtijd *').fill('23:00');
  await opslaan(page).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);
  const id = activiteitId(naam);
  expect(psql(`select count(*) from public.activiteit_groep where activiteit_id = '${id}';`).trim()).toBe(
    '1',
  );
  expect(
    psql(
      `select count(*) from public.rol_slots where activiteit_id = '${id}' and rol_type = 'drankhaler';`,
    ).trim(),
  ).toBe('1');
});

test('een concept bewerken: de velden staan er, een lege plek gaat weg en de versie gaat omhoog', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const naam = maakNaam('bewerken');
  await page.goto('/beheer/activiteiten/nieuw');
  await vulIn(page, naam, '2099-03-08');
  await page.getByRole('button', { name: '+ werker-plek' }).click();
  await page.getByRole('button', { name: '+ werker-plek' }).click();
  await opslaan(page).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);

  // Open het concept via de regel in het overzicht.
  await page.getByRole('link', { name: new RegExp(naam) }).click();
  await expect(page).toHaveURL(/\/beheer\/activiteiten\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${naam} — zondag 8 maart`);
  await expect(page.getByLabel('Naam *')).toHaveValue(naam);
  await expect(page.getByLabel('Starttijd *')).toHaveValue('14:00');
  await expect(page.getByLabel('Locatie *')).toHaveValue('Testlocatie');
  // Wat er nog nodig is om te publiceren: de eindverantwoordelijke (de rest is ingevuld).
  await expect(page.getByRole('heading', { level: 3, name: 'Nog nodig om te publiceren' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: /^Eindverantwoordelijke$/ })).toBeVisible();

  await page.getByLabel('Locatie *').fill('Andere zaal');
  await page.getByRole('button', { name: 'Lege plek 1 van werker weghalen' }).click();
  await opslaan(page).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);

  const id = activiteitId(naam);
  expect(psql(`select locatie, versie from public.activiteiten where id = '${id}';`).trim()).toBe(
    'Andere zaal|2',
  );
  expect(
    psql(
      `select count(*) from public.rol_slots where activiteit_id = '${id}' and rol_type = 'werker';`,
    ).trim(),
  ).toBe('1');
});

test('een bewerking waar het id of de modus ontbreekt, wordt geen nieuw concept (CR-06)', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const naam = maakNaam('zonder-id');
  await page.goto('/beheer/activiteiten/nieuw');
  await vulIn(page, naam, '2099-03-09');
  await opslaan(page).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);
  const id = activiteitId(naam);
  await page.getByRole('link', { name: new RegExp(naam) }).click();

  // Een formulier waar het id ontbreekt (een fout in de pagina of in de browser): geen nieuw concept met dezelfde naam.
  await page.locator('input[name="activiteit_id"]').evaluate((veld) => veld.remove());
  await page.getByLabel('Locatie *').fill('Zonder id');
  await opslaan(page).click();
  await expect(page.getByRole('alert').filter({ hasText: 'bestaat niet meer' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}$`));

  // Hetzelfde zonder versie, en zonder modus.
  await page.reload();
  await page.locator('input[name="versie"]').evaluate((veld) => veld.remove());
  await opslaan(page).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Iemand anders heeft deze activiteit net gewijzigd' }),
  ).toBeVisible();
  await page.reload();
  await page.locator('input[name="modus"]').evaluate((veld) => veld.remove());
  await opslaan(page).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Het opslaan is niet gelukt' })).toBeVisible();

  expect(psql(`select count(*) from public.activiteiten where naam = '${naam}';`).trim()).toBe('1');
  expect(psql(`select locatie from public.activiteiten where id = '${id}';`).trim()).toBe('Testlocatie');
});

test('als een ander tussendoor heeft opgeslagen, gaat jouw wijziging niet door en blijft je invoer staan', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const naam = maakNaam('versie');
  await page.goto('/beheer/activiteiten/nieuw');
  await vulIn(page, naam, '2099-03-09');
  await opslaan(page).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);
  await page.getByRole('link', { name: new RegExp(naam) }).click();
  await expect(page.getByLabel('Naam *')).toHaveValue(naam);

  // Een ander bestuurslid slaat net op: de versie gaat omhoog (hier rechtstreeks in de database).
  const id = activiteitId(naam);
  psql(`update public.activiteiten set locatie = 'Door een ander', versie = versie + 1 where id = '${id}';`);

  await page.getByLabel('Locatie *').fill('Mijn wijziging');
  await opslaan(page).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Iemand anders heeft deze activiteit net gewijzigd' }),
  ).toBeVisible();
  await expect(page.getByLabel('Locatie *')).toHaveValue('Mijn wijziging');
  expect(psql(`select locatie from public.activiteiten where id = '${id}';`).trim()).toBe('Door een ander');
});

test('een activiteit die er niet is, bestaat niet', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const respons = await page.goto('/beheer/activiteiten/00000000-0000-4000-8000-000000000000');
  expect(respons?.status()).toBe(404);
  const slecht = await page.goto('/beheer/activiteiten/geen-uuid');
  expect(slecht?.status()).toBe(404);
});

test('een lid zonder beheerrechten komt niet bij het formulier', async ({ page }) => {
  const email = nieuwAdres();
  aangemaakt.push(await maakLidMetRol(email));
  await page.goto(await bevestigAdresVoor(email));
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page).toHaveURL(/\/mijn$/);
  await page.goto('/beheer/activiteiten/nieuw');
  await expect(page).toHaveURL(/\/geen-toegang$/);
});

test('het formulier heeft geen toegankelijkheidsfouten en schuift niet opzij', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const naam = maakNaam('axe');
  await page.goto('/beheer/activiteiten/nieuw');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nieuwe activiteit');
  await opslaan(page).click(); // met foutmeldingen in beeld
  await expect(page.getByLabel('Naam *')).toHaveAttribute('aria-invalid', 'true');
  for (const toestand of ['met fouten', 'ingevuld']) {
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations, toestand).toEqual([]);
    const teBreed = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(teBreed, toestand).toBe(false);
    if (toestand === 'met fouten') {
      await vulIn(page, naam, '2099-03-11');
      await page.getByRole('button', { name: '+ fotograaf-plek' }).click();
      await page.getByRole('checkbox', { name: /Raad van Elf/ }).check();
    }
  }
  // Het bewerkscherm van het concept dat nu bestaat.
  await opslaan(page).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);
  await page.getByRole('link', { name: new RegExp(naam) }).click();
  await expect(page.getByLabel('Naam *')).toHaveValue(naam);
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
  ).toBe(false);
});
