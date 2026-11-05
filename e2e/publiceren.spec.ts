// Een concept publiceren (UC-004 stap 10), met echte gegevens: de knop in het statuspaneel bewaart het concept en gaat naar een
// eigen bevestigingspagina; Annuleren wijzigt niets, Publiceren maakt de activiteit zichtbaar. Zonder eindtijd of
// eindverantwoordelijke met telefoonnummer kan het niet (R21), en een activiteit die een ander net wijzigde, publiceer je niet
// ongemerkt. De controles zelf staan in public.activiteit_opslaan; deze tests bewijzen formulier, serveractie en rechten.
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
import { ruimLidOp } from './mfa-hulp.ts';
import { WCAG } from './normen.ts';

const kenmerk = `T${crypto.randomUUID().slice(0, 7)}`;
let reeks = 0;
function maakNaam(soort: string): string {
  reeks += 1;
  return `E2E Publiceren ${soort} ${reeks} ${kenmerk}`;
}

const aangemaakt: string[] = [];

test.afterAll(async () => {
  ruimActiviteitenOp(`E2E Publiceren % ${kenmerk}`);
  psql(`delete from public.groepen where naam like 'E2E Publiceren groep % ${kenmerk}';`);
  psql(`delete from public.wijzigingen_log where omschrijving like '%E2E Publiceren % ${kenmerk}%';`);
  ruimTestledenOp(kenmerk);
  for (const uid of aangemaakt.splice(0)) await ruimLidOp(uid);
});

function activiteitId(naam: string): string {
  return psql(`select id from public.activiteiten where naam = '${naam}';`).trim();
}

function status(id: string): string {
  return psql(`select status from public.activiteiten where id = '${id}';`).trim();
}

/** Een nieuw concept met alles wat publiceren eist, behalve (naar keuze) de eindtijd; bewaard via "Opslaan als concept". */
async function maakConcept(
  page: Page,
  naam: string,
  opties: { eindtijd: boolean; telefoon: boolean; groep?: { id: string; naam: string } },
) {
  const ger = maakTestlid(`Ger${reeks}`, kenmerk, {
    magEindverantwoordelijke: true,
    ...(opties.telefoon ? { telefoon: '06 12 34 56 78' } : {}),
  });
  await page.goto('/beheer/activiteiten/nieuw');
  await page.getByLabel('Naam *').fill(naam);
  await page.getByLabel('Datum *').fill('2099-05-05');
  await page.getByLabel('Starttijd *').fill('20:00');
  if (opties.eindtijd) await page.getByLabel('Eindtijd *').fill('23:00');
  await page.getByLabel('Locatie *').fill('De Wieksjlaag');
  await page.getByLabel('Eindverantwoordelijke', { exact: true }).selectOption({ label: ger.naam });
  if (opties.groep) {
    // Wie op een plek staat, moet in de doelgroep zitten (R22): de eindverantwoordelijke dus ook.
    psql(`insert into public.lid_groep (lid_id, groep_id) values ('${ger.id}', '${opties.groep.id}');`);
    await page.getByRole('checkbox', { name: new RegExp(opties.groep.naam) }).check();
  }
  await page.getByRole('button', { name: 'Opslaan als concept' }).click();
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);
  await page.getByRole('link', { name: new RegExp(naam) }).click();
  return { ger, id: activiteitId(naam) };
}

