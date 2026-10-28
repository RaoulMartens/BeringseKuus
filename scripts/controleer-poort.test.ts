// Tests voor scripts/controleer-poort.ts. Draaien met: npm run test

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  controleerEslint,
  controleerPoort,
  controleerScripts,
  controleerTestinstellingen,
  controleerCompatibiliteitsdatum,
  controleerTsconfig,
  controleerUitrol,
  controleerUitrolBestanden,
  controleerUitrolPakket,
  controleerWranglerZonderBuild,
  controleerWorkflow,
  sparsePaden,
  UITROL_STARTBESTANDEN,
} from './controleer-poort.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lees = (pad: string): string => readFileSync(path.join(ROOT, pad), 'utf8');
const pakket = JSON.parse(lees('package.json')) as { scripts: Record<string, string> };
const workflow = lees('.github/workflows/check.yml');
const uitrol = lees('.github/workflows/uitrol.yml');
const uitrolPakket = JSON.parse(lees('uitrol/package.json')) as unknown;
const playwright = lees('playwright.config.ts');
const vitest = lees('vitest.config.ts');

describe('de poort van deze repository', () => {
  it(
    'voldoet aan het minimum, inclusief de werkelijke ESLint-instellingen',
    { timeout: 120000 },
    async () => {
      assert.deepEqual(await controleerPoort(ROOT), []);
    },
  );
});

describe('tsconfig', () => {
  it('faalt als strict of noUncheckedIndexedAccess uit staat', () => {
    assert.notDeepEqual(
      controleerTsconfig({ compilerOptions: { strict: false, noUncheckedIndexedAccess: true } }),
      [],
    );
    assert.notDeepEqual(controleerTsconfig({ compilerOptions: { strict: true } }), []);
  });

  it('faalt als een deel van strict apart wordt uitgezet', () => {
    assert.notDeepEqual(
      controleerTsconfig({
        compilerOptions: { strict: true, noUncheckedIndexedAccess: true, strictNullChecks: false },
      }),
      [],
    );
  });

  it('faalt als JavaScript buiten de typecontrole mag', () => {
    assert.notDeepEqual(
      controleerTsconfig({
        compilerOptions: { strict: true, noUncheckedIndexedAccess: true, allowJs: true },
      }),
      [],
    );
  });
});

describe('package.json', () => {
  const met = (wijziging: Record<string, string>): unknown => ({
    scripts: { ...pakket.scripts, ...wijziging },
  });

  it('faalt als een stap uit check:basis is gehaald', () => {
    const zonder = pakket.scripts['check:basis']?.replace(' && npm run controle:overgeslagen', '') ?? '';
    assert.notDeepEqual(controleerScripts(met({ 'check:basis': zonder })), []);
  });

  it('faalt als een stap mag mislukken', () => {
    const zacht = `${pakket.scripts['check:basis'] ?? ''} || true`;
    assert.notDeepEqual(controleerScripts(met({ 'check:basis': zacht })), []);
  });

  it('faalt als build:worker niet de OpenNext-build is', () => {
    assert.notDeepEqual(controleerScripts(met({ 'build:worker': 'next build' })), []);
    assert.notDeepEqual(controleerScripts(met({ 'build:worker': 'true' })), []);
  });

  it('faalt als de browsertests stil terug kunnen naar Node.js (review PR8-06)', () => {
    assert.notDeepEqual(controleerScripts(met({ 'preview:worker': 'next start' })), []);
    assert.notDeepEqual(controleerScripts(met({ build: 'next build && true' })), []);
  });

  it('faalt als een script uitrolt buiten de workflow (review PR8-11)', () => {
    assert.notDeepEqual(controleerScripts(met({ 'deploy:worker': 'opennextjs-cloudflare deploy' })), []);
    assert.notDeepEqual(controleerScripts(met({ snel: 'wrangler deploy' })), []);
  });

  it('faalt als lint waarschuwingen toelaat of controle:repo uit check verdwijnt', () => {
    assert.notDeepEqual(controleerScripts(met({ lint: 'eslint .' })), []);
    assert.notDeepEqual(controleerScripts(met({ check: 'npm run check:basis' })), []);
  });
});

