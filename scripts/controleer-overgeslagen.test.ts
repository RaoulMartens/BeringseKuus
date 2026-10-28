// Tests voor scripts/controleer-overgeslagen.ts. Draaien met: npm run test

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
  beoordeel,
  controleerUitkomsten,
  leesNodeTap,
  leesPlaywright,
  leesVitest,
} from './controleer-overgeslagen.ts';

const opgeruimd: string[] = [];
const nieuweMap = (): string => {
  const map = mkdtempSync(path.join(tmpdir(), 'controleer-overgeslagen-'));
  opgeruimd.push(map);
  return map;
};

after(() => {
  for (const map of opgeruimd) rmSync(map, { recursive: true, force: true });
});

/** Draait node --test met het TAP-rapport op één testbestand en geeft het rapport terug. */
function tapVan(code: string): string {
  const map = nieuweMap();
  const bestand = path.join(map, 'voorbeeld.test.mjs');
  writeFileSync(bestand, code);
  // Zonder de omgeving van de buitenste testrunner, zodat dit een gewone, losse run is.
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', bestand], {
    encoding: 'utf8',
    env: { ...process.env, NODE_TEST_CONTEXT: undefined },
  });
  return r.stdout;
}

describe('node --test: overslaan op elke manier wordt gezien (review PR1-02)', () => {
  const kop = "import { test } from 'node:test';\n";

  it('een optie { skip: true }', () => {
    const u = leesNodeTap(
      tapVan(`${kop}test('a', { skip: true }, () => { throw new Error('rood'); });\ntest('b', () => {});\n`),
    );
    assert.equal(u.overgeslagen, 1);
    assert.notDeepEqual(beoordeel('node', u), []);
  });

  it('een andere naam voor test', () => {
    const alias = "import { test as proef } from 'node:test';\n";
    const u = leesNodeTap(
      tapVan(`${alias}proef${'.'}skip('a', () => { throw new Error('rood'); });\nproef('b', () => {});\n`),
    );
    assert.equal(u.overgeslagen, 1);
  });

  it('t.skip() binnen de test', () => {
    const u = leesNodeTap(tapVan(`${kop}test('a', (t) => { t.skip(); return; });\ntest('b', () => {});\n`));
    assert.equal(u.overgeslagen, 1);
  });

  it('een todo', () => {
    const u = leesNodeTap(tapVan(`${kop}test('a', { todo: true }, () => {});\n`));
    assert.equal(u.todo, 1);
    assert.notDeepEqual(beoordeel('node', u), []);
  });

  it('een gewone, groene run is goed', () => {
    const u = leesNodeTap(tapVan(`${kop}test('a', () => {});\ntest('b', () => {});\n`));
    assert.deepEqual(u, { tests: 2, overgeslagen: 0, todo: 0, mislukt: 0 });
    assert.deepEqual(beoordeel('node', u), []);
  });
});

describe('Vitest en Playwright', () => {
  it('Vitest: overgeslagen en todo tellen', () => {
    assert.notDeepEqual(
      beoordeel(
        'v',
        leesVitest({ numTotalTests: 3, numPendingTests: 1, numTodoTests: 0, numFailedTests: 0 }),
      ),
      [],
    );
    assert.notDeepEqual(
      beoordeel(
        'v',
        leesVitest({ numTotalTests: 3, numPendingTests: 0, numTodoTests: 1, numFailedTests: 0 }),
      ),
      [],
    );
    assert.deepEqual(
      beoordeel(
        'v',
        leesVitest({ numTotalTests: 3, numPendingTests: 0, numTodoTests: 0, numFailedTests: 0 }),
      ),
      [],
    );
  });

  it('Playwright: overgeslagen en wisselende tests tellen', () => {
    assert.notDeepEqual(
      beoordeel('p', leesPlaywright({ stats: { expected: 9, skipped: 1, unexpected: 0, flaky: 0 } })),
      [],
    );
    assert.notDeepEqual(
      beoordeel('p', leesPlaywright({ stats: { expected: 9, skipped: 0, unexpected: 0, flaky: 1 } })),
      [],
    );
    assert.deepEqual(
      beoordeel('p', leesPlaywright({ stats: { expected: 10, skipped: 0, unexpected: 0, flaky: 0 } })),
      [],
    );
  });

  it('Playwright: een test die groen is als hij faalt, telt als fout, hoe fail ook is geschreven (review PR14-03)', () => {
    const rapport = (expectedStatus: string) => ({
      stats: { expected: 1, skipped: 0, unexpected: 0, flaky: 0 },
      suites: [{ suites: [{ specs: [{ tests: [{ expectedStatus }] }] }] }],
    });
    assert.match(beoordeel('p', leesPlaywright(rapport('failed'))).join(), /groen als ze falen/);
    assert.deepEqual(beoordeel('p', leesPlaywright(rapport('passed'))), []);
  });

  it('nul tests en een onvolledig rapport zijn fout', () => {
    assert.notDeepEqual(
      beoordeel(
        'v',
        leesVitest({ numTotalTests: 0, numPendingTests: 0, numTodoTests: 0, numFailedTests: 0 }),
      ),
      [],
    );
    assert.notDeepEqual(beoordeel('v', leesVitest({})), []);
    assert.notDeepEqual(beoordeel('p', leesPlaywright({})), []);
  });
});

describe('controleerUitkomsten', () => {
  it('faalt als een rapport ontbreekt', () => {
    assert.equal(controleerUitkomsten(nieuweMap()).length, 3);
  });

  it('faalt op een kapot rapport', () => {
    const map = nieuweMap();
    writeFileSync(path.join(map, 'node.tap'), '# tests 1\n# skipped 0\n# todo 0\n# fail 0\n');
    writeFileSync(path.join(map, 'vitest.json'), '{kapot');
    writeFileSync(
      path.join(map, 'e2e.json'),
      JSON.stringify({ stats: { expected: 1, skipped: 0, unexpected: 0, flaky: 0 } }),
    );
    assert.deepEqual(controleerUitkomsten(map).length, 1);
  });

  it('is goed als alle drie rapporten schoon zijn', () => {
    const map = nieuweMap();
    writeFileSync(path.join(map, 'node.tap'), 'TAP version 13\n# tests 2\n# skipped 0\n# todo 0\n# fail 0\n');
    writeFileSync(
      path.join(map, 'vitest.json'),
      JSON.stringify({ numTotalTests: 4, numPendingTests: 0, numTodoTests: 0, numFailedTests: 0 }),
    );
    writeFileSync(
      path.join(map, 'e2e.json'),
      JSON.stringify({ stats: { expected: 10, skipped: 0, unexpected: 0, flaky: 0 } }),
    );
    assert.deepEqual(controleerUitkomsten(map), []);
  });
});
