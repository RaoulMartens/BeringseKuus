// Poortcontrole: geen overgeslagen tests (bouwgids 14.1 en 14.5).
//
// Een test kan op veel manieren worden overgeslagen: skip als methode van test, een optie { skip: true }, een
// andere naam voor test, t.skip() binnen de test, een todo. Zoeken in de broncode vindt niet alles. Deze controle kijkt daarom
// naar wat de testrunners zelf rapporteren, na het draaien:
//
//   testuitkomsten/node.tap     node --test (de controles in scripts/)
//   testuitkomsten/vitest.json  Vitest (src/)
//   testuitkomsten/e2e.json     Playwright (e2e/)
//
// De controle faalt als een rapport ontbreekt, als er tests zijn overgeslagen of als todo zijn gemarkeerd,
// als er tests zijn mislukt, of als er helemaal geen tests zijn gedraaid.
//
// Gebruik:   node scripts/controleer-overgeslagen.ts [--map testuitkomsten]
// Uitkomst:  "0 problemen" en exitcode 0, of een lijst en exitcode 1.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface Uitkomst {
  tests: number;
  overgeslagen: number;
  todo: number;
  mislukt: number;
}

/** Leest de samenvatting onderaan een TAP-rapport van node --test. */
export function leesNodeTap(tekst: string): Uitkomst {
  const getal = (naam: string): number =>
    Number(new RegExp(`^# ${naam} (\\d+)$`, 'm').exec(tekst)?.[1] ?? Number.NaN);
  return {
    tests: getal('tests'),
    overgeslagen: getal('skipped'),
    todo: getal('todo'),
    mislukt: getal('fail'),
  };
}

/** Leest het JSON-rapport van Vitest. */
export function leesVitest(inhoud: unknown): Uitkomst {
  const r = inhoud as Partial<
    Record<'numTotalTests' | 'numPendingTests' | 'numTodoTests' | 'numFailedTests', unknown>
  >;
  const getal = (x: unknown): number => (typeof x === 'number' ? x : Number.NaN);
  return {
    tests: getal(r.numTotalTests),
    overgeslagen: getal(r.numPendingTests),
    todo: getal(r.numTodoTests),
    mislukt: getal(r.numFailedTests),
  };
}

/** Leest het JSON-rapport van Playwright. */
export function leesPlaywright(inhoud: unknown): Uitkomst {
  const stats = ((inhoud as { stats?: unknown }).stats ?? {}) as Partial<
    Record<'expected' | 'skipped' | 'unexpected' | 'flaky', unknown>
  >;
  const getal = (x: unknown): number => (typeof x === 'number' ? x : Number.NaN);
  const verwacht = getal(stats.expected);
  const flaky = getal(stats.flaky);
  return {
    tests: verwacht + getal(stats.unexpected) + flaky,
    overgeslagen: getal(stats.skipped),
    todo: 0,
    mislukt: getal(stats.unexpected) + flaky,
  };
}

/** Beoordeelt één uitkomst. Geeft de problemen terug; leeg = goed. */
export function beoordeel(naam: string, u: Uitkomst): string[] {
  const problemen: string[] = [];
  if (Object.values(u).some((x) => Number.isNaN(x)))
    return [`${naam}: het rapport is onvolledig of onleesbaar`];
  if (u.tests === 0) problemen.push(`${naam}: er zijn geen tests gedraaid`);
  if (u.overgeslagen > 0) problemen.push(`${naam}: ${u.overgeslagen} test(s) overgeslagen`);
  if (u.todo > 0) problemen.push(`${naam}: ${u.todo} test(s) als todo gemarkeerd`);
  if (u.mislukt > 0) problemen.push(`${naam}: ${u.mislukt} test(s) mislukt of wisselend (flaky)`);
  return problemen;
}

const RAPPORTEN = [
  { bestand: 'node.tap', naam: 'node --test (scripts/)', lees: (t: string) => leesNodeTap(t) },
  {
    bestand: 'vitest.json',
    naam: 'Vitest (src/)',
    lees: (t: string) => leesVitest(JSON.parse(t) as unknown),
  },
  {
    bestand: 'e2e.json',
    naam: 'Playwright (e2e/)',
    lees: (t: string) => leesPlaywright(JSON.parse(t) as unknown),
  },
] as const;

/** Controleert alle rapporten in de map. */
export function controleerUitkomsten(map: string): string[] {
  const problemen: string[] = [];
  for (const r of RAPPORTEN) {
    const pad = path.join(map, r.bestand);
    if (!existsSync(pad)) {
      problemen.push(
        `${r.naam}: rapport ${r.bestand} ontbreekt; draai eerst de tests (npm run test en npm run test:e2e)`,
      );
      continue;
    }
    try {
      problemen.push(...beoordeel(r.naam, r.lees(readFileSync(pad, 'utf8'))));
    } catch {
      problemen.push(`${r.naam}: rapport ${r.bestand} is geen geldige uitvoer`);
    }
  }
  return problemen;
}

function uitvoeren(): number {
  const argumenten = process.argv.slice(2);
  const i = argumenten.indexOf('--map');
  const map = path.resolve((i >= 0 ? argumenten[i + 1] : undefined) ?? 'testuitkomsten');
  const problemen = controleerUitkomsten(map);
  if (problemen.length === 0) {
    console.log('controleer-overgeslagen: 0 problemen');
    return 0;
  }
  for (const p of problemen) console.error(`FOUT ${p}`);
  console.error(
    `controleer-overgeslagen: ${problemen.length} ${problemen.length === 1 ? 'probleem' : 'problemen'}`,
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = uitvoeren();
}
