import { describe, expect, it } from 'vitest';

import { beveiligingsheaders, contentSecurityPolicy } from './beveiligingsheaders';

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

  it('staat eval en de websocket alleen in ontwikkeling toe', () => {
    const csp = contentSecurityPolicy('development');
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain('ws:');
    expect(contentSecurityPolicy('production')).not.toContain('ws:');
  });
});
