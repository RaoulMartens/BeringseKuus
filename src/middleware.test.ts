// Tests voor src/middleware.ts, zonder Worker: een aanvraag erin, kijken wat eruit komt. Supabase is nagemaakt met
// een eigen fetch. De browsertests (e2e/sessie-en-csp.spec.ts) doen hetzelfde tegen de echte lokale Supabase.
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { middleware } from './middleware';

const SUPABASE = 'https://projectref.supabase.test';
const NAAM = 'sb-projectref-auth-token';
const nu = (): number => Math.floor(Date.now() / 1000);
const b64 = (data: unknown): string => Buffer.from(JSON.stringify(data)).toString('base64url');
const jwt = (verloopt: number): string =>
  `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'lid-1', role: 'authenticated', aud: 'authenticated', exp: verloopt })}.handtekening`;
const lid = { id: 'lid-1', aud: 'authenticated', role: 'authenticated', email: 'lid@example.com' };

function sessie(refreshToken: string, verloopt: number): Record<string, unknown> {
  return {
    access_token: jwt(verloopt),
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: verloopt - nu(),
    expires_at: verloopt,
    user: lid,
  };
}

const cookieWaarde = (s: Record<string, unknown>): string => `base64-${b64(s)}`;
const leesCookie = (waarde: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(waarde.replace(/^base64-/, ''), 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;

function aanvraag(
  extra: Record<string, string> = {},
  cookie = `${NAAM}=${cookieWaarde(sessie('oud', nu() - 60))}`,
) {
  return new NextRequest('https://site.test/mijn', { headers: { cookie, ...extra } });
}

/** Een nagemaakte Supabase: ververst met een nieuwe sessie en kent het lid. Telt de aanroepen. */
function supabaseDieAntwoordt() {
  const aanroepen: string[] = [];
  const ophalen = vi.fn((invoer: RequestInfo | URL) => {
    const url = invoer instanceof Request ? invoer.url : String(invoer);
    aanroepen.push(new URL(url).pathname);
    if (url.includes('/token')) return Promise.resolve(Response.json(sessie('nieuw', nu() + 3600)));
    if (url.includes('/user')) return Promise.resolve(Response.json(lid));
    return Promise.resolve(new Response('{}', { status: 404 }));
  });
  vi.stubGlobal('fetch', ophalen);
  return aanroepen;
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', SUPABASE);
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('middleware: sessie verversen', () => {
  it('ververst een verlopen sessie, voor de browser én voor de pagina in dezelfde aanvraag', async () => {
    const aanroepen = supabaseDieAntwoordt();
    const antwoord = await middleware(aanvraag());

    expect(aanroepen.filter((pad) => pad.endsWith('/token'))).toHaveLength(1);
    const naarBrowser = antwoord.cookies.get(NAAM);
    expect(leesCookie(naarBrowser?.value ?? '').refresh_token).toBe('nieuw');
    // Wat de pagina in deze aanvraag te zien krijgt, geeft Next.js door in x-middleware-request-*.
    const naarPagina = antwoord.headers.get('x-middleware-request-cookie') ?? '';
    const waarde = new RegExp(`${NAAM}=([^;]+)`).exec(naarPagina)?.[1] ?? '';
    expect(leesCookie(decodeURIComponent(waarde)).refresh_token).toBe('nieuw');
  });

  it('zet de sessiecookie alleen voor de server: HttpOnly, Secure, SameSite=Lax (review PR10-02)', async () => {
    supabaseDieAntwoordt();
    const cookie = (await middleware(aanvraag())).cookies.get(NAAM);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe('lax');
  });

  it('neemt de cache-headers van Supabase over bij een nieuwe sessie (review PR10-09)', async () => {
    supabaseDieAntwoordt();
    const antwoord = await middleware(aanvraag());
    expect(antwoord.headers.get('cache-control')).toContain('no-store');
  });

  it('ververst niet bij een serveractie: die regelt zijn eigen cookies (review PR10-01)', async () => {
    const aanroepen = supabaseDieAntwoordt();
    const antwoord = await middleware(aanvraag({ 'next-action': 'abc123' }));
    expect(aanroepen).toEqual([]);
    expect(antwoord.cookies.get(NAAM)).toBeUndefined();
    expect(antwoord.headers.get('content-security-policy')).toContain("'nonce-");
  });

  it('roept Supabase niet aan zonder sessiecookie', async () => {
    const aanroepen = supabaseDieAntwoordt();
    await middleware(aanvraag({}, ''));
    expect(aanroepen).toEqual([]);
  });

  it('laat een pagina niet wachten op een Supabase die niet antwoordt (review PR10-03)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    const begin = Date.now();
    const antwoord = await middleware(aanvraag());
    expect(Date.now() - begin).toBeLessThan(4000);
    expect(antwoord.headers.get('content-security-policy')).toContain("'nonce-");
    expect(antwoord.cookies.get(NAAM)).toBeUndefined();
  }, 10_000);

  it('geeft geen fout als de Supabase-gegevens ontbreken; de CSP komt er gewoon op', async () => {
    vi.unstubAllEnvs();
    const antwoord = await middleware(aanvraag());
    expect(antwoord.headers.get('content-security-policy')).toContain("'nonce-");
  });
});

describe('middleware: alleen https (review F0-05)', () => {
  it('stuurt http door naar hetzelfde adres over https, met 308', async () => {
    const aanroepen = supabaseDieAntwoordt();
    const antwoord = await middleware(new NextRequest('http://site.test/inloggen?fout=verlopen'));
    expect(antwoord.status).toBe(308);
    expect(antwoord.headers.get('location')).toBe('https://site.test/inloggen?fout=verlopen');
    expect(aanroepen).toEqual([]);
  });

  it('stuurt de eigen computer niet door: daar lopen de tests over http', async () => {
    for (const adres of ['http://127.0.0.1:3100/', 'http://localhost:3000/']) {
      expect((await middleware(new NextRequest(adres))).status).toBe(200);
    }
  });
});
