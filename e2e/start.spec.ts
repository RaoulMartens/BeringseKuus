import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { headersVasteBestanden } from '../src/lib/beveiligingsheaders.ts';
import { WCAG } from './normen.ts';

test.describe('startpagina', () => {
  test('is semantisch opgebouwd', async ({ page }) => {
    const antwoord = await page.goto('/');
    expect(antwoord?.status()).toBe(200);
    await expect(page).toHaveTitle('Ledenplatform');
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

  test('is met het toetsenbord te bereiken, met een zichtbare focus', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const link = page.getByRole('link', { name: 'Ledenplatform' });
    await expect(link).toBeFocused();
    // toBeFocused zegt niets over zichtbaarheid (review PR1-08): controleer ook de focusrand zelf.
    const rand = await link.evaluate((element) => {
      const stijl = getComputedStyle(element);
      return { soort: stijl.outlineStyle, breedte: Number.parseFloat(stijl.outlineWidth) };
    });
    expect(rand.soort).not.toBe('none');
    expect(rand.breedte).toBeGreaterThanOrEqual(2);
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

  // Vaste bestanden serveert Cloudflare zonder de Worker; de headers uit next.config.ts komen daar niet mee
  // (review PR8-04). Ze krijgen hun eigen set uit public/_headers.
  test('stuurt de eigen beveiligingsheaders van vaste bestanden mee', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const pad = /["'](\/_next\/static\/[^"']+\.js)["']/.exec(html)?.[1];
    expect(pad).toBeDefined();
    const antwoord = await request.get(pad ?? '');
    expect(antwoord.status()).toBe(200);
    const headers = antwoord.headers();
    for (const { key, value } of headersVasteBestanden()) {
      expect(headers[key.toLowerCase()], key).toBe(value);
    }
  });
});
