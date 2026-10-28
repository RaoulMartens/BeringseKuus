// Poortcontrole: de poort zelf is niet verzwakt (bouwgids 14.1 en 14.2).
//
// noInlineConfig en de andere controles beschermen de broncode, maar niet hun eigen instellingen: een pull
// request kan een regel uitzetten in eslint.config.mjs, strict uitzetten in tsconfig.json of een stap uit het
// check-script halen. Deze controle toetst de werkelijke instellingen aan het minimum uit hoofdstuk 14, en laat
// ESLint drie foute voorbeelden lezen die moeten worden afgekeurd.
//
// Grens (review PR1-03): een pull request kan ook dit bestand wijzigen. Deze controle maakt een verzwakking
// zichtbaar en dwingt af dat ze bewust gebeurt; ze vervangt de review niet. Een wijziging aan de poort hoort in
// een aparte, gemotiveerde wijziging van hoofdstuk 14 (zie het PR-sjabloon).
//
// Gebruik:   node scripts/controleer-poort.ts [--root pad]
// Uitkomst:  "0 problemen" en exitcode 0, of een lijst en exitcode 1.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ESLint } from 'eslint';

const STRICT_FAMILIE = [
  'noImplicitAny',
  'strictNullChecks',
  'strictFunctionTypes',
  'strictBindCallApply',
  'strictPropertyInitialization',
  'noImplicitThis',
  'alwaysStrict',
  'useUnknownInCatchVariables',
];

const VERPLICHTE_STAPPEN = [
  'npm run typecheck',
  'npm run lint',
  'npm run format:check',
  'npm run controle:poort',
  'npm run controle:omwegen',
  'npm run test',
  'npm run test:db',
  'npm run build:worker',
  'npm run test:e2e',
  'npm run controle:overgeslagen',
];

const VERPLICHTE_REGELS = [
  '@typescript-eslint/no-explicit-any',
  '@typescript-eslint/ban-ts-comment',
  '@typescript-eslint/no-unsafe-assignment',
  '@typescript-eslint/no-unsafe-member-access',
  '@typescript-eslint/no-unsafe-call',
  '@typescript-eslint/no-unsafe-return',
  '@typescript-eslint/no-unsafe-argument',
];

/** tsconfig.json: strict, noUncheckedIndexedAccess, geen JavaScript buiten de typecontrole. */
export function controleerTsconfig(tsconfig: unknown): string[] {
  const opties = ((tsconfig as { compilerOptions?: unknown }).compilerOptions ?? {}) as Record<
    string,
    unknown
  >;
  const problemen: string[] = [];
  if (opties.strict !== true) problemen.push('tsconfig.json: "strict" moet true zijn');
  if (opties.noUncheckedIndexedAccess !== true)
    problemen.push('tsconfig.json: "noUncheckedIndexedAccess" moet true zijn');
  if (opties.allowJs === true) problemen.push('tsconfig.json: "allowJs" hoort uit; alle code is TypeScript');
  for (const naam of STRICT_FAMILIE) {
    if (opties[naam] === false)
      problemen.push(`tsconfig.json: "${naam}" mag niet uit staan (zet strict gedeeltelijk uit)`);
  }
  return problemen;
}

/** package.json: het check-script bevat alle stappen, alleen verbonden met &&, en de lint laat 0 waarschuwingen toe. */
export function controleerScripts(pakket: unknown): string[] {
  const scripts = ((pakket as { scripts?: unknown }).scripts ?? {}) as Record<string, unknown>;
  const tekst = (naam: string): string => (typeof scripts[naam] === 'string' ? scripts[naam] : '');
  const problemen: string[] = [];
  const basis = tekst('check:basis');
  if (/\|\||;|&(?!&)/.test(basis.replace(/&&/g, '')))
    problemen.push('package.json: check:basis mag alleen stappen met && verbinden');
  const stappen = basis.split('&&').map((s) => s.trim());
  for (const stap of VERPLICHTE_STAPPEN) {
    if (!stappen.includes(stap)) problemen.push(`package.json: check:basis mist "${stap}"`);
  }
  if (tekst('check').trim() !== 'npm run check:basis && npm run controle:repo') {
    problemen.push('package.json: check moet precies "npm run check:basis && npm run controle:repo" zijn');
  }
  if (!/^eslint \. --max-warnings 0$/.test(tekst('lint').trim()))
    problemen.push('package.json: lint moet "eslint . --max-warnings 0" zijn');
  if (!/\btsc --noEmit\b/.test(tekst('typecheck')))
    problemen.push('package.json: typecheck moet tsc --noEmit draaien');
  if (!/\bvitest run\b/.test(tekst('test')) || !/node --test\b.*--test-reporter=tap/.test(tekst('test'))) {
    problemen.push('package.json: test moet vitest run en node --test met een TAP-rapport draaien');
  }
  if (tekst('test:e2e').trim() !== 'playwright test')
    problemen.push('package.json: test:e2e moet "playwright test" zijn');
  // De browsertests draaien tegen deze build; een andere build hier zou iets anders testen dan wat online gaat.
  if (tekst('build:worker').trim() !== 'opennextjs-cloudflare build')
    problemen.push('package.json: build:worker moet "opennextjs-cloudflare build" zijn');
  return problemen;
}