describe('workflow', () => {
  it('faalt als de namenlijst een gewone variabele is', () => {
    assert.notDeepEqual(
      controleerWorkflow(workflow.replace('secrets.VERBODEN_WOORDEN', 'vars.VERBODEN_WOORDEN')),
      [],
    );
  });

  it('faalt als een stap mag mislukken of verdwijnt', () => {
    assert.notDeepEqual(controleerWorkflow(`${workflow}\n        continue-on-error: true\n`), []);
    assert.notDeepEqual(
      controleerWorkflow(workflow.replace('npm audit --audit-level=high', 'echo audit')),
      [],
    );
  });

  it('faalt als een action op een tag staat in plaats van een SHA', () => {
    assert.notDeepEqual(controleerWorkflow(`${workflow}\n      - uses: actions/checkout@v7\n`), []);
  });

  it('faalt als de audit van uitrol/ verdwijnt of de naam verandert', () => {
    assert.notDeepEqual(controleerWorkflow(workflow.replace('--prefix uitrol', '')), []);
    assert.notDeepEqual(controleerWorkflow(workflow.replace('name: check\n', 'name: poort\n')), []);
  });

  it('faalt als controle:repo het script uit de pull request draait (review F0-21)', () => {
    const uitPr = workflow.replace(
      'node "$RUNNER_TEMP/basis/controleer-repo.ts" --root .',
      'npm run controle:repo',
    );
    assert.notDeepEqual(controleerWorkflow(uitPr), []);
  });
});

describe('taken-Worker (review PR12-05 en PR12-06)', () => {
  const taak = (bestanden: Record<string, string>) => (pad: string) => bestanden[pad];
  const ALLEEN_TAAK = [{ pad: 'taken/worker.ts', nodeToegestaan: false }];
  const SPARSE = ['taken', 'src/taken/proef-taak.ts'];

  it('volgt de imports van deze repository en vindt geen problemen', () => {
    const leesAls = (pad: string): string | undefined => {
      try {
        return lees(pad);
      } catch {
        return undefined;
      }
    };
    assert.ok(sparsePaden(uitrol).includes('taken'));
    assert.deepEqual(controleerUitrolBestanden(UITROL_STARTBESTANDEN, leesAls, sparsePaden(uitrol)), []);
  });

  it('faalt als de code van de taken-Worker een pakket importeert: de uitrolstap installeert niets', () => {
    for (const regel of [
      "import { createClient } from '@supabase/supabase-js';",
      "import x from 'zod';",
      "const y = await import('node:fs');",
      "export { z } from 'next/server';",
    ]) {
      assert.notDeepEqual(
        controleerUitrolBestanden(ALLEEN_TAAK, taak({ 'taken/worker.ts': regel }), SPARSE),
        [],
        regel,
      );
    }
  });

  it('volgt imports door: een pakket of bestand buiten de sparse checkout, één stap verder (review F0-19)', () => {
    const start = "import { a } from '../src/taken/proef-taak.ts';";
    const viaPakket = taak({
      'taken/worker.ts': start,
      'src/taken/proef-taak.ts': "import { b } from '../lib/hulp.ts';",
      'src/lib/hulp.ts': "import { z } from 'zod';",
    });
    const meldingen = controleerUitrolBestanden(ALLEEN_TAAK, viaPakket, SPARSE);
    assert.ok(meldingen.some((m) => m.startsWith('src/lib/hulp.ts: staat niet in de sparse checkout')));
    assert.ok(meldingen.some((m) => m.includes('"zod"')));
    const goed = taak({ 'taken/worker.ts': start, 'src/taken/proef-taak.ts': 'export const a = 1;' });
    assert.deepEqual(controleerUitrolBestanden(ALLEEN_TAAK, goed, SPARSE), []);
  });

  it('staat node: alleen toe in de controle na afloop, niet in de Worker', () => {
    const online = [{ pad: 'scripts/controleer-online.ts', nodeToegestaan: true }];
    const bestanden = taak({ 'scripts/controleer-online.ts': "import { readFileSync } from 'node:fs';" });
    assert.deepEqual(controleerUitrolBestanden(online, bestanden, ['scripts/controleer-online.ts']), []);
  });

  it('eist dezelfde compatibility_date in beide Workers (review F0-19)', () => {
    assert.deepEqual(
      controleerCompatibiliteitsdatum(lees('wrangler.jsonc'), lees('taken/wrangler.jsonc')),
      [],
    );
    const ouder = lees('taken/wrangler.jsonc').replace(
      /"compatibility_date": "[^"]+"/,
      '"compatibility_date": "2025-01-01"',
    );
    assert.notDeepEqual(controleerCompatibiliteitsdatum(lees('wrangler.jsonc'), ouder), []);
  });

  it('faalt als een wrangler-configuratie een build-commando heeft: dat draait naast het token', () => {
    assert.deepEqual(controleerWranglerZonderBuild('wrangler.jsonc', lees('wrangler.jsonc')), []);
    const metBuild = lees('wrangler.jsonc').replace('{', '{\n  "build": { "command": "curl …" },');
    assert.notDeepEqual(controleerWranglerZonderBuild('wrangler.jsonc', metBuild), []);
  });

  it('faalt als het artefact van de bouwjob meer bevat dan .open-next/', () => {
    const meer = uitrol.replace(
      '            .open-next/\n',
      '            .open-next/\n            wrangler.jsonc\n',
    );
    assert.notDeepEqual(controleerUitrol(meer), []);
  });
});

