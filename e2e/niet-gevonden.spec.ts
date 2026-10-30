import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { WCAG } from './normen.ts';

// De pagina voor een adres dat niet bestaat (wireframe niet-gevonden). De foutpagina (error.tsx) is alleen met een echte
// fout in een pagina te zien; die is niet te veroorzaken zonder de code te vervuilen, dus daarvoor geldt de build en de
// controle van de bovenbalk (Kader) op de andere schermen.
test.describe('een adres dat niet bestaat', () => {
  test('geeft een 404 met een duidelijke tekst en een weg terug', async ({ page }) => {
    const antwoord = await page.goto('/bestaat-niet');
    expect(antwoord?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Deze pagina bestaat niet');
    await expect(page.getByRole('link', { name: 'Naar start' })).toHaveAttribute('href', '/');
    await expect(page.getByRole('link', { name: 'Naar het programma' })).toHaveAttribute(
      'href',
      '/programma',
    );
  });

  test('heeft geen toegankelijkheidsfouten en schuift niet opzij', async ({ page }) => {
    await page.goto('/bestaat-niet');
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
    const teBreed = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(teBreed).toBe(false);
  });
});