test('Publiceren vraagt eerst een bevestiging; Annuleren laat het concept staan, Publiceren maakt hem zichtbaar', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const naam = maakNaam('stappen');
  const { id } = await maakConcept(page, naam, { eindtijd: true, telefoon: true });
  await expect(page.getByRole('button', { name: 'Publiceren' })).toBeVisible();

  // Het concept wordt bewaard en daarna volgt de bevestiging als eigen pagina, met de vraag als titel.
  await page.getByRole('button', { name: 'Publiceren' }).click();
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}/publiceren$`));
  await expect(page.getByRole('heading', { level: 1, name: `${naam} publiceren?` })).toBeVisible();
  await expect(page.getByText(/Zichtbaar voor: Alle \d+ actieve leden/)).toBeVisible();
  await expect(page.getByText(/Eindverantwoordelijke: Ger\d+ .*, 06 12 34 56 78/)).toBeVisible();
  await expect(page.getByText('Terugzetten naar concept kan hierna niet meer.')).toBeVisible();
  // Zonder doelgroep ziet iedereen de activiteit, de beheerder ook: dan geen waarschuwing.
  await expect(page.getByText(/Jij zit zelf niet in/)).toHaveCount(0);
  // Er is niemand een bericht beloofd: dat gaat in deze versie nog niet uit.
  await expect(page.getByText('Berichten naar leden gaan in deze versie nog niet uit.')).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
  ).toBe(false);

  // Annuleren: terug naar de activiteit, nog steeds een concept.
  await page.getByRole('link', { name: 'Annuleren' }).click();
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}$`));
  expect(status(id)).toBe('concept');

  // Publiceren: naar het overzicht met een melding; de status is gepubliceerd en het staat in het log.
  await page.getByRole('button', { name: 'Publiceren' }).click();
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}/publiceren$`));
  await page.getByRole('button', { name: 'Publiceren' }).click();
  await expect(page).toHaveURL(/\/beheer\?gepubliceerd=/);
  await expect(page.getByText(`${naam} is gepubliceerd.`)).toBeVisible();
  expect(status(id)).toBe('gepubliceerd');
  expect(
    psql(
      `select count(*) from public.wijzigingen_log where actie = 'activiteit_gepubliceerd' and rij_id = '${id}';`,
    ).trim(),
  ).toBe('1');

  // Een gepubliceerde activiteit heeft geen bevestiging meer: de pagina stuurt terug naar de activiteit.
  await page.goto(`/beheer/activiteiten/${id}/publiceren`);
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}$`));
});

test('zonder eindtijd of telefoonnummer kan de bevestiging niet worden gegeven', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const naam = maakNaam('onvolledig');
  const { id } = await maakConcept(page, naam, { eindtijd: false, telefoon: false });

  await page.getByRole('button', { name: 'Publiceren' }).click();
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}/publiceren$`));
  await expect(page.getByText('Publiceren kan nog niet.')).toBeVisible();
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: /^Eindtijd$/ })
      .first(),
  ).toBeVisible();
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: /^Telefoonnummer van de eindverantwoordelijke$/ })
      .first(),
  ).toBeVisible();
  // Er is geen knop om te publiceren, alleen een weg terug.
  await expect(page.getByRole('button', { name: 'Publiceren' })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  await page.getByRole('link', { name: 'Terug naar de activiteit' }).last().click();
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}$`));
  expect(status(id)).toBe('concept');
});

test('een activiteit die een ander net wijzigde, wordt niet ongemerkt gepubliceerd', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const naam = maakNaam('verouderd');
  const { id } = await maakConcept(page, naam, { eindtijd: true, telefoon: true });

  await page.getByRole('button', { name: 'Publiceren' }).click();
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}/publiceren$`));

  // Een andere beheerder wijzigt het concept terwijl de bevestiging openstaat.
  psql(`update public.activiteiten set versie = versie + 1 where id = '${id}';`);

  await page.getByRole('button', { name: 'Publiceren' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Iemand anders' })).toContainText(
    'Iemand anders heeft deze activiteit net gewijzigd',
  );
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}/publiceren$`));
  expect(status(id)).toBe('concept');
});

