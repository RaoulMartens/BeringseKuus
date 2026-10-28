// Controle na de uitrol (workflow uitrol, review PR8-07): antwoordt de nieuwe versie, met precies de
// beveiligingsheaders, ook bij een vast bestand?
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

import { beveiligingsheaders, type Header } from '../src/lib/beveiligingsheaders.ts';

export type Ophalen = (url: string) => Promise<Response>;

/** Vergelijkt de ontvangen headers met de verwachte waarden; een header die ontbreekt of afwijkt is een probleem. */
export function vergelijkHeaders(waar: string, verwacht: Header[], ontvangen: Headers): string[] {
  return verwacht
    .filter(({ key, value }) => ontvangen.get(key) !== value)
    .map(({ key }) => `${waar}: header ${key} ontbreekt of wijkt af`);
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
  const verwacht = beveiligingsheaders('production');
  const problemen: string[] = [];

  const start = await ophalen(`${site}/`);
  if (start.status !== 200) problemen.push(`/: status ${start.status}`);
  problemen.push(...vergelijkHeaders('/', verwacht, start.headers));

  const inloggen = await ophalen(`${site}/inloggen`);
  if (inloggen.status !== 200) problemen.push(`/inloggen: status ${inloggen.status}`);

  const vast = vindVastBestand(await start.text());
  if (vast === undefined) {
    problemen.push('/: geen vast bestand onder /_next/static/ gevonden');
  } else {
    const bestand = await ophalen(`${site}${vast}`);
    if (bestand.status !== 200) problemen.push(`vast bestand: status ${bestand.status}`);
    problemen.push(...vergelijkHeaders('vast bestand', verwacht, bestand.headers));
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
