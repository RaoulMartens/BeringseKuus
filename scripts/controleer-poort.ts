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

import { existsSync, readFileSync } from 'node:fs';
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
  'npm run controle:dbtypen',
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
  // De browsertests draaien tegen de Worker zoals hij online gaat (review PR8-06): build:worker maakt hem (en
  // roept daarvoor zelf `npm run build` aan), preview:worker start hem in workerd.
  const precies: Record<string, string> = {
    build: 'next build',
    'build:worker': 'opennextjs-cloudflare build',
    'preview:worker': 'opennextjs-cloudflare preview',
  };
  for (const [naam, inhoud] of Object.entries(precies)) {
    if (tekst(naam).trim() !== inhoud) problemen.push(`package.json: ${naam} moet "${inhoud}" zijn`);
  }
  // Uitrollen gebeurt alleen in de workflow uitrol, na de poort (review PR8-11).
  for (const [naam, inhoud] of Object.entries(scripts)) {
    if (typeof inhoud === 'string' && /\bdeploy\b/.test(inhoud))
      problemen.push(`package.json: script ${naam} rolt uit; dat mag alleen de workflow uitrol`);
  }
  return problemen;
}

/** Elke action staat vast op een volledige commit-SHA, niet op een tag die kan verschuiven. */
function controleerShas(bestand: string, tekst: string): string[] {
  const problemen: string[] = [];
  for (const m of tekst.matchAll(/uses:\s*([^\s#]+)/g)) {
    if (!/@[0-9a-f]{40}$/.test(m[1] ?? ''))
      problemen.push(`workflow ${bestand}: ${m[1] ?? '?'} staat niet vast op een volledige commit-SHA`);
  }
  return problemen;
}

/** De workflow: alle stappen, de namenlijst alleen als geheim in de stap die hem nodig heeft, actions op een SHA. */
export function controleerWorkflow(tekst: string): string[] {
  const problemen: string[] = [];
  // controle:repo draait het script uit de basis, niet uit de pull request (review F0-21).
  for (const nodig of [
    'npm run check:basis',
    'BASIS: ${{ github.event.pull_request.base.sha || github.sha }}',
    'git show "$BASIS:scripts/controleer-repo.ts"',
    'node "$RUNNER_TEMP/basis/controleer-repo.ts" --root .',
  ]) {
    if (!tekst.includes(nodig)) problemen.push(`workflow check.yml: stap "${nodig}" ontbreekt`);
  }
  // Per hele regel: de audit van uitrol/ bevat de audit van de root als stuk tekst.
  for (const nodig of ['npm audit --audit-level=high', 'npm audit --audit-level=high --prefix uitrol']) {
    if (!tekst.split('\n').some((regel) => regel.trim() === `run: ${nodig}`))
      problemen.push(`workflow check.yml: stap "${nodig}" ontbreekt`);
  }
  if (!/^name: check$/m.test(tekst))
    problemen.push('workflow check.yml: de naam moet "check" zijn (de uitrol wacht op die naam)');
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
  problemen.push(...controleerShas('check.yml', tekst));
  return problemen;
}

/**
 * De uitrol (review PR8-01 t/m PR8-03): alleen na een groene check op een push naar main van deze repository,
 * geen handmatige start, het Cloudflare-token alleen in de job "uitrol", en die job draait geen installatiescripts.
 */
export function controleerUitrol(tekst: string): string[] {
  const problemen: string[] = [];
  const fout = (melding: string): void => {
    problemen.push(`workflow uitrol.yml: ${melding}`);
  };
  for (const verboden of ['pull_request_target', 'workflow_dispatch', 'continue-on-error']) {
    if (tekst.includes(verboden)) fout(`${verboden} is niet toegestaan`);
  }
  for (const nodig of [
    'workflows: [check]',
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.event == 'push'",
    'github.event.workflow_run.head_repository.full_name == github.repository',
    "github.event.workflow_run.head_branch == 'main'",
    'npm ci --ignore-scripts',
    'scripts/controleer-online.ts',
  ]) {
    if (!tekst.includes(nodig)) fout(`"${nodig}" ontbreekt`);
  }
  if (/:\s*write\b/.test(tekst)) fout('het workflowtoken mag nergens schrijfrechten krijgen');
  const jobUitrol = tekst.indexOf('\n  uitrol:\n');
  const geheimen = [...tekst.matchAll(/secrets\.([A-Z_]+)/g)];
  if (geheimen.length !== 1 || geheimen[0]?.[1] !== 'CLOUDFLARE_API_TOKEN')
    fout('alleen het geheim CLOUDFLARE_API_TOKEN, precies één keer');
  if (jobUitrol < 0 || geheimen.some((m) => (m.index ?? 0) < jobUitrol))
    fout('het Cloudflare-token hoort alleen in de job "uitrol", na de job "bouw"');
  if (jobUitrol >= 0 && /npm (ci|install)(?! --ignore-scripts)|npm run/.test(tekst.slice(jobUitrol)))
    fout('de job "uitrol" mag geen code van de app of installatiescripts draaien');
  // Uit de bouwjob komt alleen de gebouwde app; configuratie en de taken-Worker komen uit git (review PR12-05).
  const artefact = /upload-artifact[\s\S]*?path:\s*\|?\s*\n([\s\S]*?)\n\s*include-hidden-files/.exec(
    tekst,
  )?.[1];
  const paden = (artefact ?? '')
    .split('\n')
    .map((regel) => regel.trim())
    .filter((regel) => regel !== '' && !regel.startsWith('#'));
  if (paden.join(',') !== '.open-next/') fout('het artefact van de bouwjob mag alleen .open-next/ bevatten');
  problemen.push(...controleerShas('uitrol.yml', tekst));
  return problemen;
}

/** Wat de uitroljob zelf draait: de taken-Worker (bundelt wrangler) en de controle na afloop (draait node). */
export const UITROL_STARTBESTANDEN = [
  { pad: 'taken/worker.ts', nodeToegestaan: false },
  { pad: 'scripts/controleer-online.ts', nodeToegestaan: true },
] as const;

/** De paden uit de sparse checkout van de job "uitrol". */
export function sparsePaden(uitrol: string): string[] {
  const blok = /sparse-checkout:\s*\|\s*\n((?:[ \t]+\S.*\n)+)/.exec(uitrol)?.[1] ?? '';
  return blok
    .split('\n')
    .map((regel) => regel.trim())
    .filter((regel) => regel !== '' && !regel.startsWith('#'));
}

/**
 * De uitroljob heeft alleen een sparse checkout en geen node_modules (review PR12-06 en F0-19). Een import van een
 * pakket of van een eigen bestand buiten die checkout faalt dus pas bij het uitrollen, ná het samenvoegen: de
 * browsertests draaien met alles erbij en zien het niet. Daarom volgt deze controle vanaf elk startbestand alle
 * eigen imports, ook die van die bestanden zelf, en eist: geen pakketten (in scripts alleen node:), en elk bereikt
 * bestand staat in de sparse checkout.
 */
export function controleerUitrolBestanden(
  starts: readonly { pad: string; nodeToegestaan: boolean }[],
  lees: (pad: string) => string | undefined,
  sparse: string[],
): string[] {
  const problemen: string[] = [];
  const importen = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;
  const inSparse = (pad: string): boolean => sparse.some((p) => pad === p || pad.startsWith(`${p}/`));
  for (const start of starts) {
    const gezien = new Set<string>();
    const teDoen = [start.pad];
    while (teDoen.length > 0) {
      const pad = teDoen.pop() ?? '';
      if (gezien.has(pad)) continue;
      gezien.add(pad);
      const tekst = lees(pad);
      if (tekst === undefined) {
        problemen.push(`${pad}: bestaat niet (geïmporteerd vanuit ${start.pad})`);
        continue;
      }
      if (!inSparse(pad))
        problemen.push(`${pad}: staat niet in de sparse checkout van de job "uitrol" (uitrol.yml)`);
      for (const m of tekst.matchAll(importen)) {
        const bron = m[1] ?? '';
        if (bron.startsWith('./') || bron.startsWith('../')) {
          teDoen.push(path.posix.join(path.posix.dirname(pad), bron));
        } else if (!(start.nodeToegestaan && bron.startsWith('node:'))) {
          problemen.push(
            `${pad}: importeert "${bron}"; de uitroljob installeert geen pakketten (bereikt vanuit ${start.pad})`,
          );
        }
      }
    }
  }
  return problemen;
}

/** Beide Workers draaien op dezelfde versie van het platform (review F0-19). */
export function controleerCompatibiliteitsdatum(app: string, taken: string): string[] {
  const datum = (tekst: string): string | undefined =>
    /"compatibility_date"\s*:\s*"([^"]+)"/.exec(tekst)?.[1];
  return datum(app) !== undefined && datum(app) === datum(taken)
    ? []
    : ['wrangler.jsonc en taken/wrangler.jsonc: compatibility_date moet in beide gelijk zijn'];
}

/** Een build-commando in een wrangler-configuratie draait bij het uitrollen, naast het token (review PR12-05). */
export function controleerWranglerZonderBuild(pad: string, tekst: string): string[] {
  return /"build"\s*:/.test(tekst)
    ? [`${pad}: een "build"-commando draait bij het uitrollen; niet toegestaan`]
    : [];
}

/** uitrol/package.json heeft alleen wrangler, in dezelfde versie als waarmee de poort test. */
export function controleerUitrolPakket(pakket: unknown, uitrolPakket: unknown): string[] {
  const versie = (p: unknown): unknown =>
    ((p as { devDependencies?: Record<string, unknown> }).devDependencies ?? {}).wrangler;
  const u = uitrolPakket as { dependencies?: unknown; devDependencies?: Record<string, unknown> };
  const problemen: string[] = [];
  if (versie(pakket) === undefined || versie(pakket) !== versie(uitrolPakket))
    problemen.push('uitrol/package.json: wrangler moet dezelfde versie hebben als in package.json');
  if (u.dependencies !== undefined || Object.keys(u.devDependencies ?? {}).join() !== 'wrangler')
    problemen.push('uitrol/package.json: alleen wrangler, niets anders');
  return problemen;
}

/** Vitest en Playwright: .only maakt de run niet stilletjes kleiner; de browsertests draaien tegen de Worker. */
export function controleerTestinstellingen(vitest: string, playwright: string): string[] {
  const problemen: string[] = [];
  if (!/allowOnly:\s*false/.test(vitest)) problemen.push('vitest.config.ts: allowOnly moet false zijn');
  if (!/forbidOnly:\s*true/.test(playwright))
    problemen.push('playwright.config.ts: forbidOnly moet true zijn');
  if (!playwright.includes('`npm run preview:worker'))
    problemen.push('playwright.config.ts: de browsertests moeten de Worker starten (npm run preview:worker)');
  // Bij elke server (de app en de taken-Worker): nooit een al draaiende, mogelijk oude server hergebruiken.
  const hergebruik = [...playwright.matchAll(/reuseExistingServer:\s*([^,\s}]+)/g)].map((m) => m[1]);
  if (hergebruik.length === 0 || hergebruik.some((waarde) => waarde !== 'false'))
    problemen.push('playwright.config.ts: reuseExistingServer moet bij elke server false zijn');
  // Een filter in de instellingen maakt de run stilletjes kleiner (review F0-09).
  if (/\bgrep(?:Invert)?\s*:/.test(playwright))
    problemen.push('playwright.config.ts: grep en grepInvert zijn niet toegestaan');
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
  const leesAls = (pad: string): string | undefined =>
    existsSync(path.join(root, pad)) ? lees(pad) : undefined;
  return [
    ...controleerTsconfig(JSON.parse(lees('tsconfig.json')) as unknown),
    ...controleerScripts(JSON.parse(lees('package.json')) as unknown),
    ...controleerWorkflow(lees('.github/workflows/check.yml')),
    ...controleerUitrol(lees('.github/workflows/uitrol.yml')),
    ...controleerUitrolPakket(
      JSON.parse(lees('package.json')) as unknown,
      JSON.parse(lees('uitrol/package.json')) as unknown,
    ),
    ...controleerTestinstellingen(lees('vitest.config.ts'), lees('playwright.config.ts')),
    ...controleerUitrolBestanden(
      UITROL_STARTBESTANDEN,
      leesAls,
      sparsePaden(lees('.github/workflows/uitrol.yml')),
    ),
    ...controleerCompatibiliteitsdatum(lees('wrangler.jsonc'), lees('taken/wrangler.jsonc')),
    ...['wrangler.jsonc', 'taken/wrangler.jsonc'].flatMap((pad) =>
      controleerWranglerZonderBuild(pad, lees(pad)),
    ),
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
