import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';

import { leesAdres, leesProjectAdres, maakLink, vraagSleutel } from './maak-inloglink.ts';

const SLEUTEL = 'abcdefghijklmnopqrstuvwxyz0123456789';
const GEHEIM = 'sb_secret_testtesttest';

test('leesAdres accepteert een https-adres zonder pad en geeft alleen de oorsprong terug', () => {
  assert.equal(
    leesAdres('https://ledenplatform.voorbeeld.workers.dev', 'x'),
    'https://ledenplatform.voorbeeld.workers.dev',
  );
  assert.equal(leesAdres('  https://voorbeeld.nl/  ', 'x'), 'https://voorbeeld.nl');
});

test('leesAdres weigert http, een pad, gegevens en iets dat geen adres is', () => {
  for (const fout of [
    'http://voorbeeld.nl',
    'voorbeeld.nl',
    '',
    'https://voorbeeld.nl/pad',
    'https://voorbeeld.nl?x=1',
    'https://voorbeeld.nl/#a',
    'https://gebruiker:wachtwoord@voorbeeld.nl',
    'javascript:alert(1)',
  ]) {
    assert.throws(() => leesAdres(fout, 'x'), Error, fout);
  }
});

test('leesProjectAdres accepteert alleen een supabase.co-project', () => {
  assert.equal(
    leesProjectAdres('https://abcdefghijklmnopqrst.supabase.co'),
    'https://abcdefghijklmnopqrst.supabase.co',
  );
  for (const fout of [
    'https://voorbeeld.nl',
    'https://abcdefghijklmnopqrst.supabase.co.kwaad.nl',
    'https://kwaad.nl/abcdefghijklmnopqrst.supabase.co',
    'http://127.0.0.1:54321',
    'https://supabase.co',
  ]) {
    assert.throws(() => leesProjectAdres(fout), Error, fout);
  }
});

test('maakLink zet de sleutel in de bevestigpagina van de site', () => {
  assert.equal(
    maakLink('https://voorbeeld.nl', SLEUTEL),
    `https://voorbeeld.nl/auth/bevestigen?token_hash=${SLEUTEL}`,
  );
});

test('maakLink weigert een sleutel die er niet uitziet als een sleutel', () => {
  for (const fout of [
    '',
    'kort',
    'a b c d e f g h i j k l m n o p',
    'x'.repeat(300),
    `abc&evil=1${SLEUTEL}`,
  ]) {
    assert.throws(() => maakLink('https://voorbeeld.nl', fout), Error, fout);
  }
});

interface Ontvangen {
  methode?: string;
  pad?: string;
  apikey?: string | string[];
  autorisatie?: string;
  body: string;
}

/** Een nepserver die het verzoek bewaart en een vast antwoord geeft; de test krijgt het adres en wat er is binnengekomen. */
async function metNepserver(
  status: number,
  antwoord: string,
  toets: (adres: string, ontvangen: Ontvangen) => Promise<void>,
): Promise<void> {
  const ontvangen: Ontvangen = { body: '' };
  const server = createServer((verzoek, uit) => {
    verzoek.on('data', (stuk: Buffer) => (ontvangen.body += stuk.toString()));
    verzoek.on('end', () => {
      ontvangen.methode = verzoek.method;
      ontvangen.pad = verzoek.url;
      ontvangen.apikey = verzoek.headers.apikey;
      ontvangen.autorisatie = verzoek.headers.authorization;
      uit.statusCode = status;
      uit.end(antwoord);
    });
  });
  await new Promise<void>((klaar) => server.listen(0, '127.0.0.1', klaar));
  try {
    await toets(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, ontvangen);
  } finally {
    await new Promise<void>((klaar) => server.close(() => klaar()));
  }
}

test('vraagSleutel stuurt het goede verzoek en geeft de sleutel terug', async () => {
  await metNepserver(
    200,
    JSON.stringify({ hashed_token: SLEUTEL, action_link: 'https://niet.gebruiken/' }),
    async (adres, ontvangen) => {
      assert.equal(await vraagSleutel(adres, GEHEIM, 'lid@voorbeeld.nl'), SLEUTEL);
      assert.equal(ontvangen.methode, 'POST');
      assert.equal(ontvangen.pad, '/auth/v1/admin/generate_link');
      assert.equal(ontvangen.apikey, GEHEIM);
      assert.equal(ontvangen.autorisatie, `Bearer ${GEHEIM}`);
      assert.deepEqual(JSON.parse(ontvangen.body), { type: 'magiclink', email: 'lid@voorbeeld.nl' });
    },
  );
});

test('vraagSleutel leest de sleutel ook uit properties', async () => {
  await metNepserver(200, JSON.stringify({ properties: { hashed_token: SLEUTEL } }), async (adres) => {
    assert.equal(await vraagSleutel(adres, GEHEIM, 'lid@voorbeeld.nl'), SLEUTEL);
  });
});

async function foutmelding(status: number, antwoord: string): Promise<string> {
  let melding = '';
  await metNepserver(status, antwoord, async (adres) => {
    try {
      await vraagSleutel(adres, GEHEIM, 'lid@voorbeeld.nl');
    } catch (e) {
      melding = e instanceof Error ? e.message : '';
    }
  });
  return melding;
}

test('vraagSleutel meldt de reden van Supabase, maar nooit de sleutel of het adres', async () => {
  const melding = await foutmelding(404, JSON.stringify({ msg: 'User not found' }));
  assert.match(melding, /404/);
  assert.match(melding, /User not found/);
  assert.doesNotMatch(melding, /sb_secret/);
  assert.doesNotMatch(melding, /lid@voorbeeld\.nl/);
});

test('vraagSleutel gaat netjes om met een antwoord dat geen json is, of geen sleutel bevat', async () => {
  assert.match(await foutmelding(502, '<html>bad gateway</html>'), /502/);
  assert.match(await foutmelding(200, '{}'), /geen sleutel/);
  assert.match(await foutmelding(200, 'geen json'), /geen sleutel/);
});
