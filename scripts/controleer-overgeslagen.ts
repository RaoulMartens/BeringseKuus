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

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface Uitkomst {
  tests: number;
  overgeslagen: number;
  todo: number;
  mislukt: number;
  /** Tests die groen zijn als ze falen (Playwright: met fail gemarkeerd, op welke manier ook; review PR14-03). */
  verwachtFalen?: number;
}

interface PlaywrightSuite {
  file?: string;
  suites?: PlaywrightSuite[];
  specs?: { tests?: { expectedStatus?: unknown }[] }[];
}

/** Telt de tests in het rapport die niet "passed" als verwachte uitkomst hebben, hoe fail ook is geschreven. */
function telVerwachtFalen(suites: PlaywrightSuite[]): number {
  let aantal = 0;
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        if (test.expectedStatus !== 'passed' && test.expectedStatus !== 'skipped') aantal += 1;
      }
    }
    aantal += telVerwachtFalen(suite.suites ?? []);
  }
  return aantal;
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
    verwachtFalen: telVerwachtFalen((inhoud as { suites?: PlaywrightSuite[] }).suites ?? []),
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
  if ((u.verwachtFalen ?? 0) > 0)
    problemen.push(`${naam}: ${u.verwachtFalen ?? 0} test(s) zijn groen als ze falen (gemarkeerd met fail)`);
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

/** Alle bestanden onder `begin` die aan het patroon voldoen, als pad ten opzichte van `basis` met /. */
function vindBestanden(begin: string, basis: string, patroon: RegExp): string[] {
  if (!existsSync(begin)) return [];
  const gevonden: string[] = [];
  const loop = (map: string): void => {
    for (const item of readdirSync(map, { withFileTypes: true })) {
      const volledig = path.join(map, item.name);
      if (item.isDirectory()) {
        if (item.name !== 'node_modules') loop(volledig);
      } else if (item.isFile() && patroon.test(item.name)) {
        gevonden.push(path.relative(basis, volledig).split(path.sep).join('/'));
      }
    }
  };
  loop(begin);
  return gevonden.sort();
}

/**
 * Een telling zegt dat er tests zijn gedraaid, niet dát ze alle testbestanden zijn. Een smaller include, een exclude of een filter
 * laat bestanden verdwijnen zonder dat iets als overgeslagen wordt gemeld; ook een instelling die we niet voorzien. Daarom het
 * bewijs achteraf: elk testbestand op schijf staat in het rapport van de runner (FX-07).
 */
export function controleerBestanden(map: string, root: string): string[] {
  const problemen: string[] = [];
  const lees = (bestand: string): unknown => {
    const pad = path.join(map, bestand);
    return existsSync(pad) ? (JSON.parse(readFileSync(pad, 'utf8')) as unknown) : undefined;
  };

  const vitest = lees('vitest.json') as { testResults?: { name?: unknown }[] } | undefined;
  if (vitest) {
    const gedraaid = new Set(
      (vitest.testResults ?? []).flatMap((r) =>
        typeof r.name === 'string' ? [path.relative(root, r.name).split(path.sep).join('/')] : [],
      ),
    );
    for (const bestand of vindBestanden(path.join(root, 'src'), root, /\.test\.tsx?$/)) {
      if (!gedraaid.has(bestand)) problemen.push(`Vitest (src/): ${bestand} is niet gedraaid`);
    }
  }

  const playwright = lees('e2e.json') as { suites?: PlaywrightSuite[] } | undefined;
  if (playwright) {
    // Het bestand staat in het rapport ten opzichte van de testmap (e2e/); een bestand dat in geen enkel project draait, ontbreekt.
    const gedraaid = new Set<string>();
    const verzamel = (suites: PlaywrightSuite[]): void => {
      for (const suite of suites) {
        if (typeof suite.file === 'string') gedraaid.add(suite.file.split('\\').join('/'));
        verzamel(suite.suites ?? []);
      }
    };
    verzamel(playwright.suites ?? []);
    for (const bestand of vindBestanden(path.join(root, 'e2e'), path.join(root, 'e2e'), /\.spec\.ts$/)) {
      if (!gedraaid.has(bestand)) problemen.push(`Playwright (e2e/): ${bestand} is niet gedraaid`);
    }
  }
  return problemen;
}

/** Controleert alle rapporten in de map; met `root` ook dat elk testbestand van Vitest en Playwright is gedraaid. */
export function controleerUitkomsten(map: string, root?: string): string[] {
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
  if (root !== undefined && problemen.length === 0) {
    try {
      problemen.push(...controleerBestanden(map, root));
    } catch {
      problemen.push('de rapporten zijn niet te vergelijken met de testbestanden op schijf');
    }
  }
  return problemen;
}

function uitvoeren(): number {
  const argumenten = process.argv.slice(2);
  const i = argumenten.indexOf('--map');
  const map = path.resolve((i >= 0 ? argumenten[i + 1] : undefined) ?? 'testuitkomsten');
  // De testbestanden staan naast de map met uitkomsten (de wortel van de repository).
  const problemen = controleerUitkomsten(map, path.dirname(map));
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
