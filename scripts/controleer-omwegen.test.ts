// Tests voor scripts/controleer-omwegen.ts. Draaien met: npm run test

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { controleerOmwegen } from './controleer-omwegen.ts';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'controleer-omwegen.ts');
const opgeruimd: string[] = [];

function maakRepo(bestanden: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'controleer-omwegen-'));
  opgeruimd.push(root);
  for (const [pad, inhoud] of Object.entries(bestanden)) {
    const volledig = path.join(root, pad);
    mkdirSync(path.dirname(volledig), { recursive: true });
    writeFileSync(volledig, inhoud);
  }
  return root;
}

// De patronen worden hier in stukken opgebouwd, zodat dit testbestand ze zelf niet letterlijk bevat.
const ESLINT_UIT = ['// eslint', 'disable-next-line no-console'].join('-');
const TS_NEGEREN = ['// @ts', 'ignore'].join('-');
const TS_VERWACHT = ['// @ts', 'expect-error'].join('-');
const TS_NIET = ['// @ts', 'nocheck'].join('-');
const ALLEEN = `${['test', 'only'].join('.')}('a', () => {});`;
const OVERSLAAN = `${['describe', 'skip'].join('.')}('b', () => {});`;
const PLAYWRIGHT_OVERSLAAN = `${['test', 'describe', 'skip'].join('.')}('c', () => {});`;
const LATER = `${['it', 'todo'].join('.')}('d');`;

after(() => {
  for (const root of opgeruimd) rmSync(root, { recursive: true, force: true });
});

describe('controleer-omwegen', () => {
  it('geeft 0 problemen op gewone code', () => {
    assert.deepEqual(
      controleerOmwegen(
        maakRepo({ 'src/a.ts': 'export const a = 1;\n', 'scripts/b.mjs': 'console.log(1);\n' }),
      ),
      [],
    );
  });

  it('faalt op eslint-disable, ook in een .mjs-script', () => {
    const res = controleerOmwegen(maakRepo({ 'scripts/b.mjs': `${ESLINT_UIT}\nconsole.log(1);\n` }));
    assert.deepEqual(
      res.map((p) => [p.pad, p.regelnummer]),
      [['scripts/b.mjs', 1]],
    );
  });

  it('faalt op het negeren van typefouten', () => {
    assert.equal(
      controleerOmwegen(maakRepo({ 'src/a.ts': `${TS_NEGEREN}\n${TS_VERWACHT}\n${TS_NIET}\n` })).length,
      3,
    );
  });

  it('faalt op .only, .skip, .todo, ook in een geketende aanroep', () => {
    assert.equal(
      controleerOmwegen(
        maakRepo({ 'e2e/a.spec.ts': `${ALLEEN}\n${OVERSLAAN}\n${PLAYWRIGHT_OVERSLAAN}\n${LATER}\n` }),
      ).length,
      4,
    );
  });

  it('kijkt alleen naar code, niet naar documentatie', () => {
    assert.deepEqual(
      controleerOmwegen(maakRepo({ 'docs/regels.md': `Geen ${ESLINT_UIT} en geen ${ALLEEN}\n` })),
      [],
    );
  });

  it('laat woorden toe die er alleen op lijken', () => {
    assert.deepEqual(
      controleerOmwegen(
        maakRepo({ 'src/a.ts': 'const skipLink = true;\nconst onlyOnce = false;\nlijst.skip = 2;\n' }),
      ),
      [],
    );
  });

  it('geeft exitcode 1 met bestand en regelnummer op de opdrachtregel', () => {
    const r = spawnSync(
      process.execPath,
      [SCRIPT, '--root', maakRepo({ 'src/a.ts': `export const a = 1;\n${TS_NEGEREN}\n` })],
      { encoding: 'utf8' },
    );
    assert.equal(r.status, 1);
    assert.match(r.stderr, /FOUT src\/a\.ts:2/);
  });

  it('geeft exitcode 0 op een goede repository', () => {
    const r = spawnSync(
      process.execPath,
      [SCRIPT, '--root', maakRepo({ 'src/a.ts': 'export const a = 1;\n' })],
      { encoding: 'utf8' },
    );
    assert.equal(r.status, 0);
    assert.match(r.stdout, /0 problemen/);
  });
});
