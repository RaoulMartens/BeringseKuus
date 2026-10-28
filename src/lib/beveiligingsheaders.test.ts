import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  contentSecurityPolicy,
  headersVasteBestanden,
  nieuweNonce,
  vasteHeaders,
} from './beveiligingsheaders';

/** De headers onder de regel `/*` in public/_headers, in de volgorde van het bestand. */
function leesHeadersBestand(): { key: string; value: string }[] {
  const regels = readFileSync('public/_headers', 'utf8').split('\n');
  const start = regels.indexOf('/*');
  return regels
    .slice(start + 1)
    .filter((regel) => regel.startsWith('  '))
    .map((regel) => {
      const scheiding = regel.indexOf(': ');
      return { key: regel.slice(2, scheiding), value: regel.slice(scheiding + 2) };
    });
}

const richtlijn = (csp: string, naam: string): string =>
  csp.split('; ').find((r) => r.startsWith(`${naam} `)) ?? '';

describe('beveiligingsheaders', () => {
  it('bevat alle headers uit bouwgids 14.4, de CSP apart per aanvraag', () => {
    const namen = vasteHeaders().map((header) => header.key);
    for (const naam of ['Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy']) {
      expect(namen).toContain(naam);
    }
    expect(namen).not.toContain('Content-Security-Policy');
  });

  it('verbiedt inbedden in andermans pagina', () => {
    expect(contentSecurityPolicy('production', 'abc')).toContain("frame-ancestors 'none'");
  });

  it("staat in productie alleen scripts met de nonce toe: geen 'unsafe-inline', geen eval", () => {
    const scripts = richtlijn(contentSecurityPolicy('production', 'abc'), 'script-src');
    expect(scripts).toBe("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(contentSecurityPolicy('production', 'abc')).toContain("object-src 'none'");
  });

  it('staat eval en de websocket alleen in ontwikkeling toe', () => {
    const csp = contentSecurityPolicy('development', 'abc');
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('ws:');
    expect(contentSecurityPolicy('production', 'abc')).not.toContain('ws:');
  });

  it('maakt elke keer een andere nonce van minstens 128 bits', () => {
    const een = nieuweNonce();
    expect(een).not.toBe(nieuweNonce());
    expect(atob(een).length).toBeGreaterThanOrEqual(16);
  });

  it('geeft de vaste bestanden precies deze headers (public/_headers), met een CSP die niets toestaat', () => {
    expect(leesHeadersBestand()).toEqual(headersVasteBestanden());
    expect(headersVasteBestanden()[0]?.value).toMatch(/^default-src 'none'/);
  });
});
