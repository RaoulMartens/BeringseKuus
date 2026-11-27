// Leden toevoegen in de app (UC-013 AF-4 t/m AF-7), met echte gegevens: een nieuw lid (formulier, bevestigen, melding), de uitnodiging opnieuw sturen, het
// e-mailadres corrigeren en meerdere leden uit een Excel-bestand. De regels zelf (wie het mag, elke foutcode, alles of niets) staan in de databasetests
// (leden_toevoegen.test.sql) en dat de Worker het account maakt en de mail stuurt in scripts/taken-uitnodigingen.test.ts; deze test bewijst de schermen,
// de serveracties en de routes ertussen. De taken-Worker draait hier niet: de opdracht staat dus klaar in lid_uitnodigingen.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { lidIdVan, logInAlsBeheerder, maakTestlid, ruimTestledenOp } from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { ruimLidOp } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';
import { maakXlsx } from './xlsx-hulp.ts';

const kenmerk = `T${crypto.randomUUID().slice(0, 7)}`;
const adres = (naam: string) => `${naam}.${kenmerk.toLowerCase()}@example.test`;
const aangemaakt: string[] = [];

test.afterAll(async () => {
  psql(
    `delete from public.wijzigingen_log where rij_id in (select id from public.leden where achternaam = '${kenmerk}');`,
  );
  ruimTestledenOp(kenmerk);
  for (const uid of aangemaakt.splice(0)) {
    psql(`delete from public.wijzigingen_log where rij_id = '${lidIdVan(uid)}';`);
    await ruimLidOp(uid);
  }
});

const wachtOpdrachten = (email: string) =>
  psql(
    `select count(*) from public.lid_uitnodigingen u join public.leden_prive p on p.lid_id = u.lid_id where p.email = '${email}' and u.status = 'wacht';`,
  ).trim();

