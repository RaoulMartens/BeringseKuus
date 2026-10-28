// Tests voor scripts/controleer-online.ts. Draaien met: npm run test

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  contentSecurityPolicy,
  type Header,
  headersVasteBestanden,
  vasteHeaders,
} from '../src/lib/beveiligingsheaders.ts';
import { TEST_AGENDA_TOKEN } from './agenda-testtoken.ts';
import {
  controleerOnline,
  controleerScriptsInHtml,
  type Ophalen,
  verwachtePaginaHeaders,
  vergelijkHeaders,
  vindVastBestand,
} from './controleer-online.ts';

const SITE = 'https://voorbeeld.invalid';
const alsObject = (headers: Header[]): Record<string, string> =>
  Object.fromEntries(headers.map(({ key, value }) => [key, value]));
const paginaHeaders = (nonce: string): Record<string, string> =>
  alsObject([
    { key: 'Content-Security-Policy', value: contentSecurityPolicy('production', nonce) },
    ...vasteHeaders(),
  ]);
const VAST = alsObject(headersVasteBestanden());
const html = (nonce: string): string =>
  `<script src="/_next/static/chunks/main-abc.js" nonce="${nonce}"></script><script nonce="${nonce}">1</script>`;

/** Een nep-site: per pad een antwoord, per pagina een nieuwe nonce. Het BUILD_ID kan per aanroep verschillen. */
function site(
  opties: {
    buildIds?: string[];
    pagina?: (nonce: string) => Response;
    vastHeaders?: Record<string, string>;
    mijn?: () => Response;
    agenda?: (pad: string) => Response;
    taak?: () => Response;
  } = {},
): Ophalen {
  const buildIds = [...(opties.buildIds ?? ['nieuw'])];
  let teller = 0;
  const pagina =
    opties.pagina ?? ((nonce: string) => new Response(html(nonce), { headers: paginaHeaders(nonce) }));
  return (url: string) => {
    const pad = url.slice(SITE.length);
    if (pad === '/BUILD_ID') return Promise.resolve(new Response(buildIds.shift() ?? 'nieuw'));
    teller += 1;
    if (pad === '/' || pad === '/inloggen') return Promise.resolve(pagina(`nonce${teller}`));
    if (pad === '/mijn')
      return Promise.resolve(
        opties.mijn?.() ?? new Response('', { status: 307, headers: { Location: '/inloggen' } }),
      );
    if (pad.startsWith('/_next/static/'))
      return Promise.resolve(new Response('', { headers: opties.vastHeaders ?? VAST }));
    if (pad.startsWith('/proef/agenda/'))
      return Promise.resolve(
        opties.agenda?.(pad) ??
          new Response('Niet gevonden', {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
          }),
      );
    if (pad.startsWith('/__scheduled') && opties.taak) return Promise.resolve(opties.taak());
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

  it("faalt als een pagina weer 'unsafe-inline' of geen nonce heeft (proefroute 2)", async () => {
    const oud = (nonce: string) =>
      new Response(html(nonce), {
        headers: {
          ...paginaHeaders(nonce),
          'Content-Security-Policy': contentSecurityPolicy('production', 'x').replace(
            "'nonce-x' 'strict-dynamic'",
            "'unsafe-inline'",
          ),
        },
      });
    assert.notDeepEqual(await controleerOnline(SITE, 'nieuw', site({ pagina: oud }), 0), []);
  });

  it('faalt als de nonce niet per aanvraag verschilt, bijvoorbeeld door een cache (review PR10-07)', async () => {
    const vast = () => new Response(html('altijd'), { headers: paginaHeaders('altijd') });
    const problemen = await controleerOnline(SITE, 'nieuw', site({ pagina: vast }), 0);
    assert.ok(problemen.some((p) => p.includes('dezelfde')));
  });

  it('faalt als een script in de HTML de nonce uit de header mist (review PR10-07)', async () => {
    const anders = (nonce: string) => new Response(html('anders'), { headers: paginaHeaders(nonce) });
    assert.notDeepEqual(await controleerOnline(SITE, 'nieuw', site({ pagina: anders }), 0), []);
    assert.deepEqual(controleerScriptsInHtml('/', html('n'), new Headers(paginaHeaders('n'))), []);
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

  it('faalt als de agenda-feed een onbekend token toch bedient of laat bewaren (proefroute 1)', async () => {
    const bedient = () => new Response('BEGIN:VCALENDAR', { headers: { 'Cache-Control': 'no-store' } });
    assert.notDeepEqual(await controleerOnline(SITE, 'nieuw', site({ agenda: bedient }), 0), []);
    const bewaarbaar = () =>
      new Response('Niet gevonden', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    assert.notDeepEqual(await controleerOnline(SITE, 'nieuw', site({ agenda: bewaarbaar }), 0), []);
  });

  // Review PR11-06: de 404-pagina van Next.js (de route ontbreekt) mag niet voor het eigen antwoord doorgaan.
  it('faalt als de route ontbreekt en Next.js zijn eigen 404-pagina geeft', async () => {
    const nextPagina = () =>
      new Response('<!DOCTYPE html>…', {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' },
      });
    assert.notDeepEqual(await controleerOnline(SITE, 'nieuw', site({ agenda: nextPagina }), 0), []);
  });

  // Review PR11-03: het testtoken staat in de publieke repository en mag online nooit werken.
  it('faalt als het publieke testtoken online de agenda geeft', async () => {
    const testtokenWerkt = (pad: string) =>
      pad.includes(TEST_AGENDA_TOKEN)
        ? new Response('BEGIN:VCALENDAR', { headers: { 'Cache-Control': 'private, no-store' } })
        : new Response('Niet gevonden', {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store' },
          });
    assert.notDeepEqual(await controleerOnline(SITE, 'nieuw', site({ agenda: testtokenWerkt }), 0), []);
  });

  it('faalt als de geplande taak online van buiten te starten is (proefroute 3)', async () => {
    const open = () => new Response('Ran scheduled event');
    assert.notDeepEqual(await controleerOnline(SITE, 'nieuw', site({ taak: open }), 0), []);
  });

  it('keurt een header af die er wel is maar een andere waarde heeft', () => {
    const zwak = new Headers({ ...paginaHeaders('n'), 'Content-Security-Policy': 'default-src *' });
    assert.deepEqual(vergelijkHeaders('/', verwachtePaginaHeaders(zwak), zwak), [
      '/: header Content-Security-Policy ontbreekt of wijkt af',
    ]);
  });

  it('vindt het eerste script onder /_next/static/', () => {
    assert.equal(vindVastBestand(html('n')), '/_next/static/chunks/main-abc.js');
    assert.equal(vindVastBestand('<p>geen script</p>'), undefined);
  });
});
