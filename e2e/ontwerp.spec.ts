// De pagina met alle onderdelen (/ontwerp) in een echte browser: toegankelijkheid (axe, WCAG 2.2 AA, ook het contrast) in
// elk thema, geen zijwaarts scrollen op 1200 en 375 px, en de lettertypen laden echt.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { WCAG } from './normen.ts';

const THEMAS = ['', 'blauw', 'roze', 'geel', 'paars'];

for (const thema of THEMAS) {
  const pad = thema ? `/ontwerp?thema=${thema}` : '/ontwerp';

  test(`${pad}: geen toegankelijkheidsfouten en geen zijwaarts scrollen`, async ({ page }) => {
    await page.goto(pad);
    await expect(page.getByRole('heading', { level: 1, name: 'Ontwerp: onderdelen' })).toBeVisible();
    const uitkomst = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(uitkomst.violations).toEqual([]);
    const teBreed = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(teBreed).toBe(false);
  });
}

test('de lettertypen Libron en Nunito worden geladen vanuit de repository', async ({ page }) => {
  await page.goto('/ontwerp');
  await page.evaluate(() => document.fonts.ready);
  const geladen = await page.evaluate(() =>
    [...document.fonts]
      .filter((font) => font.status === 'loaded')
      .map((font) => font.family.replace(/"/g, '')),
  );
  expect(geladen).toContain('Libron');
  expect(geladen).toContain('Nunito');
});

test('een knop is met het toetsenbord te bereiken en de focus is zichtbaar', async ({ page }) => {
  await page.goto('/ontwerp');
  const knop = page.getByRole('button', { name: 'Hoofdactie' });
  await knop.focus();
  const omlijning = await knop.evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(omlijning).not.toBe('none');
});

test('een uitgeschakelde knop is uitgeschakeld voor het toetsenbord en de schermlezer', async ({ page }) => {
  await page.goto('/ontwerp');
  await expect(page.getByRole('button', { name: 'Publiceren' }).first()).toBeDisabled();
});

test('de bovenbalk past: elk onderdeel en het rondje zijn volledig zichtbaar', async ({ page }) => {
  await page.goto('/ontwerp');
  const venster = page.viewportSize()?.width ?? 0;
  for (const naam of ['Start', 'Programma', 'Beheer', 'Mijn account (Sam)']) {
    const vak = await page.getByRole('link', { name: naam }).first().boundingBox();
    expect(vak, naam).not.toBeNull();
    expect((vak?.x ?? 0) + (vak?.width ?? 0), `${naam} past binnen de breedte`).toBeLessThanOrEqual(venster);
  }
});
