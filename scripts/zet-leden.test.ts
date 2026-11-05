import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { foutTekst, leesArgumenten, leesOnlineDoel, magBestand } from './zet-leden.ts';

test('foutTekst: code en melding; zonder code "onbekend", zonder melding alleen de code', () => {
  assert.equal(
    foutTekst({ code: '42501', message: 'permission denied for table groepen' }),
    '42501: permission denied for table groepen',
  );
  // Een foute sleutel heeft geen code: dan is de melding het enige houvast.
  assert.equal(foutTekst({ message: 'Invalid API key' }), 'onbekend: Invalid API key');
  assert.equal(foutTekst({ code: '42501', message: '  ' }), '42501');
  assert.equal(foutTekst({ code: null, message: null }), 'onbekend');
});

test('foutTekst: een lange melding wordt afgekapt', () => {
  assert.equal(foutTekst({ code: 'x', message: 'a'.repeat(500) }).length, 'x: '.length + 200);
});

test('leesArgumenten: een bestand, met of zonder --ja en --online, in elke volgorde', () => {
  assert.deepEqual(leesArgumenten(['lijst.leden.csv']), {
    bestand: 'lijst.leden.csv',
    online: false,
    doorvoeren: false,
  });
  assert.deepEqual(leesArgumenten(['--ja', 'lijst.leden.csv', '--online']), {
    bestand: 'lijst.leden.csv',
    online: true,
    doorvoeren: true,
  });
});

test('leesArgumenten: geen bestand, twee bestanden of een onbekende vlag geven het gebruik', () => {
  for (const argumenten of [[], ['--ja'], ['a.csv', 'b.csv'], ['a.csv', '--nu']]) {
    const uit = leesArgumenten(argumenten);
    assert.ok('fout' in uit, argumenten.join(' '));
    assert.match(uit.fout, /Gebruik: npm run leden:zet/);
  }
});

test('leesOnlineDoel: beide gegevens zijn nodig en het adres moet een Supabase-project zijn', () => {
  const goed = leesOnlineDoel({
    SUPABASE_URL: 'https://abcdefghij.supabase.co/',
    SUPABASE_SECRET_KEY: 'geheim',
  });
  assert.deepEqual(goed, { url: 'https://abcdefghij.supabase.co', sleutel: 'geheim', project: 'abcdefghij' });

  for (const omgeving of [
    {},
    { SUPABASE_URL: 'https://abcdefghij.supabase.co' },
    { SUPABASE_SECRET_KEY: 'geheim' },
    { SUPABASE_URL: ' ', SUPABASE_SECRET_KEY: 'geheim' },
  ]) {
    const uit = leesOnlineDoel(omgeving);
    assert.ok('fout' in uit);
    assert.match(uit.fout, /SUPABASE_URL en SUPABASE_SECRET_KEY/);
  }
});

test('leesOnlineDoel: een ander adres wordt geweigerd, en de melding noemt de sleutel niet', () => {
  for (const url of [
    'http://abcdefghij.supabase.co',
    'https://abcdefghij.supabase.co.kwaad.example',
    'https://kwaad.example/abcdefghij.supabase.co',
    'https://localhost:54321',
  ]) {
    const uit = leesOnlineDoel({ SUPABASE_URL: url, SUPABASE_SECRET_KEY: 'zeer-geheime-sleutel' });
    assert.ok('fout' in uit, url);
    assert.match(uit.fout, /geen adres van een Supabase-project/);
    assert.doesNotMatch(uit.fout, /zeer-geheime-sleutel/);
  }
});

test('magBestand: een symlink van buiten naar een bestand in de repository telt als binnen', () => {
  const map = mkdtempSync(path.join(tmpdir(), 'zet-leden-'));
  try {
    const repo = path.join(map, 'repo');
    const buiten = path.join(map, 'buiten');
    mkdirSync(repo);
    mkdirSync(buiten);
    writeFileSync(path.join(repo, 'README.md'), 'tekst');
    writeFileSync(path.join(repo, 'lijst.leden.csv'), 'tekst');
    symlinkSync(path.join(repo, 'README.md'), path.join(buiten, 'lijst.csv'));
    symlinkSync(path.join(repo, 'lijst.leden.csv'), path.join(buiten, 'goed.csv'));
    assert.match(magBestand(path.join(buiten, 'lijst.csv'), repo) ?? '', /niet \*\.leden\.csv/);
    // Het echte bestand heet wel *.leden.csv: dan negeert git het, wat de naam van de symlink ook is.
    assert.equal(magBestand(path.join(buiten, 'goed.csv'), repo), null);
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
});

test('magBestand: een bestand dat met twee punten begint, ligt gewoon in de map (CR-13)', () => {
  const map = mkdtempSync(path.join(tmpdir(), 'zet-leden-'));
  try {
    mkdirSync(path.join(map, '..lijsten'));
    writeFileSync(path.join(map, '..pilot.csv'), 'tekst');
    writeFileSync(path.join(map, '..lijsten', 'x.csv'), 'tekst');
    writeFileSync(path.join(map, '..pilot.leden.csv'), 'tekst');
    assert.match(magBestand(path.join(map, '..pilot.csv'), map) ?? '', /niet \*\.leden\.csv/);
    assert.match(magBestand(path.join(map, '..lijsten', 'x.csv'), map) ?? '', /niet \*\.leden\.csv/);
    assert.equal(magBestand(path.join(map, '..pilot.leden.csv'), map), null);
    // Een echte stap omhoog blijft buiten de repository.
    const binnen = path.join(map, 'repo');
    mkdirSync(binnen);
    assert.equal(magBestand(path.join(map, '..pilot.csv'), binnen), null);
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
});

test('magBestand: buiten de repository mag alles, binnen alleen een bestand dat git negeert', () => {
  assert.equal(magBestand('/ergens/anders/lijst.csv', '/projecten/repo'), null);
  assert.equal(magBestand('/projecten/repo/pilot.leden.csv', '/projecten/repo'), null);
  assert.match(magBestand('/projecten/repo/pilot.csv', '/projecten/repo') ?? '', /niet \*\.leden\.csv/);
  assert.match(magBestand('/projecten/repo/docs/lijst.csv', '/projecten/repo') ?? '', /niet \*\.leden\.csv/);
  // Een pad dat met de naam van de repository begint maar ernaast ligt, is geen binnenkant.
  assert.equal(magBestand('/projecten/repo-extra/lijst.csv', '/projecten/repo'), null);
});