describe('uitrol-workflow', () => {
  it('faalt als een van de sloten verdwijnt (review PR8-02)', () => {
    for (const slot of [
      "github.event.workflow_run.event == 'push' &&",
      'github.event.workflow_run.head_repository.full_name == github.repository &&',
    ]) {
      assert.ok(uitrol.includes(slot), slot);
      assert.notDeepEqual(controleerUitrol(uitrol.replace(slot, '')), []);
    }
  });

  it('faalt bij een handmatige start of een fork-trigger (review PR8-01)', () => {
    assert.notDeepEqual(controleerUitrol(uitrol.replace('on:\n', 'on:\n  workflow_dispatch:\n')), []);
    assert.notDeepEqual(controleerUitrol(`${uitrol}\n# pull_request_target\n`), []);
  });

  it('faalt als het token in de bouwjob komt of de uitroljob app-code draait (review PR8-03)', () => {
    const tokenInBouw = uitrol.replace(
      '      - name: Afhankelijkheden\n',
      '      - name: Afhankelijkheden\n        env:\n          T: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n',
    );
    assert.notDeepEqual(controleerUitrol(tokenInBouw), []);
    assert.notDeepEqual(controleerUitrol(uitrol.replace('npm ci --ignore-scripts', 'npm ci')), []);
    assert.notDeepEqual(controleerUitrol(`${uitrol}        run: npm run build:worker\n`), []);
  });

  it('faalt bij schrijfrechten', () => {
    assert.notDeepEqual(controleerUitrol(uitrol.replace('contents: read', 'contents: write')), []);
  });

  it('eist dezelfde wrangler in uitrol/ en alleen wrangler', () => {
    assert.deepEqual(controleerUitrolPakket(pakket, uitrolPakket), []);
    assert.notDeepEqual(controleerUitrolPakket(pakket, { devDependencies: { wrangler: '4.0.0' } }), []);
    const wrangler = (JSON.parse(lees('package.json')) as { devDependencies: Record<string, string> })
      .devDependencies.wrangler;
    assert.notDeepEqual(
      controleerUitrolPakket(pakket, { devDependencies: { wrangler, next: '16.4.3' } }),
      [],
    );
  });
});

describe('testinstellingen', () => {
  it('faalt als .only stilletjes mag', () => {
    assert.notDeepEqual(controleerTestinstellingen('allowOnly: true', 'forbidOnly: true'), []);
    assert.notDeepEqual(controleerTestinstellingen('allowOnly: false', 'forbidOnly: false'), []);
  });

  it('faalt als de browsertests niet tegen de Worker draaien (review PR8-06)', () => {
    assert.deepEqual(controleerTestinstellingen(vitest, playwright), []);
    const node = playwright.replace('`npm run preview:worker', '`npm run start');
    assert.notDeepEqual(controleerTestinstellingen(vitest, node), []);
    const hergebruik = playwright.replace('reuseExistingServer: false', 'reuseExistingServer: true');
    assert.notDeepEqual(controleerTestinstellingen(vitest, hergebruik), []);
  });

  it('faalt als de browsertests met grep of grepInvert worden gefilterd (review F0-09)', () => {
    const gefilterd = playwright.replace('forbidOnly: true', 'forbidOnly: true,\n  grepInvert: /csp/');
    assert.notDeepEqual(controleerTestinstellingen(vitest, gefilterd), []);
  });
});

describe('ESLint keurt de foute voorbeelden af (review PR1-03 en PR1-04)', () => {
  it(
    'geeft op deze repository geen problemen, dus de drie voorbeelden worden afgekeurd',
    { timeout: 120000 },
    async () => {
      assert.deepEqual(await controleerEslint(ROOT), []);
    },
  );
});
