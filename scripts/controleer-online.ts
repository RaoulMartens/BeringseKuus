// Controle na de uitrol (workflow uitrol, review PR8-07): antwoordt de nieuwe versie, met precies de
// beveiligingsheaders, ook bij een vast bestand, alleen over https, en heeft de Worker zijn Supabase-gegevens?
//
// Eerst wachten tot /BUILD_ID gelijk is aan de build die net is uitgerold; anders zou de controle nog de vorige
// versie kunnen keuren. Let op: de nieuwe versie staat dan al online. Rood betekent "online en niet in orde":
// terugrollen zoals in docs/hosting.md staat.
//
// Alleen ingebouwde Node-onderdelen: de uitrolstap installeert de afhankelijkheden van de app bewust niet.
//
// Gebruik:   node scripts/controleer-online.ts --site https://… --build-id .open-next/assets/BUILD_ID
// Uitkomst:  "0 problemen" en exitcode 0, of een lijst en exitcode 1.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as wacht } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

import {
  contentSecurityPolicy,
  type Header,
  headersVasteBestanden,
  vasteHeaders,
} from '../src/lib/beveiligingsheaders.ts';
import { TEST_AGENDA_TOKEN } from './agenda-testtoken.ts';

export type Ophalen = (url: string) => Promise<Response>;

/**
 * Wat een pagina hoort mee te sturen. De nonce verschilt per aanvraag, dus die nemen we over uit het antwoord;
 * de rest van de CSP moet precies kloppen. Zonder nonce in het antwoord klopt de CSP dus nooit.
 */
export function verwachtePaginaHeaders(ontvangen: Headers): Header[] {
  const nonce = nonceUit(ontvangen) ?? 'ontbreekt';
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy('production', nonce) },
    ...vasteHeaders(),
  ];
}

/** Vergelijkt de ontvangen headers met de verwachte waarden; een header die ontbreekt of afwijkt is een probleem. */
export function vergelijkHeaders(waar: string, verwacht: Header[], ontvangen: Headers): string[] {
  return verwacht
    .filter(({ key, value }) => ontvangen.get(key) !== value)
    .map(({ key }) => `${waar}: header ${key} ontbreekt of wijkt af`);
}

const nonceUit = (headers: Headers): string | undefined =>
  /'nonce-([^']+)'/.exec(headers.get('content-security-policy') ?? '')?.[1];

/** Elke <script> in de HTML draagt de nonce uit de header; anders blokkeert de browser hem (of klopt de nonce niet). */
export function controleerScriptsInHtml(waar: string, html: string, headers: Headers): string[] {
  const nonce = nonceUit(headers);
  const scripts = html.match(/<script\b[^>]*>/g) ?? [];
  if (nonce === undefined || scripts.length === 0) return [`${waar}: geen nonce in de CSP of geen scripts`];
  const zonder = scripts.filter((tag) => !tag.includes(`nonce="${nonce}"`)).length;
  return zonder === 0 ? [] : [`${waar}: ${zonder} script(s) zonder de nonce uit de header`];
}

/** Het eerste script onder /_next/static/ dat de pagina laadt. */
export function vindVastBestand(html: string): string | undefined {
  return /["'](\/_next\/static\/[^"']+\.js)["']/.exec(html)?.[1];
}

/** Wacht tot de site de verwachte build uitlevert. Geeft false als dat binnen de pogingen niet gebeurt. */
export async function wachtOpVersie(
  site: string,
  buildId: string,
  ophalen: Ophalen,
  pogingen = 12,
  pauzeMs = 5000,
): Promise<boolean> {
  for (let i = 0; i < pogingen; i += 1) {
    const antwoord = await ophalen(`${site}/BUILD_ID`);
    if (antwoord.ok && (await antwoord.text()).trim() === buildId) return true;
    if (i < pogingen - 1) await wacht(pauzeMs);
  }
  return false;
}

