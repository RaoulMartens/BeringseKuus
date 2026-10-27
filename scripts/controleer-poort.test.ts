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
  controleerTsconfig,
  controleerWorkflow,
} from './controleer-poort.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lees = (pad: string): string => readFileSync(path.join(ROOT, pad), 'utf8');
const pakket = JSON.parse(lees('package.json')) as { scripts: Record<string, string> };
const workflow = lees('.github/workflows/check.yml');

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
});

describe('testinstellingen', () => {
  it('faalt als .only stilletjes mag', () => {
    assert.notDeepEqual(controleerTestinstellingen('allowOnly: true', 'forbidOnly: true'), []);
    assert.notDeepEqual(controleerTestinstellingen('allowOnly: false', 'forbidOnly: false'), []);
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
