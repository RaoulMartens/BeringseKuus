// Een concept publiceren (UC-004 stap 10), met echte gegevens: de knop in het statuspaneel bewaart het concept en gaat naar een
// eigen bevestigingspagina; Annuleren wijzigt niets, Publiceren maakt de activiteit zichtbaar. Zonder eindtijd of
// eindverantwoordelijke met telefoonnummer kan het niet (R21), en een activiteit die een ander net wijzigde, publiceer je niet
// ongemerkt. De controles zelf staan in public.activiteit_opslaan; deze tests bewijzen formulier, serveractie en rechten.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { logInAlsBeheerder, maakTestlid, ruimActiviteitenOp, ruimTestledenOp } from './beheer-hulp.ts';
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
async function maakConcept(page: Page, naam: string, opties: { eindtijd: boolean; telefoon: boolean }) {
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
