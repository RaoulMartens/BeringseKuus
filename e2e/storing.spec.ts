import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { WCAG } from './normen.ts';

// Het scherm als Supabase niet antwoordt (wireframe storing). Het zegt dat je niet bent uitgelogd en stuurt nooit naar
// inloggen. De beslissing "storing of niet ingelogd" is met unit-tests vastgelegd (src/lib/supabase/sessie-uitkomst.test.ts); hier
// het scherm zelf.
test.describe('storing', () => {
  test('zegt dat het niet aan het lid ligt en dat hij niet is uitgelogd', async ({ page }) => {
    const antwoord = await page.goto('/storing');
    expect(antwoord?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('We kunnen nu niet bij de gegevens');
    await expect(page.getByRole('main')).toContainText('je bent niet uitgelogd');
    await expect(page.getByRole('main')).toContainText('Je hoeft niet opnieuw in te loggen.');
    await expect(page.getByRole('link', { name: 'Probeer opnieuw' })).toHaveAttribute('href', '/');
    await expect(page.getByRole('link', { name: 'Inloggen' })).toHaveCount(0);
  });

  test('heeft geen toegankelijkheidsfouten en schuift niet opzij', async ({ page }) => {
    await page.goto('/storing');
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
    const teBreed = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(teBreed).toBe(false);
  });
});
