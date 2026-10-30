// Proefroute 2 (Fase-0-plan 4): wat alleen de middleware (src/middleware.ts) kan, getest op de Worker in workerd.
//
// 1. De sessie verversen bij een gewone paginaweergave. Een Server Component kan geen cookies zetten; zonder dit
//    blijft een verlopen sessie in de browser staan en is het lid na een uur zonder actie uitgelogd.
// 2. Een CSP met een nonce per aanvraag, zonder 'unsafe-inline' voor scripts (bouwgids 14.4).
//
// De aanvraag-kant van het verversen (de pagina krijgt de nieuwe sessie) test src/middleware.test.ts.
import { type BrowserContext, type Cookie, expect, type Page, test } from '@playwright/test';

import { ingelogdLid, ruimLedenOp } from './inloggen-hulp.ts';

test.afterAll(ruimLedenOp);

const SESSIECOOKIE = /^(sb-.+-auth-token)(?:\.(\d+))?$/;
const volgnummer = (naam: string): number => Number(SESSIECOOKIE.exec(naam)?.[2] ?? 0);

interface Sessie {
  expires_at: number;
  refresh_token: string;
}

/** Leest de sessie uit de (samengevoegde) waarde van de cookie: "base64-" en dan JSON in base64url. */
function leesSessie(waarde: string): Sessie {
  const inhoud: unknown = JSON.parse(
    Buffer.from(waarde.replace(/^base64-/, ''), 'base64url').toString('utf8'),
  );
  if (
    typeof inhoud !== 'object' ||
    inhoud === null ||
    !('expires_at' in inhoud) ||
    typeof inhoud.expires_at !== 'number' ||
    !('refresh_token' in inhoud) ||
    typeof inhoud.refresh_token !== 'string'
  )
    throw new Error('onverwachte inhoud van de sessiecookie');
  return { ...inhoud, expires_at: inhoud.expires_at, refresh_token: inhoud.refresh_token };
}

/** De sessiecookie van Supabase, die in stukken (.0, .1, …) kan zijn opgedeeld. */
function sessiecookies(cookies: Cookie[]): { naam: string; stukken: Cookie[] } {
  const stukken = cookies
    .filter((c) => SESSIECOOKIE.test(c.name))
    .sort((a, b) => volgnummer(a.name) - volgnummer(b.name));
  const naam = SESSIECOOKIE.exec(stukken[0]?.name ?? '')?.[1];
  if (!naam) throw new Error('geen sessiecookie van Supabase gevonden');
  return { naam, stukken };
}

/** Zet de vervaltijd van de sessie in de cookie in het verleden, zoals na een uur zonder actie. */
async function laatSessieVerlopen(context: BrowserContext): Promise<{ naam: string; oud: Sessie }> {
  const { naam, stukken } = sessiecookies(await context.cookies());
  const eerste = stukken[0];
  if (!eerste) throw new Error('geen sessiecookie');
  const oud = leesSessie(stukken.map((c) => c.value).join(''));
  const verlopen = { ...oud, expires_at: Math.floor(Date.now() / 1000) - 60 };
  for (const stuk of stukken) await context.clearCookies({ name: stuk.name });
  await context.addCookies([
    { ...eerste, name: naam, value: `base64-${Buffer.from(JSON.stringify(verlopen)).toString('base64url')}` },
  ]);
  return { naam, oud };
}

/** De sessie uit de Set-Cookie-regels van een antwoord; wis-opdrachten (lege waarde) tellen niet mee. */
function nieuweSessie(setCookies: string[], naam: string): Sessie | undefined {
  const stukken = setCookies
    .map((regel) => /^([^=]+)=([^;]*)/.exec(regel))
    .filter((m): m is RegExpExecArray => m !== null)
    .filter((m) => SESSIECOOKIE.exec(m[1] ?? '')?.[1] === naam && (m[2] ?? '') !== '')
    .sort((a, b) => volgnummer(a[1] ?? '') - volgnummer(b[1] ?? ''));
  return stukken.length === 0 ? undefined : leesSessie(stukken.map((m) => m[2] ?? '').join(''));
}