test('Enter in een veld slaat op als concept en gaat niet naar de bevestiging van het publiceren', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const naam = maakNaam('enter');
  await page.goto('/beheer/activiteiten/nieuw');
  await page.getByLabel('Naam *').fill(naam);
  await page.getByLabel('Datum *').fill('2099-05-06');
  await page.getByLabel('Naam *').press('Enter');
  await expect(page).toHaveURL(/\/beheer\?opgeslagen=/);
  expect(status(activiteitId(naam))).toBe('concept');
  // De standaardknop voor Enter is geen tabstop en wordt niet voorgelezen.
  await page.goto('/beheer/activiteiten/nieuw');
  await expect(page.locator('form button[aria-hidden=true]')).toHaveAttribute('tabindex', '-1');
});

/** Een eigen groep voor deze test (ruimt afterAll op), zodat de activiteit niet bij andere tests zichtbaar wordt. */
function maakGroep(): { id: string; naam: string } {
  reeks += 1;
  const naam = `E2E Publiceren groep ${reeks} ${kenmerk}`;
  const id = crypto.randomUUID();
  psql(`insert into public.groepen (id, naam, volgorde) values ('${id}', '${naam}', ${900 + reeks});`);
  return { id, naam };
}

test('publiceren voor een groep waar de beheerder zelf niet in zit: de pagina zegt dat vooraf en erna, en biedt geen dode link', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const groep = maakGroep();
  const naam = maakNaam('buitengroep');
  const { id } = await maakConcept(page, naam, { eindtijd: true, telefoon: true, groep });
  const tekst = `Jij zit zelf niet in ${groep.naam}, dus je ziet deze activiteit zelf niet op Start of Programma.`;

  // Vooraf: op de bevestiging, als hint en niet als blokkade.
  await page.getByRole('button', { name: 'Publiceren' }).click();
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}/publiceren$`));
  await expect(page.getByText(tekst)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publiceren' })).toBeEnabled();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  // Erna: in het overzicht staat het naast de melding dat het gepubliceerd is.
  await page.getByRole('button', { name: 'Publiceren' }).click();
  await expect(page).toHaveURL(/\/beheer\?gepubliceerd=/);
  await expect(page.getByText(`${naam} is gepubliceerd.`)).toBeVisible();
  await expect(page.getByText(tekst)).toBeVisible();

  // Op de activiteit zelf: dezelfde uitleg, en geen link "Zo zien leden het" naar een scherm dat voor hem dicht is.
  await page.goto(`/beheer/activiteiten/${id}`);
  await expect(page.getByText(tekst)).toBeVisible();
  await expect(page.locator('a', { hasText: 'Zo zien leden het' })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
});

test('zit de beheerder zelf wel in de groep, dan geen waarschuwing en blijft "Zo zien leden het"', async ({
  page,
}) => {
  const uid = await logInAlsBeheerder(page);
  aangemaakt.push(uid);
  const groep = maakGroep();
  psql(`insert into public.lid_groep (lid_id, groep_id) values ('${lidIdVan(uid)}', '${groep.id}');`);
  const naam = maakNaam('ingroep');
  const { id } = await maakConcept(page, naam, { eindtijd: true, telefoon: true, groep });

  await page.getByRole('button', { name: 'Publiceren' }).click();
  await expect(page).toHaveURL(new RegExp(`/beheer/activiteiten/${id}/publiceren$`));
  await expect(page.getByText(/Jij zit zelf niet in/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Publiceren' }).click();
  await expect(page).toHaveURL(/\/beheer\?gepubliceerd=/);
  await expect(page.getByText(`${naam} is gepubliceerd.`)).toBeVisible();
  await expect(page.getByText(/Jij zit zelf niet in/)).toHaveCount(0);

  await page.goto(`/beheer/activiteiten/${id}`);
  await expect(page.getByText(/Jij zit zelf niet in/)).toHaveCount(0);
  // Op een telefoon staat de link niet in de balk onderaan; hij staat dan wel in het scherm maar is verborgen (Statuspaneel).
  await expect(page.locator('a', { hasText: 'Zo zien leden het' })).toHaveCount(1);
});
