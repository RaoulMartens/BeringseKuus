import { describe, expect, it } from 'vitest';

import { tokenKlopt } from './token';

const TOKEN = 'a'.repeat(32) + '0123456789abcdef';

describe('agenda-token', () => {
  it('klopt alleen bij precies hetzelfde token', async () => {
    expect(await tokenKlopt(TOKEN, TOKEN)).toBe(true);
    expect(await tokenKlopt(`${TOKEN.slice(0, -1)}0`, TOKEN)).toBe(false);
    expect(await tokenKlopt(TOKEN.slice(0, -1), TOKEN)).toBe(false);
  });

  it('weigert alles zolang er geen token is ingesteld', async () => {
    expect(await tokenKlopt(TOKEN, undefined)).toBe(false);
    expect(await tokenKlopt(TOKEN, '')).toBe(false);
  });

  it('weigert een token in een vreemde vorm, zonder het te vergelijken', async () => {
    for (const vreemd of ['kort', `${TOKEN}/../x`, `${TOKEN}.ics`, 'a'.repeat(200), `${TOKEN} `]) {
      expect(await tokenKlopt(vreemd, vreemd)).toBe(false);
    }
  });

  it('accepteert 32 tot en met 128 tekens, niet 31 of 129', async () => {
    for (const lengte of [32, 128])
      expect(await tokenKlopt('b'.repeat(lengte), 'b'.repeat(lengte))).toBe(true);
    for (const lengte of [31, 129])
      expect(await tokenKlopt('b'.repeat(lengte), 'b'.repeat(lengte))).toBe(false);
  });
});
