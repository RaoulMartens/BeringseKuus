import assert from 'node:assert/strict';
import { test } from 'node:test';

import { verstuurMail, type Verstuurder } from './nodig-leden-uit.ts';
import {
  geldigAdres,
  kiesOntvangers,
  leesArgumenten,
  maakUitnodiging,
  type LidVoorUitnodiging,
} from './uitnodiging.ts';

const BASIS = ['--van', 'afzender@example.com', '--ondertekening', 'Piet Voorbeeld, voorzitter'];

test('leesArgumenten: een test naar één adres, of alle leden, met een afzender en een ondertekening', () => {
  const test1 = leesArgumenten([...BASIS, '--test', 'ik@example.com']);
  assert.ok(!('fout' in test1));
  if ('fout' in test1) return;
  assert.equal(test1.test, 'ik@example.com');
  assert.equal(test1.alle, false);
  assert.equal(test1.doorvoeren, false);
  assert.equal(test1.voornaam, 'Kuus');

  const alle = leesArgumenten([...BASIS, '--alle', '--ja', '--antwoord', 'reactie@example.com']);
  assert.ok(!('fout' in alle));
  if ('fout' in alle) return;
  assert.equal(alle.alle, true);
  assert.equal(alle.doorvoeren, true);
  assert.equal(alle.antwoordAan, 'reactie@example.com');
});

test('leesArgumenten: weigert wat onduidelijk of gevaarlijk is', () => {
  for (const slecht of [
    [...BASIS],
    [...BASIS, '--test', 'ik@example.com', '--alle'],
    [...BASIS, '--test', 'geen-adres'],
    [...BASIS, '--test', 'ik@example.com', '--ja'],
    ['--van', 'geen-adres', '--ondertekening', 'x', '--alle'],
    ['--van', 'afzender@example.com', '--alle'],
    [...BASIS, '--alle', '--site', 'http://onveilig.example'],
    [...BASIS, '--alle', '--site', 'https://voorbeeld.nl/pad'],
    [...BASIS, '--alle', '--onbekend'],
    [...BASIS, '--alle', '--antwoord'],
  ]) {
    assert.ok('fout' in leesArgumenten(slecht), slecht.join(' '));
  }
});

test('leesArgumenten: één echte uitnodiging aan één adres vraagt een voornaam en laat geen mengvormen toe', () => {
  const goed = leesArgumenten([...BASIS, '--aan', 'rick@example.com', '--voornaam', 'Rick']);
  assert.ok(!('fout' in goed));
  if ('fout' in goed) return;
  assert.equal(goed.aan, 'rick@example.com');
  assert.equal(goed.test, null);
  assert.equal(goed.alle, false);
  assert.equal(goed.voornaam, 'Rick');
  for (const slecht of [
    [...BASIS, '--aan', 'rick@example.com'],
    [...BASIS, '--aan', 'geen-adres', '--voornaam', 'Rick'],
    [...BASIS, '--aan', 'rick@example.com', '--voornaam', 'Rick', '--alle'],
    [...BASIS, '--aan', 'rick@example.com', '--voornaam', 'Rick', '--test', 'ik@example.com'],
    [...BASIS, '--aan', 'rick@example.com', '--voornaam', 'Rick', '--ja'],
  ]) {
    assert.ok('fout' in leesArgumenten(slecht), slecht.join(' '));
  }
});

test('geldigAdres: gewone adressen wel, rommel niet', () => {
  assert.equal(geldigAdres('anna@example.com'), true);
  assert.equal(geldigAdres('anna.voorbeeld+kuus@example.com'), true);
  for (const slecht of [
    '',
    'anna',
    'anna@',
    '@example.com',
    'anna@example',
    'a b@example.com',
    'a@b@example.com',
    'a,b@example.com',
  ]) {
    assert.equal(geldigAdres(slecht), false, slecht);
  }
});

const lid = (extra: Partial<LidVoorUitnodiging> = {}): LidVoorUitnodiging => ({
  voornaam: 'Anna',
  email: 'anna@example.com',
  type: 'lid',
  actief: true,
  heeftAccount: true,
  alleenBeheer: false,
  ...extra,
});

