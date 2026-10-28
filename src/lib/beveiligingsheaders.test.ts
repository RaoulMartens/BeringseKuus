import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { beveiligingsheaders, contentSecurityPolicy } from './beveiligingsheaders';

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

const VERPLICHT = [
  'Content-Security-Policy',
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'Referrer-Policy',
] as const;

describe('beveiligingsheaders', () => {
  it('bevat in productie alle headers uit bouwgids 14.4', () => {
    const namen = beveiligingsheaders('production').map((header) => header.key);
    for (const naam of VERPLICHT) {
      expect(namen).toContain(naam);
    }
  });

  it('verbiedt inbedden in andermans pagina', () => {
    expect(contentSecurityPolicy('production')).toContain("frame-ancestors 'none'");
  });

  it('staat in productie geen eval en geen plug-ins toe', () => {
    const csp = contentSecurityPolicy('production');
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("object-src 'none'");
  });

  it('geeft de vaste bestanden precies dezelfde headers (public/_headers)', () => {
    expect(leesHeadersBestand()).toEqual(beveiligingsheaders('production'));
  });

  it('staat eval en de websocket alleen in ontwikkeling toe', () => {
    const csp = contentSecurityPolicy('development');
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('ws:');
    expect(contentSecurityPolicy('production')).not.toContain('ws:');
  });
});