test.describe('sessie verversen (middleware)', () => {
  test('een verlopen sessie wordt bij het openen van een pagina ververst', async ({ page, context }) => {
    await ingelogdLid(page);
    const { naam, oud } = await laatSessieVerlopen(context);

    const antwoord = await page.request.get('/mijn', { maxRedirects: 0 });
    expect(antwoord.status()).toBe(200);
    const setCookies = antwoord
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value);
    const nieuw = nieuweSessie(setCookies, naam);
    expect(nieuw, 'de nieuwe sessie komt in een cookie terug').toBeDefined();
    expect(nieuw?.refresh_token).not.toBe(oud.refresh_token);
    expect(nieuw?.expires_at ?? 0).toBeGreaterThan(Date.now() / 1000);

    await page.goto('/mijn');
    await expect(page).toHaveURL(/\/mijn$/);
  });

  // Review PR10-01: de middleware ververste vóór de uitlogactie, en die nieuwe cookie bleef na het wissen staan.
  test('uitloggen na een verlopen sessie laat geen sessie achter', async ({ page, context }) => {
    await ingelogdLid(page);
    await laatSessieVerlopen(context);

    await page.getByRole('button', { name: 'Uitloggen' }).click();
    await expect(page).toHaveURL(/\/inloggen\?uitgelogd=1$/);
    const over = (await context.cookies()).filter((c) => SESSIECOOKIE.test(c.name));
    expect(over).toEqual([]);
    await page.goto('/mijn');
    await expect(page).toHaveURL(/\/inloggen$/);
  });

  // Review PR10-02: er is geen Supabase in de browser, dus JavaScript hoeft de sessie niet te kunnen lezen.
  test('de sessiecookie is niet leesbaar voor JavaScript en alleen voor https', async ({ page, context }) => {
    await ingelogdLid(page);
    const { stukken } = sessiecookies(await context.cookies());
    for (const stuk of stukken) {
      expect(stuk.httpOnly, stuk.name).toBe(true);
      expect(stuk.secure, stuk.name).toBe(true);
      expect(stuk.sameSite, stuk.name).toBe('Lax');
    }
    expect(await page.evaluate(() => document.cookie)).not.toContain('auth-token');
  });
});

/** De richtlijn script-src uit een CSP. */
const scriptSrc = (csp: string): string =>
  csp
    .split(';')
    .map((richtlijn) => richtlijn.trim())
    .find((richtlijn) => richtlijn.startsWith('script-src ')) ?? '';

const nonceUit = (csp: string): string | undefined => /'nonce-([^']+)'/.exec(csp)?.[1];

/** Controleert de CSP van de getoonde pagina, en dat elk script de nonce uit de header draagt. */
async function controleerNonce(page: Page, pad: string): Promise<void> {
  const antwoord = await page.goto(pad);
  const csp = (await antwoord?.allHeaders())?.['content-security-policy'] ?? '';
  const nonce = nonceUit(csp);
  expect(nonce, `${pad}: CSP met nonce`).toBeDefined();
  expect(scriptSrc(csp)).not.toContain("'unsafe-inline'");
  const scripts = await page
    .locator('script')
    .evaluateAll((s) => s.map((el) => (el as HTMLScriptElement).nonce));
  expect(scripts.length, `${pad}: scripts op de pagina`).toBeGreaterThan(0);
  expect(
    scripts.every((n) => n === nonce),
    `${pad}: elk script heeft de nonce uit de header`,
  ).toBe(true);
}

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

  // Review PR10-04: een bestand dat niet bestaat valt door naar de Worker en wordt een HTML-pagina.
  for (const pad of ['/bestaat-niet', '/_next/static/bestaat-niet.js', '/favicon.ico']) {
    test(`${pad} (404) heeft ook een CSP met nonce`, async ({ request }) => {
      const antwoord = await request.get(pad);
      expect(antwoord.status()).toBe(404);
      const csp = antwoord.headers()['content-security-policy'] ?? '';
      expect(nonceUit(csp), 'CSP met nonce').toBeDefined();
      expect(scriptSrc(csp)).not.toContain("'unsafe-inline'");
    });
  }

  test('elke pagina, ook ingelogd, draagt de nonce en laadt zonder CSP-fouten', async ({ page }) => {
    const fouten: string[] = [];
    page.on('console', (bericht) => {
      if (bericht.type() === 'error') fouten.push(bericht.text());
    });
    await controleerNonce(page, '/');
    await controleerNonce(page, '/inloggen');
    await controleerNonce(page, '/storing');
    await ingelogdLid(page);
    await controleerNonce(page, '/mijn');
    await controleerNonce(page, '/programma');
    // De QR-code van het instellen is een data:-afbeelding: de CSP moet die toestaan (review F1-16).
    await controleerNonce(page, '/mfa/instellen');
    await controleerNonce(page, '/mfa/toestel-kwijt');
    expect(fouten).toEqual([]);
  });
});
