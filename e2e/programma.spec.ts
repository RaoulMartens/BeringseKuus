// Het scherm Programma met echte gegevens (tegen de lokale Supabase): wat een lid en een beheerder te zien krijgen komt
// uit de rechten van de database (RLS, R15, R22), niet uit een filter op de pagina. De tests bewijzen dat de pagina geen
// concept en geen activiteit voor een andere groep toont aan een lid, en dat een beheerder met een code alles ziet.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { psql } from './database-hulp.ts';
import { nieuwAdres } from './inloggen-hulp.ts';
import { bevestigAdresVoor, logInZonderBrowser, maakLidMetRol, ruimLidOp, schrijfAppIn } from './mfa-hulp.ts';
import { WCAG, wachtTotStil } from './normen.ts';
import { totpCode } from './totp.ts';

const lopende = crypto.randomUUID().slice(0, 8);
const naam = (soort: string): string => `E2E ${soort} ${lopende}`;

const aangemaakt: string[] = [];
test.beforeAll(() => {
  // Gepubliceerd heeft tijden en een locatie nodig (R21); een concept alleen een naam en een datum. Eén activiteit is alleen
  // voor de groep Bestuur (R22), één ligt al in het verleden.
  psql(`
    insert into public.activiteiten (naam, datum, starttijd, eindtijd, locatie, status) values
      ('${naam('komend')}', current_date + 5, '18:30', '23:00', 'Testlocatie', 'gepubliceerd'),
      ('${naam('geweest')}', current_date - 5, '20:00', '23:00', 'Testlocatie', 'gepubliceerd'),
      ('${naam('bestuur')}', current_date + 6, '20:00', '23:00', 'Testlocatie', 'gepubliceerd'),
      ('${naam('concept')}', current_date + 7, null, null, null, 'concept');
    insert into public.activiteit_groep (activiteit_id, groep_id)
      select a.id, g.id from public.activiteiten a, public.groepen g
       where a.naam = '${naam('bestuur')}' and g.naam = 'Bestuur';
  `);
});

test.afterAll(async () => {
  // De database laat een gepubliceerde activiteit niet verwijderen (R: annuleren, niet wissen). Voor de opruimactie na de test
  // staan de triggers even uit; de rijen die eraan hangen gaan dan zelf weg, want de sleutels worden dan niet meer gecontroleerd.
  psql(`
    begin;
    set local session_replication_role = replica;
    delete from public.activiteit_groep where activiteit_id in (select id from public.activiteiten where naam like 'E2E % ${lopende}');
    delete from public.activiteiten where naam like 'E2E % ${lopende}';
    commit;
  `);
  for (const uid of aangemaakt.splice(0)) await ruimLidOp(uid);
});

async function logInAlsLid(page: Page): Promise<void> {
  const email = nieuwAdres();
  aangemaakt.push(await maakLidMetRol(email));
  await page.goto(await bevestigAdresVoor(email));
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page).toHaveURL(/\/mijn$/);
}

/** Een beheerder met een app, in de browser ingelogd en met de code bevestigd (aal2). */
async function logInAlsBeheerder(page: Page): Promise<void> {
  const email = nieuwAdres();
  aangemaakt.push(await maakLidMetRol(email, "timestamptz '2099-01-01'"));
  const { geheim } = await schrijfAppIn(await logInZonderBrowser(email));
  await page.goto(await bevestigAdresVoor(email));
  await page.getByRole('button', { name: 'Inloggen' }).click();
  await expect(page).toHaveURL(/\/mijn$/);
  await page.goto('/beheer');
  await expect(page).toHaveURL(/\/mfa\/code$/);
  await page.getByLabel('Code uit de app').fill(totpCode(geheim));
  await page.getByRole('button', { name: 'Verder naar beheer' }).click();
  await expect(page).toHaveURL(/\/beheer$/);
}

test('zonder in te loggen gaat het programma naar het inloggen', async ({ page }) => {
  await page.goto('/programma');
  await expect(page).toHaveURL(/\/inloggen$/);
});

test('een lid ziet gepubliceerde activiteiten, geen concept en niets voor een andere groep', async ({
  page,
}) => {
  await logInAlsLid(page);
  await page.goto('/programma');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Vastelaovend');
  await expect(page.getByText(naam('komend'))).toBeVisible();
  await expect(page.getByText(naam('geweest'))).toBeVisible();
  await expect(page.getByText(naam('concept'))).toHaveCount(0);
  await expect(page.getByText(naam('bestuur'))).toHaveCount(0);

  // De rij toont tijd en plaats; het geweest-deel heeft zijn eigen kop.
  const rij = page.getByRole('listitem').filter({ hasText: naam('komend') });
  await expect(rij).toContainText('18:30 · Testlocatie');
  // Een rij loopt niet over de hele pagina: de hoofdkolom is hooguit 680 px (ontwerpregel: geen volle breedte).
  expect((await rij.boundingBox())?.width ?? Infinity).toBeLessThanOrEqual(680);
  await expect(page.getByRole('heading', { level: 2, name: 'Geweest dit seizoen' })).toBeVisible();

  // De bovenbalk: het menu van een lid heeft geen Beheer, en het rondje noemt de naam.
  await expect(
    page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link', { name: 'Programma' }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link', { name: 'Beheer' }),
  ).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Mijn account \(/ })).toBeVisible();
});

test('een beheerder met een code ziet ook het concept en de activiteit voor het bestuur', async ({
  page,
}) => {
  await logInAlsBeheerder(page);

  // Na de code staat de beheerder op Beheer, met de bovenbalk: van daaruit is het programma te bereiken zonder een adres te typen.
  await expect(page.getByRole('heading', { level: 1, name: 'Beheer' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link', { name: 'Programma' }).click();
  await expect(page).toHaveURL(/\/programma$/);

  await expect(page.getByText(naam('komend'))).toBeVisible();
  const concept = page.getByRole('listitem').filter({ hasText: naam('concept') });
  await expect(concept).toContainText('Concept');
  await expect(page.getByText(naam('bestuur'))).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link', { name: 'Beheer' }),
  ).toBeVisible();

  // Het programma met een conceptlabel, en Beheer zelf (review F1-16): geen toegankelijkheidsfouten, niets opzij.
  await wachtTotStil(page);
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  await page.getByRole('navigation', { name: 'Hoofdmenu' }).getByRole('link', { name: 'Beheer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Beheer' })).toBeVisible();
  await wachtTotStil(page);
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  const teBreed = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(teBreed).toBe(false);
});

test('het programma heeft geen toegankelijkheidsfouten en schuift niet opzij', async ({ page }) => {
  await logInAlsLid(page);
  await page.goto('/programma');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  const teBreed = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(teBreed).toBe(false);
});
