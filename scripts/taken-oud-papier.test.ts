import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { maakOudPapier } from '../taken/worker.ts';

const echteFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = echteFetch;
});

const ENV = { SUPABASE_URL: 'https://db.example.test', SUPABASE_SECRET_KEY: 'geheim' };

test('oud papier: zonder geheimen gebeurt er niets', async () => {
  let aangeroepen = false;
  globalThis.fetch = (async () => {
    aangeroepen = true;
    return new Response('0');
  }) as typeof fetch;
  assert.equal(await maakOudPapier({}), 0);
  assert.equal(aangeroepen, false);
});

test('oud papier: roept de databasefunctie aan en geeft het aantal terug', async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response('4', { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  assert.equal(await maakOudPapier(ENV), 4);
  assert.deepEqual(urls, ['https://db.example.test/rest/v1/rpc/oud_papier_aanmaken']);
});

test('oud papier: een fout van de database laat de run mislukken', async () => {
  globalThis.fetch = (async () => new Response('stuk', { status: 500 })) as typeof fetch;
  await assert.rejects(maakOudPapier(ENV), /oud papier aanmaken mislukt: 500/);
});