export async function controleerOnline(
  site: string,
  buildId: string,
  ophalen: Ophalen,
  pauzeMs = 5000,
): Promise<string[]> {
  if (!(await wachtOpVersie(site, buildId, ophalen, 12, pauzeMs)))
    return ['de site levert na een minuut nog niet de nieuwe versie uit (BUILD_ID wijkt af)'];
  const problemen: string[] = [];

  const start = await ophalen(`${site}/`);
  const startHtml = await start.text();
  if (start.status !== 200) problemen.push(`/: status ${start.status}`);
  problemen.push(...vergelijkHeaders('/', verwachtePaginaHeaders(start.headers), start.headers));
  problemen.push(...controleerScriptsInHtml('/', startHtml, start.headers));

  // Een nonce die niet per aanvraag verschilt (bijvoorbeeld door een cache) beschermt niets (review PR10-07).
  const nogEens = await ophalen(`${site}/`);
  if (nonceUit(nogEens.headers) === nonceUit(start.headers))
    problemen.push('/: de nonce is bij een tweede aanvraag dezelfde');

  const inloggen = await ophalen(`${site}/inloggen`);
  if (inloggen.status !== 200) problemen.push(`/inloggen: status ${inloggen.status}`);
  problemen.push(
    ...vergelijkHeaders('/inloggen', verwachtePaginaHeaders(inloggen.headers), inloggen.headers),
  );

  // Over http geen formulier, maar een doorverwijzing naar hetzelfde adres over https (review F0-05).
  if (site.startsWith('https://')) {
    const http = await ophalen(`${site.replace(/^https:/, 'http:')}/inloggen`);
    if (![301, 308].includes(http.status) || http.headers.get('location') !== `${site}/inloggen`)
      problemen.push(`http://…/inloggen: status ${http.status}, geen doorverwijzing naar https`);
  } else {
    problemen.push('--site moet met https:// beginnen');
  }

  // /inloggen toont het formulier ook zonder Supabase. /mijn stuurt een bezoeker zonder sessie door, maar alleen als
  // SUPABASE_URL en SUPABASE_PUBLISHABLE_KEY bij de Worker staan (anders een serverfout). Meer bewijst dit niet:
  // zonder sessiecookie belt de Supabase-client niet naar buiten, dus een typfout in het adres of een ingetrokken
  // sleutel valt hier niet op (review F0-14). Dat laat pas inloggen zien (docs/hosting.md stap 10).
  // Next.js stuurt een relatief adres (location: /inloggen); lees het als adres op deze site.
  const mijn = await ophalen(`${site}/mijn`);
  const naar = new URL(mijn.headers.get('location') ?? '', `${site}/`).href;
  if (mijn.status !== 307 || naar !== `${site}/inloggen`)
    problemen.push(
      `/mijn: stuurt niet door naar /inloggen (status ${mijn.status}); staan de Supabase-gegevens bij de Worker?`,
    );

  // Proefroute 1: het testtoken uit deze publieke repository mag online nooit werken (review PR11-03). Het antwoord
  // is het eigen kale 404 van de route (geen 404-pagina van Next.js: dan ontbreekt de route, review PR11-06), en
  // niet te bewaren. Dat de feed met het echte token werkt, bewijst docs/hosting.md stap 11 met de hand.
  const agenda = await ophalen(`${site}/proef/agenda/${TEST_AGENDA_TOKEN}.ics`);
  const agendaTekst = await agenda.text();
  if (agenda.status !== 404 || agendaTekst !== 'Niet gevonden')
    problemen.push(
      `/proef/agenda: het testtoken gaf status ${agenda.status} en niet het kale "Niet gevonden"`,
    );
  if (!(agenda.headers.get('content-type') ?? '').startsWith('text/plain'))
    problemen.push('/proef/agenda: het antwoord is geen text/plain (ontbreekt de route?)');
  if (!/\bno-store\b/.test(agenda.headers.get('cache-control') ?? ''))
    problemen.push('/proef/agenda: het antwoord mag bewaard worden (geen no-store)');

  // Proefroute 3: de geplande taak is online niet van buiten te starten (/__scheduled bestaat alleen in wrangler dev).
  const taak = await ophalen(`${site}/__scheduled?cron=*+*+*+*+*`);
  if (taak.status !== 404)
    problemen.push(`/__scheduled: status ${taak.status}; de taak is van buiten te starten`);

  const vast = vindVastBestand(startHtml);
  if (vast === undefined) {
    problemen.push('/: geen vast bestand onder /_next/static/ gevonden');
  } else {
    const bestand = await ophalen(`${site}${vast}`);
    if (bestand.status !== 200) problemen.push(`vast bestand: status ${bestand.status}`);
    problemen.push(...vergelijkHeaders('vast bestand', headersVasteBestanden(), bestand.headers));
  }
  return problemen;
}

async function uitvoeren(): Promise<number> {
  const argumenten = process.argv.slice(2);
  const waarde = (naam: string): string | undefined => {
    const i = argumenten.indexOf(naam);
    return i >= 0 ? argumenten[i + 1] : undefined;
  };
  const site = waarde('--site')?.replace(/\/+$/, '');
  const buildIdBestand = waarde('--build-id');
  if (!site || !buildIdBestand) {
    console.error('Gebruik: node scripts/controleer-online.ts --site https://… --build-id pad/naar/BUILD_ID');
    return 1;
  }
  const buildId = readFileSync(buildIdBestand, 'utf8').trim();
  const problemen = await controleerOnline(site, buildId, (url) => fetch(url, { redirect: 'manual' }));
  if (problemen.length === 0) {
    console.log('controleer-online: 0 problemen');
    return 0;
  }
  for (const p of problemen) console.error(`FOUT ${p}`);
  console.error(
    `controleer-online: ${problemen.length} ${problemen.length === 1 ? 'probleem' : 'problemen'}`,
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await uitvoeren();
}
