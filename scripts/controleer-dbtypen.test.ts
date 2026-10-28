// Tests voor scripts/controleer-dbtypen.ts. Draaien met: npm run test
// Het genereren zelf (supabase gen types) draait alleen in de poort, tegen de lokale database.

import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { maakBestand, vergelijk } from './controleer-dbtypen.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('controleer-dbtypen', () => {
  it('zet de kop erboven en maakt het op zoals Prettier', async () => {
    const bestand = await maakBestand(ROOT, 'export type Json = string\n');
    assert.match(bestand, /^\/\/ Gegenereerd met `npm run types:db`/);
    assert.match(bestand, /export type Json = string;\n$/);
  });

  it('keurt goed als het bestand gelijk is', () => {
    assert.deepEqual(vergelijk('a', 'a'), []);
  });

  it('faalt als het bestand afwijkt of ontbreekt, met wat je moet doen', () => {
    assert.match(vergelijk('a', 'b')[0] ?? '', /npm run types:db/);
    assert.match(vergelijk('a', undefined)[0] ?? '', /ontbreekt/);
  });
});