/** De workflow: alle stappen, de namenlijst alleen als geheim in de stap die hem nodig heeft, actions op een SHA. */
export function controleerWorkflow(tekst: string): string[] {
  const problemen: string[] = [];
  for (const nodig of ['npm run check:basis', 'npm run controle:repo', 'npm audit --audit-level=high']) {
    if (!tekst.includes(nodig)) problemen.push(`workflow check.yml: stap "${nodig}" ontbreekt`);
  }
  if (/continue-on-error/.test(tekst))
    problemen.push('workflow check.yml: continue-on-error is niet toegestaan');
  if (/vars\.VERBODEN_WOORDEN/.test(tekst))
    problemen.push(
      'workflow check.yml: de namenlijst mag geen gewone variabele zijn (die staat leesbaar in de log)',
    );
  if ((tekst.match(/secrets\.VERBODEN_WOORDEN/g) ?? []).length !== 1) {
    problemen.push(
      'workflow check.yml: de namenlijst hoort precies één keer, als geheim, in de stap van controle:repo',
    );
  }
  for (const m of tekst.matchAll(/uses:\s*([^\s#]+)/g)) {
    if (!/@[0-9a-f]{40}$/.test(m[1] ?? ''))
      problemen.push(`workflow check.yml: ${m[1] ?? '?'} staat niet vast op een volledige commit-SHA`);
  }
  return problemen;
}

/** Vitest en Playwright: .only maakt de run niet stilletjes kleiner. */
export function controleerTestinstellingen(vitest: string, playwright: string): string[] {
  const problemen: string[] = [];
  if (!/allowOnly:\s*false/.test(vitest)) problemen.push('vitest.config.ts: allowOnly moet false zijn');
  if (!/forbidOnly:\s*true/.test(playwright))
    problemen.push('playwright.config.ts: forbidOnly moet true zijn');
  return problemen;
}

const isFout = (instelling: unknown): boolean => {
  const niveau: unknown = Array.isArray(instelling) ? (instelling as unknown[])[0] : instelling;
  return niveau === 2 || niveau === 'error';
};

/** De werkelijke ESLint-instellingen, en drie foute voorbeelden die moeten worden afgekeurd. */
export async function controleerEslint(root: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: root });
  const problemen: string[] = [];
  for (const bestand of ['src/app/page.tsx', 'scripts/controleer-repo.ts']) {
    const config: unknown = await eslint.calculateConfigForFile(path.join(root, bestand));
    const c = (config ?? {}) as {
      rules?: Record<string, unknown>;
      linterOptions?: { noInlineConfig?: unknown };
    };
    for (const regel of VERPLICHTE_REGELS) {
      if (!isFout(c.rules?.[regel]))
        problemen.push(`ESLint (${bestand}): regel ${regel} staat niet op error`);
    }
    if (c.linterOptions?.noInlineConfig !== true)
      problemen.push(`ESLint (${bestand}): noInlineConfig moet aan staan`);
  }
  const uit = ['// eslint', 'disable-next-line no-console'].join('-');
  const voorbeelden = [
    { naam: 'expliciete any', code: 'export const x: any = 1;\n' },
    {
      naam: 'onveilige any uit JSON.parse',
      code: "const bron = JSON.parse('{}');\nexport const r: string = bron.bestaatNiet();\n",
    },
    { naam: 'regel uitzetten met commentaar', code: `${uit}\nexport const y: any = 2;\n` },
  ];
  for (const v of voorbeelden) {
    const [resultaat] = await eslint.lintText(v.code, { filePath: path.join(root, 'src', 'poortproef.ts') });
    const aantal = (resultaat?.errorCount ?? 0) + (resultaat?.warningCount ?? 0);
    if (aantal === 0) problemen.push(`ESLint keurt een fout voorbeeld goed: ${v.naam}`);
  }
  return problemen;
}

export async function controleerPoort(root: string): Promise<string[]> {
  const lees = (pad: string): string => readFileSync(path.join(root, pad), 'utf8');
  return [
    ...controleerTsconfig(JSON.parse(lees('tsconfig.json')) as unknown),
    ...controleerScripts(JSON.parse(lees('package.json')) as unknown),
    ...controleerWorkflow(lees('.github/workflows/check.yml')),
    ...controleerTestinstellingen(lees('vitest.config.ts'), lees('playwright.config.ts')),
    ...(await controleerEslint(root)),
  ];
}

async function uitvoeren(): Promise<number> {
  const argumenten = process.argv.slice(2);
  const i = argumenten.indexOf('--root');
  const root = path.resolve((i >= 0 ? argumenten[i + 1] : undefined) ?? '.');
  const problemen = await controleerPoort(root);
  if (problemen.length === 0) {
    console.log('controleer-poort: 0 problemen');
    return 0;
  }
  for (const p of problemen) console.error(`FOUT ${p}`);
  console.error(`controleer-poort: ${problemen.length} ${problemen.length === 1 ? 'probleem' : 'problemen'}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await uitvoeren();
}
