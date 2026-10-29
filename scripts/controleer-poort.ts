// Poortcontrole: de poort zelf is niet verzwakt (bouwgids 14.1 en 14.2).
//
// noInlineConfig en de andere controles beschermen de broncode, maar niet hun eigen instellingen: een pull
// request kan een regel uitzetten in eslint.config.mjs, strict uitzetten in tsconfig.json of een stap uit het
// check-script halen. Deze controle toetst de werkelijke instellingen aan het minimum uit hoofdstuk 14, en laat
// ESLint foute voorbeelden lezen die moeten worden afgekeurd.
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
  // Commentaar telt niet mee (review PR14-01): alleen regels die de workflow echt uitvoert.
  const code = tekst
    .split('\n')
    .filter((regel) => !regel.trim().startsWith('#'))
    .join('\n');
  // controle:repo draait het script uit main, vóór alle code uit de pull request (review F0-21, PR14-01).
  const repoStap = 'node "$RUNNER_TEMP/basis/controleer-repo.ts" --root .';
  for (const nodig of [
    'npm run check:basis',
    'git fetch --no-tags --depth=1 origin main',
    'git show FETCH_HEAD:scripts/controleer-repo.ts',
    repoStap,
  ]) {
    if (!code.includes(nodig)) problemen.push(`workflow check.yml: stap "${nodig}" ontbreekt`);
  }
  const eersteCode = Math.min(
    ...['npm ci', 'npm run', 'npx '].map((s) => code.indexOf(s)).filter((i) => i >= 0),
  );
  if (code.indexOf(repoStap) < 0 || code.indexOf(repoStap) > eersteCode)
    problemen.push('workflow check.yml: controle:repo moet draaien vóór npm ci en de poort');
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
  // De jobs staan in deze volgorde: bouw, migraties, uitrol. Elk geheim hoort in precies één job (review PR8-03).
  const jobMigraties = tekst.indexOf('\n  migraties:\n');
  const jobUitrol = tekst.indexOf('\n  uitrol:\n');
  if (jobMigraties < 0 || jobUitrol < 0 || jobMigraties > jobUitrol)
    fout('de jobs "migraties" en "uitrol" ontbreken, of staan in de verkeerde volgorde');
  const geheimen = [...tekst.matchAll(/secrets\.([A-Z_]+)/g)];
  const toegestaan: Record<string, [number, number]> = {
    SUPABASE_DB_URL: [jobMigraties, jobUitrol],
    CLOUDFLARE_API_TOKEN: [jobUitrol, tekst.length],
  };
  for (const naam of Object.keys(toegestaan)) {
    if (geheimen.filter((m) => m[1] === naam).length !== 1)
      fout(`het geheim ${naam} hoort er precies één keer in`);
  }
  for (const m of geheimen) {
    const [van, tot] = toegestaan[m[1] ?? ''] ?? [-1, -1];
    const plek = m.index ?? 0;
    if (van < 0 || plek < van || plek > tot)
      fout(
        `het geheim ${m[1] ?? '?'} staat niet (alleen) in zijn eigen job: SUPABASE_DB_URL in "migraties", CLOUDFLARE_API_TOKEN in "uitrol"`,
      );
  }
  if (jobUitrol >= 0 && /npm (ci|install)(?! --ignore-scripts)|npm run/.test(tekst.slice(jobUitrol)))
    fout('de job "uitrol" mag geen code van de app of installatiescripts draaien');
  // De job "migraties" draait alleen de Supabase-CLI op de map supabase/ (besluit 29-10-2026).
  if (jobMigraties >= 0 && jobUitrol > jobMigraties) {
    const migraties = tekst.slice(jobMigraties, jobUitrol);
    if (/\bnpm\b|\bnpx\b|\bnode\b|\bwrangler\b/.test(migraties.replace(/^\s*#.*$/gm, '')))
      fout('de job "migraties" mag geen code van de app, npm of wrangler draaien');
    if (sparsePaden(migraties).some((p) => !p.startsWith('supabase/')))
      fout('de job "migraties" mag alleen de map supabase/ uitchecken');
  }
  if (!/\n {4}needs: \[bouw, migraties\]\n/.test(tekst.slice(jobUitrol)))
    fout('de job "uitrol" moet wachten op "bouw" en "migraties" (needs: [bouw, migraties])');
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

/** De tekst van één job uit een workflow (van "  naam:" tot de volgende job); leeg als hij ontbreekt. */
export function jobTekst(workflow: string, job: string): string {
  const begin = workflow.indexOf(`\n  ${job}:\n`);
  if (begin < 0) return '';
  const rest = workflow.slice(begin + 1);
  const volgende = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  return volgende < 0 ? rest : rest.slice(0, volgende + 2);
}

/**
 * Wat de uitroljob zelf draait: de taken-Worker (bundelt wrangler; het startbestand komt uit "main" in
 * taken/wrangler.jsonc, review PR14-04) en de controle na afloop (draait node).
 */
export function uitrolStartbestanden(takenWrangler: string): { pad: string; nodeToegestaan: boolean }[] {
  const main = /"main"\s*:\s*"([^"]+)"/.exec(takenWrangler)?.[1] ?? 'worker.ts';
  return [
    { pad: path.posix.join('taken', main), nodeToegestaan: false },
    { pad: 'scripts/controleer-online.ts', nodeToegestaan: true },
  ];
}

/**
 * De paden uit de sparse checkout van de job "uitrol": de regels onder "sparse-checkout: |" die verder inspringen
 * dan de sleutel. Een uitsluiting (!) of een patroon (*, ?, [) telt niet als pad: dan kan de controle niet zeker
 * weten wat er wordt uitgecheckt, en keurt hij een bestand daaronder af (veilige kant, review PR14-04).
 */
export function sparsePaden(uitrol: string): string[] {
  // Lees alleen het eerste blok; geef een workflow met meer jobs dus eerst door jobTekst.
  const regels = uitrol.split('\n');
  const begin = regels.findIndex((r) => /^\s*sparse-checkout:\s*\|-?\s*$/.test(r));
  if (begin < 0) return [];
  const inspringing = (r: string): number => r.length - r.trimStart().length;
  const sleutel = inspringing(regels[begin] ?? '');
  const paden: string[] = [];
  for (const regel of regels.slice(begin + 1)) {
    if (regel.trim() === '') continue;
    if (inspringing(regel) <= sleutel) break;
    const pad = regel.trim();
    if (!pad.startsWith('#') && !/[!*?[\]]/.test(pad)) paden.push(pad);
  }
  return paden;
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
      // Wat de controle niet kan volgen, mag niet (review PR14-04): een import met een berekend pad of backticks,
      // en require, ook via createRequire.
      if (/\bimport\s*\(\s*[^'"\s]/.test(tekst) || /\brequire\s*\(|\bcreateRequire\b/.test(tekst))
        problemen.push(
          `${pad}: een import die de poort niet kan volgen (berekend pad of require); gebruik een vaste import`,
        );
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

/**
 * De Data API maakt alleen public en graphql_public bereikbaar (supabase/config.toml). De rechtentests lopen alleen
 * over public; een extra schema zou buiten alle tests vallen (review PR14-02). Komt er een bij, pas dan eerst de
 * tests aan en daarna deze controle.
 */
export function controleerApiSchemas(config: string): string[] {
  const api = /^\[api\]\s*$([\s\S]*?)(?=^\[)/m.exec(config)?.[1] ?? '';
  const schemas = /^schemas\s*=\s*(\[[^\]]*\])/m.exec(api)?.[1]?.replace(/\s/g, '');
  return schemas === '["public","graphql_public"]'
    ? []
    : [
        'supabase/config.toml: [api] schemas moet precies ["public", "graphql_public"] zijn (de rechtentests dekken alleen public)',
      ];
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

/** De job "migraties" gebruikt dezelfde Supabase-CLI als de poort, die de migraties lokaal test. */
export function controleerSupabaseCli(pakket: unknown, uitrol: string): string[] {
  const lokaal = ((pakket as { devDependencies?: Record<string, unknown> }).devDependencies ?? {}).supabase;
  const online = /supabase\/setup-cli@[^\n]*\n\s*with:\s*\n\s*version:\s*([^\s#]+)/.exec(uitrol)?.[1];
  return typeof lokaal === 'string' && lokaal === online
    ? []
    : [
        'uitrol.yml: de Supabase-CLI in de job "migraties" moet dezelfde versie hebben als supabase in package.json',
      ];
}

/** Vitest en Playwright: .only maakt de run niet stilletjes kleiner; de browsertests draaien tegen de Worker. */
export function controleerTestinstellingen(vitest: string, playwright: string): string[] {
  const problemen: string[] = [];
  if (!/allowOnly:\s*false/.test(vitest)) problemen.push('vitest.config.ts: allowOnly moet false zijn');
  if (!/forbidOnly:\s*true/.test(playwright))
    problemen.push('playwright.config.ts: forbidOnly moet true zijn');
  if (!playwright.includes('`npm run preview:worker'))
    problemen.push('playwright.config.ts: de browsertests moeten de Worker starten (npm run preview:worker)');
  // Bij elke server: nooit een al draaiende, mogelijk oude server hergebruiken.
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

/** De werkelijke ESLint-instellingen, en foute voorbeelden die moeten worden afgekeurd. */
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
    // Een Supabase-client buiten src/lib/supabase/ zou ongetypeerd kunnen zijn (review PR14-08 en PR19-02): elke
    // vorm moet worden afgekeurd, niet alleen de eerste.
    {
      naam: 'Supabase-client uit @supabase/ssr buiten src/lib/supabase/',
      code: "import { createServerClient } from '@supabase/ssr';\nexport const maak = createServerClient;\n",
    },
    {
      naam: 'Supabase-client uit @supabase/supabase-js buiten src/lib/supabase/',
      code: "import { SupabaseClient } from '@supabase/supabase-js';\nexport const maak = SupabaseClient;\n",
    },
    {
      naam: 'Supabase met een dynamische import buiten src/lib/supabase/',
      code: "export const laad = () => import('@supabase/postgrest-js');\n",
    },
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
      uitrolStartbestanden(lees('taken/wrangler.jsonc')),
      leesAls,
      sparsePaden(jobTekst(lees('.github/workflows/uitrol.yml'), 'uitrol')),
    ),
    ...controleerSupabaseCli(
      JSON.parse(lees('package.json')) as unknown,
      lees('.github/workflows/uitrol.yml'),
    ),
    ...controleerCompatibiliteitsdatum(lees('wrangler.jsonc'), lees('taken/wrangler.jsonc')),
    ...controleerApiSchemas(lees('supabase/config.toml')),
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
