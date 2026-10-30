import assert from 'node:assert/strict';
import { test } from 'node:test';

import { leesArgumenten } from './maak-lid-lokaal.ts';

test('leesArgumenten: alleen een adres geeft een gewoon lid met een standaardnaam', () => {
  assert.deepEqual(leesArgumenten(['iemand@example.com']), {
    email: 'iemand@example.com',
    voornaam: 'Test',
    achternaam: 'Lid',
    beheerder: false,
  });
});

test('leesArgumenten: --naam splitst in voornaam en achternaam, ook met een tussenvoegsel', () => {
  assert.deepEqual(leesArgumenten(['iemand@example.com', '--naam', 'Jan van Dijk']), {
    email: 'iemand@example.com',
    voornaam: 'Jan',
    achternaam: 'van Dijk',
    beheerder: false,
  });
});

test('leesArgumenten: --beheerder in elke volgorde', () => {
  const wens = leesArgumenten(['iemand@example.com', '--beheerder', '--naam', 'Jan Jansen']);
  assert.ok(!('fout' in wens));
  assert.equal(wens.beheerder, true);
  assert.equal(wens.achternaam, 'Jansen');
});

test('leesArgumenten weigert een ontbrekend of ongeldig adres', () => {
  for (const args of [[], ['geen-adres'], ['a@b'], ['een adres@example.com']]) {
    assert.ok('fout' in leesArgumenten(args), JSON.stringify(args));
  }
});

test('leesArgumenten weigert een onbekende optie, een lege naam en één woord als naam', () => {
  for (const args of [
    ['iemand@example.com', '--onbekend'],
    ['iemand@example.com', '--naam'],
    ['iemand@example.com', '--naam', '--beheerder'],
    ['iemand@example.com', '--naam', 'Jan'],
    ['iemand@example.com', '--naam', '   '],
  ]) {
    assert.ok('fout' in leesArgumenten(args), JSON.stringify(args));
  }
});