test('kiesOntvangers: alleen actieve leden met een inlogaccount, geen externen en geen beheeraccounts', () => {
  const uit = kiesOntvangers([
    lid(),
    lid({ voornaam: 'Bert', email: 'bert@example.com', type: 'extern', heeftAccount: false }),
    lid({ voornaam: 'Carla', email: 'carla@example.com', actief: false }),
    lid({ voornaam: 'Dirk', email: 'dirk@example.com', heeftAccount: false }),
    lid({ voornaam: 'Els', email: 'els@example.com', alleenBeheer: true }),
    lid({ voornaam: 'Fay', email: 'fay@example.com' }),
  ]);
  assert.deepEqual(uit, [
    { voornaam: 'Anna', email: 'anna@example.com' },
    { voornaam: 'Fay', email: 'fay@example.com' },
  ]);
});

test('kiesOntvangers: elk adres één keer, hoofdletters tellen niet, een ongeldig adres wordt overgeslagen', () => {
  const uit = kiesOntvangers([
    lid(),
    lid({ voornaam: 'Anna twee', email: 'ANNA@example.com' }),
    lid({ voornaam: 'Kapot', email: 'geen-adres' }),
  ]);
  assert.deepEqual(uit, [{ voornaam: 'Anna', email: 'anna@example.com' }]);
});

test('maakUitnodiging: aanhef met de voornaam, de stappen, een tekstversie, en niets ongeoorloofds', () => {
  const mail = maakUitnodiging({
    voornaam: 'Anna',
    ondertekening: 'Piet Voorbeeld, voorzitter',
    site: 'https://voorbeeld.nl',
  });
  assert.match(mail.onderwerp, /^Het ledenplatform van de vereniging staat klaar/);
  assert.ok(mail.tekst.startsWith('Beste Anna,'));
  assert.match(mail.tekst, /1\. Ga naar https:\/\/voorbeeld\.nl/);
  assert.match(mail.tekst, /Piet Voorbeeld, voorzitter\n$/);
  assert.match(mail.html, /<a href="https:\/\/voorbeeld\.nl">/);
  assert.match(mail.html, /^<!doctype html>/);
  // een mail met alleen een code en een link: geen telpixel, geen afbeeldingen, geen scripts
  assert.doesNotMatch(mail.html, /<img|<script|<style/i);
});

test('maakUitnodiging: een testmail krijgt [TEST] in het onderwerp, en een naam wordt niet als HTML gelezen', () => {
  const test1 = maakUitnodiging({
    voornaam: 'A',
    ondertekening: 'B',
    site: 'https://voorbeeld.nl',
    test: true,
  });
  assert.ok(test1.onderwerp.startsWith('[TEST] '));
  const gevaarlijk = maakUitnodiging({
    voornaam: '<b>Anna</b>',
    ondertekening: 'x & y',
    site: 'https://voorbeeld.nl',
  });
  assert.ok(!gevaarlijk.html.includes('<b>Anna</b>'));
  assert.ok(gevaarlijk.html.includes('&lt;b&gt;Anna&lt;/b&gt;'));
  assert.ok(gevaarlijk.html.includes('x &amp; y'));
});

test('verstuurMail: stuurt naar Postmark met tekst en HTML, zonder tracking, en meldt een fout zonder adres', async () => {
  const verzoeken: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const goed: Verstuurder = async (url, init) => {
    verzoeken.push({ url, headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const mail = maakUitnodiging({ voornaam: 'Anna', ondertekening: 'Piet', site: 'https://voorbeeld.nl' });
  const uitkomst = await verstuurMail(
    'anna@example.com',
    mail,
    { van: 'afzender@example.com', antwoordAan: 'reactie@example.com' },
    'geheim',
    goed,
  );
  assert.equal(uitkomst, null);
  const eerste = verzoeken[0];
  assert.ok(eerste);
  assert.equal(eerste.url, 'https://api.postmarkapp.com/email');
  assert.equal(eerste.headers['X-Postmark-Server-Token'], 'geheim');
  assert.equal(eerste.body.To, 'anna@example.com');
  assert.equal(eerste.body.From, 'afzender@example.com');
  assert.equal(eerste.body.ReplyTo, 'reactie@example.com');
  assert.equal(eerste.body.TrackOpens, false);
  assert.equal(eerste.body.TrackLinks, 'None');
  assert.equal(typeof eerste.body.TextBody, 'string');
  assert.equal(typeof eerste.body.HtmlBody, 'string');

  const kapot: Verstuurder = async () => ({
    ok: false,
    status: 422,
    json: async () => ({ ErrorCode: 300, Message: 'Invalid email request for anna@example.com' }),
  });
  const reden = await verstuurMail(
    'anna@example.com',
    mail,
    { van: 'afzender@example.com', antwoordAan: null },
    'geheim',
    kapot,
  );
  assert.equal(reden, 'Postmark 422 (code 300)');
  assert.ok(!reden?.includes('anna@example.com'));
});