test('een beheerder voegt een lid toe: formulier, bevestigen, melding en een opdracht voor de Worker', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  await page.goto('/beheer/leden');
  await page.getByRole('link', { name: 'Nieuw lid' }).click();
  await expect(page).toHaveURL(/\/beheer\/leden\/nieuw$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Nieuw lid' })).toBeVisible();

  // Het paneel zegt wat nog nodig is en de knop is uit.
  await expect(page.getByText('Nog niet compleet')).toBeVisible();
  // Op een telefoon is het paneel een balk onderaan zonder uitleg: de tekst staat er wel, maar is verborgen.
  await expect(page.getByText('Nog nodig: voornaam, achternaam, e-mailadres, een groep.')).toBeAttached();
  await expect(page.getByRole('button', { name: 'Lid toevoegen' })).toBeDisabled();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  await page.getByLabel('Voornaam').fill('Piet');
  await page.getByLabel('Achternaam').fill(kenmerk);
  await page.getByLabel('E-mailadres').fill(adres('piet'));
  await page.getByLabel('Dames').check();
  await expect(page.getByText('Klaar om toe te voegen')).toBeVisible();
  await page.getByRole('link', { name: 'Lid toevoegen' }).click();

  // De bevestigingspagina: wat er wordt toegevoegd, en dat er een mail naar het lid gaat.
  await expect(page).toHaveURL(/\/beheer\/leden\/nieuw\/bevestigen$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Lid toevoegen en uitnodigen?' })).toBeVisible();
  await expect(page.getByText(adres('piet'), { exact: true })).toBeVisible();
  await expect(page.getByText('krijgt een mail op')).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  // Annuleren brengt je terug in het ingevulde formulier.
  await page.getByRole('link', { name: 'Annuleren' }).click();
  await expect(page.getByLabel('Voornaam')).toHaveValue('Piet');
  await page.getByRole('link', { name: 'Lid toevoegen' }).click();
  await page.getByRole('button', { name: 'Toevoegen en uitnodigen' }).click();

  await expect(page).toHaveURL(/\/beheer\/leden\?toegevoegd=/);
  await expect(page.getByText(`Piet ${kenmerk} is toegevoegd.`)).toBeVisible();
  const aandacht = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Vraagt aandacht' }) });
  await expect(aandacht).toContainText(`Piet ${kenmerk}`);
  await expect(aandacht).toContainText('uitnodiging wordt verstuurd');
  expect(psql(`select actief || ' ' || type from public.leden where achternaam = '${kenmerk}';`).trim()).toBe(
    'true lid',
  );
  expect(wachtOpdrachten(adres('piet'))).toBe('1');

  // Hetzelfde adres nog een keer: de fout staat op het formulier, met een link naar dat lid.
  await page.goto('/beheer/leden/nieuw');
  await page.getByLabel('Voornaam').fill('Dubbel');
  await page.getByLabel('Achternaam').fill(kenmerk);
  await page.getByLabel('E-mailadres').fill(adres('piet').toUpperCase());
  await page.getByLabel('Dames').check();
  await page.getByRole('link', { name: 'Lid toevoegen' }).click();
  await page.getByRole('button', { name: 'Toevoegen en uitnodigen' }).click();
  await expect(page).toHaveURL(/\/beheer\/leden\/nieuw$/);
  await expect(page.getByRole('alert').filter({ hasText: `hoort al bij Piet ${kenmerk}` })).toBeVisible();
  await expect(page.getByRole('link', { name: `Naar Piet ${kenmerk}` })).toBeVisible();
  expect(psql(`select count(*) from public.leden where voornaam = 'Dubbel';`).trim()).toBe('0');
});

test('een lid dat nog niet is ingelogd: uitnodiging opnieuw sturen en het adres corrigeren', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const lid = maakTestlid('Rick', kenmerk);

  await page.goto(`/beheer/leden/${lid.id}`);
  await expect(page.getByText('Nog niet', { exact: false }).first()).toBeVisible();
  await page.getByRole('link', { name: 'Opnieuw sturen' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: `Uitnodiging opnieuw sturen aan ${lid.naam}?` }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: 'Uitnodiging sturen' }).click();
  await expect(page).toHaveURL(/\/beheer\/leden\?uitgenodigd=/);
  await expect(page.getByText(`${lid.naam} is uitgenodigd.`)).toBeVisible();
  expect(psql(`select count(*) from public.lid_uitnodigingen where lid_id = '${lid.id}';`).trim()).toBe('1');

  // Direct nog een keer kan niet (een dubbele klik).
  await page.goto(`/beheer/leden/${lid.id}/uitnodigen`);
  await page.getByRole('button', { name: 'Uitnodiging sturen' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Er is net al een uitnodiging verstuurd' }),
  ).toBeVisible();

  // Het adres corrigeren: een adres dat niet klopt blijft op de pagina; een goed adres wordt gezet en geeft een nieuwe opdracht.
  await page.goto(`/beheer/leden/${lid.id}/adres`);
  await expect(
    page.getByRole('heading', { level: 1, name: `E-mailadres van ${lid.naam} corrigeren` }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  await page.getByLabel('Nieuw e-mailadres').fill('kapot');
  await page.getByRole('button', { name: 'Adres wijzigen en uitnodigen' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'klopt niet' })).toBeVisible();
  await page.getByLabel('Nieuw e-mailadres').fill(adres('rick'));
  await page.getByRole('button', { name: 'Adres wijzigen en uitnodigen' }).click();
  await expect(page).toHaveURL(/\/beheer\/leden\?uitgenodigd=/);
  expect(psql(`select email from public.leden_prive where lid_id = '${lid.id}';`).trim()).toBe(adres('rick'));
  expect(psql(`select count(*) from public.lid_uitnodigingen where lid_id = '${lid.id}';`).trim()).toBe('2');
});

async function kiesLedenbestand(page: Page, rijen: (string | null)[][]) {
  await page.locator('input[type=file]').setInputFiles({
    name: 'leden.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: maakXlsx(rijen),
  });
}

const KOP = ['voornaam', 'achternaam', 'e-mailadres', 'groepen', 'telefoon'];

test('meerdere leden uit een Excel-bestand: controle met fout, dan alles of niets', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const bestaand = maakTestlid('Bestaand', kenmerk);
  const bestaandAdres = psql(`select email from public.leden_prive where lid_id = '${bestaand.id}';`).trim();

  const sjabloon = await page.request.get('/lid-sjabloon.xlsx');
  expect(sjabloon.ok()).toBe(true);

  await page.goto('/beheer/leden');
  await page.getByRole('link', { name: 'Meerdere leden toevoegen' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Meerdere leden toevoegen' })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  // Een bestand met een fout (adres kapot, een groep die niet bestaat): niets toevoegen.
  await kiesLedenbestand(page, [
    KOP,
    ['Imppiet', kenmerk, adres('importpiet'), 'Dames', '06 12 34 56 78'],
    ['Impmarie', kenmerk, 'kapot', 'Dames', null],
    ['Jan', kenmerk, adres('importjan'), 'Bestaatniet', null],
    ['Bestaand', kenmerk, bestaandAdres, 'Dames', null],
    ['Voorbeeld: Piet', 'Aarts', 'voorbeeld@example.com', 'Dames', null],
  ]);
  await expect(page.getByText('1 voorbeeldregel is overgeslagen.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Regels met een fout (2)' })).toBeVisible();
  await expect(page.getByText('Het e-mailadres klopt niet.')).toBeVisible();
  await expect(page.getByText('De groep “Bestaatniet” bestaat niet.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bestaat al (1)' })).toBeVisible();
  await expect(page.getByRole('button', { name: '1 lid toevoegen en uitnodigen' })).toBeDisabled();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  expect(
    psql(
      `select count(*) from public.leden where voornaam = 'Imppiet' and achternaam = '${kenmerk}';`,
    ).trim(),
  ).toBe('0');

  // Een verbeterd bestand: twee nieuwe leden, het bestaande adres wordt overgeslagen.
  await page.getByRole('button', { name: 'Ander bestand kiezen' }).first().click();
  await kiesLedenbestand(page, [
    KOP,
    ['Imppiet', kenmerk, adres('importpiet'), 'Dames', '06 12 34 56 78'],
    ['Impmarie', kenmerk, adres('importmarie'), 'Dames; Bestuur', null],
    ['Bestaand', kenmerk, bestaandAdres, 'Dames', null],
  ]);
  await expect(page.getByRole('heading', { name: 'Worden toegevoegd (2)' })).toBeVisible();
  await page.getByRole('button', { name: '2 leden toevoegen en uitnodigen' }).click();

  await expect(page).toHaveURL(/\/beheer\/leden\?geimporteerd=2$/);
  await expect(page.getByText('2 leden zijn toegevoegd.')).toBeVisible();
  expect(
    psql(
      `select count(*) from public.leden where voornaam in ('Imppiet', 'Impmarie') and achternaam = '${kenmerk}';`,
    ).trim(),
  ).toBe('2');
  expect(wachtOpdrachten(adres('importpiet'))).toBe('1');
  expect(wachtOpdrachten(adres('importmarie'))).toBe('1');
});

test('zonder inloggen komt niemand bij leden toevoegen', async ({ page }) => {
  for (const pad of ['/beheer/leden/nieuw', '/beheer/leden/nieuw/bevestigen', '/beheer/leden/importeren']) {
    await page.goto(pad);
    await expect(page).not.toHaveURL(new RegExp(`${pad}$`));
  }
});
