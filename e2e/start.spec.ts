import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Normen uit bouwgids 14.3: WCAG 2.2 niveau AA. axe vindt niet alles; het toetsenbord en de telefoon worden per
// fase ook met de hand doorlopen.
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('startpagina', () => {
  test('is semantisch opgebouwd', async ({ page }) => {
    const antwoord = await page.goto('/');
    expect(antwoord?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('header')).toHaveCount(1);
    await expect(page.locator('nav')).toHaveCount(1);
    await expect(page.locator('main')).toHaveCount(1);
  });

  test('heeft geen toegankelijkheidsfouten volgens axe', async ({ page }) => {
    await page.goto('/');
    const resultaat = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(resultaat.violations).toEqual([]);
  });

  test('schuift niet opzij', async ({ page }) => {
    await page.goto('/');
    const teBreed = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(teBreed).toBe(false);
  });

  test('is met het toetsenbord te bereiken', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Ledenplatform' })).toBeFocused();
  });

  test('stuurt de beveiligingsheaders mee', async ({ request }) => {
    const antwoord = await request.get('/');
    const headers = antwoord.headers();
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['x-powered-by']).toBeUndefined();
  });
});
