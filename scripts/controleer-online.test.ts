// Tests voor scripts/controleer-online.ts. Draaien met: npm run test

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { beveiligingsheaders } from '../src/lib/beveiligingsheaders.ts';
import { controleerOnline, type Ophalen, vergelijkHeaders, vindVastBestand } from './controleer-online.ts';

const SITE = 'https://voorbeeld.invalid';
const GOED = Object.fromEntries(beveiligingsheaders('production').map(({ key, value }) => [key, value]));
const HTML = '<script src="/_next/static/chunks/main-abc.js"></script>';

/** Een nep-site: per pad een antwoord. Het BUILD_ID kan per aanroep verschillen (oude en nieuwe versie). */
function site(
  opties: { buildIds?: string[]; vastHeaders?: Record<string, string>; mijn?: () => Response } = {},
): Ophalen {
  const buildIds = [...(opties.buildIds ?? ['nieuw'])];
  return (url: string) => {
    const pad = url.slice(SITE.length);
    if (pad === '/BUILD_ID') return Promise.resolve(new Response(buildIds.shift() ?? 'nieuw'));
    if (pad === '/') return Promise.resolve(new Response(HTML, { headers: GOED }));
    if (pad === '/inloggen') return Promise.resolve(new Response('', { headers: GOED }));
    if (pad === '/mijn')
      return Promise.resolve(
        opties.mijn?.() ?? new Response('', { status: 307, headers: { Location: '/inloggen' } }),
      );
    if (pad.startsWith('/_next/static/'))
      return Promise.resolve(new Response('', { headers: opties.vastHeaders ?? GOED }));
    return Promise.resolve(new Response('', { status: 404 }));
  };
}

describe('controleer-online', () => {
  it('geeft 0 problemen als de nieuwe versie antwoordt met alle headers', async () => {
    assert.deepEqual(await controleerOnline(SITE, 'nieuw', site(), 0), []);
  });

  it('wacht tot de nieuwe versie antwoordt', async () => {
    assert.deepEqual(
      await controleerOnline(SITE, 'nieuw', site({ buildIds: ['oud', 'oud', 'nieuw'] }), 0),
      [],
    );
  });

  it('faalt als de oude versie blijft antwoorden', async () => {
    const problemen = await controleerOnline(SITE, 'nieuw', site({ buildIds: Array(20).fill('oud') }), 0);
    assert.equal(problemen.length, 1);
  });

  it('faalt als een vast bestand de headers mist (review PR8-04)', async () => {
    assert.notDeepEqual(await controleerOnline(SITE, 'nieuw', site({ vastHeaders: {} }), 0), []);
  });

  // /inloggen werkt ook zonder Supabase-gegevens; /mijn niet (gezien bij de eerste uitrol, 28-10-2026).
  it('faalt als /mijn niet doorstuurt naar /inloggen, bijvoorbeeld zonder Supabase-gegevens', async () => {
    const zonderSupabase = site({ mijn: () => new Response('', { status: 500 }) });
    assert.notDeepEqual(await controleerOnline(SITE, 'nieuw', zonderSupabase, 0), []);
    const elders = site({
      mijn: () => new Response('', { status: 307, headers: { Location: 'https://elders.invalid/' } }),
    });
    assert.notDeepEqual(await controleerOnline(SITE, 'nieuw', elders, 0), []);
  });

  it('keurt een header af die er wel is maar een andere waarde heeft', () => {
    const zwak = new Headers({ ...GOED, 'Content-Security-Policy': 'default-src *' });
    assert.deepEqual(vergelijkHeaders('/', beveiligingsheaders('production'), zwak), [
      '/: header Content-Security-Policy ontbreekt of wijkt af',
    ]);
  });

  it('vindt het eerste script onder /_next/static/', () => {
    assert.equal(vindVastBestand(HTML), '/_next/static/chunks/main-abc.js');
    assert.equal(vindVastBestand('<p>geen script</p>'), undefined);
  });
});
