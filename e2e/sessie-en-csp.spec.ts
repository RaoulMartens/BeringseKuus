// Proefroute 2 (Fase-0-plan 4): wat alleen de middleware (src/middleware.ts) kan, getest op de Worker in workerd.
//
// 1. De sessie verversen bij een gewone paginaweergave. Een Server Component kan geen cookies zetten; zonder dit
//    blijft een verlopen sessie in de browser staan en is het lid na een uur zonder actie uitgelogd.
// 2. Een CSP met een nonce per aanvraag, zonder 'unsafe-inline' voor scripts (bouwgids 14.4).
import { type BrowserContext, type Cookie, expect, test } from '@playwright/test';

import { ingelogdLid, ruimLedenOp } from './inloggen-hulp.ts';

test.afterAll(ruimLedenOp);

const SESSIECOOKIE = /^(sb-.+-auth-token)(?:\.(\d+))?$/;

/** De sessiecookie van Supabase, die in stukken (.0, .1, …) kan zijn opgedeeld. */
function sessiecookies(cookies: Cookie[]): { naam: string; stukken: Cookie[] } {
  const stukken = cookies
    .filter((c) => SESSIECOOKIE.test(c.name))
    .sort(
      (a, b) => Number(SESSIECOOKIE.exec(a.name)?.[2] ?? 0) - Number(SESSIECOOKIE.exec(b.name)?.[2] ?? 0),
    );
  const naam = SESSIECOOKIE.exec(stukken[0]?.name ?? '')?.[1];
  if (!naam) throw new Error('geen sessiecookie van Supabase gevonden');
  return { naam, stukken };
}

/** Zet de vervaltijd van de sessie in de cookie in het verleden, zoals na een uur zonder actie. */
async function laatSessieVerlopen(context: BrowserContext): Promise<string> {
  const { naam, stukken } = sessiecookies(await context.cookies());
  const eerste = stukken[0];
  if (!eerste) throw new Error('geen sessiecookie');
  const waarde = stukken.map((c) => c.value).join('');
  const inhoud: unknown = JSON.parse(
    Buffer.from(waarde.replace(/^base64-/, ''), 'base64url').toString('utf8'),
  );
  if (typeof inhoud !== 'object' || inhoud === null || !('expires_at' in inhoud))
    throw new Error('onverwachte inhoud van de sessiecookie');
  const verlopen = { ...inhoud, expires_at: Math.floor(Date.now() / 1000) - 60 };
  for (const stuk of stukken) await context.clearCookies({ name: stuk.name });
  await context.addCookies([
    {
      ...eerste,
      name: naam,
      value: `base64-${Buffer.from(JSON.stringify(verlopen)).toString('base64url')}`,
    },
  ]);
  return naam;
}

test.describe('sessie verversen (middleware)', () => {
  test('een verlopen sessie wordt bij het openen van een pagina ververst', async ({ page, context }) => {
    await ingelogdLid(page);
    const naam = await laatSessieVerlopen(context);

    const antwoord = await page.request.get('/mijn', { maxRedirects: 0 });
    expect(antwoord.status()).toBe(200);
    const nieuw = antwoord
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie' && h.value.startsWith(naam));
    expect(nieuw.length, 'de nieuwe sessie komt in een cookie terug').toBeGreaterThan(0);

    // En daarna blijft het lid gewoon ingelogd.
    await page.goto('/mijn');
    await expect(page).toHaveURL(/\/mijn$/);
  });
});

/** De richtlijn script-src uit een CSP. */
const scriptSrc = (csp: string): string =>
  csp
    .split(';')
    .map((richtlijn) => richtlijn.trim())
    .find((richtlijn) => richtlijn.startsWith('script-src ')) ?? '';

test.describe('CSP met een nonce (middleware)', () => {
  for (const pad of ['/', '/inloggen']) {
    test(`${pad}: een eigen nonce per aanvraag, zonder 'unsafe-inline' voor scripts`, async ({ request }) => {
      const csp = async (): Promise<string> =>
        (await request.get(pad)).headers()['content-security-policy'] ?? '';
      const een = await csp();
      const twee = await csp();
      expect(scriptSrc(een)).toMatch(/'nonce-[A-Za-z0-9+/=_-]{16,}'/);
      expect(scriptSrc(een)).not.toContain("'unsafe-inline'");
      expect(een).not.toBe(twee);
    });
  }

  test('de pagina’s laden zonder overtredingen van de CSP, ook ingelogd', async ({ page }) => {
    const fouten: string[] = [];
    page.on('console', (bericht) => {
      if (bericht.type() === 'error') fouten.push(bericht.text());
    });
    await page.goto('/');
    await page.goto('/inloggen');
    await ingelogdLid(page);
    expect(fouten).toEqual([]);
  });
});
