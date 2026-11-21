// "Wie is aan de beurt?" (UC-012, FO 9.2, bouwgids 8.2), met echte gegevens: het raster van alle leden met hun aantal diensten, de
// snelkeuze bij een lege plek en de groep "Nog niet aan de beurt" in de keuzelijst. De telregels zelf staan in src/lib/verdeling.test.ts;
// deze tests bewijzen de pagina, de leesroute en het formulier. Elk seizoen van het raster ligt ver in de toekomst en elke schermbreedte
// heeft er een eigen, zodat de twee tests die tegelijk draaien elkaars activiteiten niet zien.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

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
const aangemaakt: string[] = [];

/** Het beginjaar van het seizoen van deze schermbreedte. */
const seizoenVan = (project: string): number => (project === 'telefoon' ? 2068 : 2088);

test.afterAll(async () => {
  ruimActiviteitenOp(`E2E Verdeling % ${kenmerk}`);
  ruimTestledenOp(kenmerk);
  for (const uid of aangemaakt.splice(0)) await ruimLidOp(uid);
});

function maakActiviteit(
  naam: string,
  datum: string,
  opties: { status?: string; type?: string } = {},
): string {
  return psql(`
    insert into public.activiteiten (naam, datum, starttijd, eindtijd, locatie, status, type)
    values ('${naam}', '${datum}', '20:00', '23:00', 'Zaal', '${opties.status ?? 'gepubliceerd'}', '${opties.type ?? 'seizoen'}')
    returning id;
  `)
    .trim()
    .split('\n')[0]!;
}

function plek(activiteit: string, rol: string, lid: string): void {
  psql(
    `insert into public.rol_slots (activiteit_id, rol_type, bezetter_id) values ('${activiteit}', '${rol}', '${lid}');`,
  );
}

test('het raster toont alle leden met hun aantal diensten, de minste eerst', async ({ page }, info) => {
  const j = seizoenVan(info.project.name);
  aangemaakt.push(await logInAlsBeheerder(page));
  const nog = maakTestlid('NogNiet', kenmerk);
  const vaak = maakTestlid('Vaak', kenmerk);
  const geannuleerd = maakTestlid('Geannuleerd', kenmerk);
  const extern = maakTestlid('Helper', kenmerk, { extern: true });

  // Binnen het seizoen: Vaak is twee keer tapper (één gepubliceerd, één concept) en één keer bij oud papier; de bak telt niet mee.
  const een = maakActiviteit(`E2E Verdeling een ${kenmerk}`, `${j + 1}-02-05`);
  const twee = maakActiviteit(`E2E Verdeling twee ${kenmerk}`, `${j + 1}-02-06`, { status: 'concept' });
  const papier = maakActiviteit(`E2E Verdeling papier ${kenmerk}`, `${j + 1}-03-05`, { type: 'oud_papier' });
  const weg = maakActiviteit(`E2E Verdeling weg ${kenmerk}`, `${j + 1}-02-07`, { status: 'geannuleerd' });
  plek(een, 'tapper', vaak.id);
  plek(twee, 'tapper', vaak.id);
  plek(papier, 'werker', vaak.id);
  plek(weg, 'tapper', geannuleerd.id);
  plek(een, 'werker', extern.id);
  psql(`insert into public.rol_slots (activiteit_id, rol_type, bezetter_id, plek_label, volgorde)
        values ('${een}', 'bak', '${nog.id}', 'raadslid', 101);`);

  await page.goto(`/beheer/verdeling?seizoen=${j}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Wie is aan de beurt?' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Terug naar activiteiten' })).toBeVisible();
  await expect(page.getByText(`Vastelaovend ${j}/${j + 1}`)).toBeVisible();

  const raster = page.getByRole('region', { name: 'Alle leden en hun diensten dit seizoen' });
  // Geen dienst: de bak telt niet, een geannuleerde activiteit telt niet.
  const nogLid = raster.getByRole('listitem', { name: `${nog.naam}, nog geen dienst dit seizoen` });
  const weggeLid = raster.getByRole('listitem', { name: `${geannuleerd.naam}, nog geen dienst dit seizoen` });
  await expect(nogLid).toBeVisible();
  await expect(weggeLid).toBeVisible();
  // Wel diensten: gewoon programma, concept en oud papier tellen mee, met het getal op het bolletje.
  const vaakLid = raster.getByRole('listitem', { name: `${vaak.naam}, 3 diensten dit seizoen` });
  await expect(vaakLid).toBeVisible();
  await expect(vaakLid).toContainText('3');
  // De naam met het aantal staat bij het bolletje (hover, focus en tikken).
  await expect(vaakLid).toHaveAttribute('data-naam', `${vaak.naam} · 3 diensten dit seizoen`);
  // De minste diensten eerst.
  const namen = await raster
    .getByRole('listitem')
    .evaluateAll((items) => items.map((i) => i.getAttribute('aria-label') ?? ''));
  expect(namen.findIndex((n) => n.startsWith(nog.naam))).toBeLessThan(
    namen.findIndex((n) => n.startsWith(vaak.naam)),
  );
  // Een externe helper staat er niet in.
  await expect(page.getByText(extern.naam)).toHaveCount(0);
  await expect(raster.getByRole('listitem', { name: new RegExp(extern.naam) })).toHaveCount(0);

  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('de snelkeuze zet iemand die nog niet aan de beurt is geweest op de lege plek', async ({ page }) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  maakTestlid('Snel', kenmerk);

  await page.goto('/beheer/activiteiten/nieuw');
  await voegPlekToe(page, 'tapper');
  const veld = page.getByLabel('Nieuwe plek 1 van tapper', { exact: true });
  const knoppen = page.getByRole('button', { name: /op nieuwe plek 1 van tapper zetten/ });
  await expect(knoppen.first()).toBeVisible();
  expect(await knoppen.count()).toBeLessThanOrEqual(5);

  // De link naar alle leden opent in een nieuw tabblad: wat nog niet is opgeslagen blijft staan.
  const alle = page.getByRole('link', { name: /Alle leden bekijken/ });
  await expect(alle).toHaveAttribute('href', '/beheer/verdeling');
  await expect(alle).toHaveAttribute('target', '_blank');

  const label = (await knoppen.first().getAttribute('aria-label')) ?? '';
  const naam = label.slice(0, label.indexOf(' op nieuwe plek'));
  expect(naam).not.toBe('');
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  await knoppen.first().click();
  // De naam staat nu in de keuzelijst van de plek; de plek is niet meer leeg, dus de snelkeuze is weg.
  await expect(veld.locator('option:checked')).toContainText(naam.split(' ')[0] ?? naam);
  await expect(knoppen).toHaveCount(0);
});

test('de keuzelijst zet wie nog niet aan de beurt is geweest bovenaan in een eigen groep', async ({
  page,
}) => {
  aangemaakt.push(await logInAlsBeheerder(page));
  const lid = maakTestlid('Groep', kenmerk);

  await page.goto('/beheer/activiteiten/nieuw');
  await voegPlekToe(page, 'tapper');
  const veld = page.getByLabel('Nieuwe plek 1 van tapper', { exact: true });
  // De groep bestaat en bevat het lid zonder dienst; kiezen kan gewoon op naam.
  await expect(
    veld.locator('optgroup[label="Nog niet aan de beurt"] option', { hasText: lid.naam }),
  ).toHaveCount(1);
  await veld.selectOption({ label: lid.naam });
  await expect(veld.locator('option:checked')).toHaveText(lid.naam);
});
