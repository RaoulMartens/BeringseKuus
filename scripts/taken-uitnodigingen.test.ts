import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { stuurUitnodigingen } from '../taken/worker.ts';

const echteFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = echteFetch;
});

const ENV = {
  SUPABASE_URL: 'https://db.example.test',
  SUPABASE_SECRET_KEY: 'geheim',
  POSTMARK_TOKEN: 'token',
  BERICHT_AFZENDER: 'Platform <platform@example.test>',
  BERICHT_ONDERTEKENING: 'Het bestuur',
  SITE_URL: 'https://platform.example.test',
};

interface Aanroep {
  url: string;
  methode: string;
  body: Record<string, unknown>;
}

interface Opdracht {
  id: number;
  lid_id: string;
  voornaam: string;
  email: string;
  account_id: string | null;
  account_email: string | null;
}

/** Bootst Supabase (oppakken, account, afronden) en Postmark na. Geeft alle aanroepen terug. */
function nabootsen(
  opdrachten: Opdracht[],
  opties: { accountStatus?: number; postmarkStatus?: number } = {},
): Aanroep[] {
  const aanroepen: Aanroep[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const adres = String(url);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    aanroepen.push({ url: adres, methode: init?.method ?? 'GET', body });
    if (adres.endsWith('/rpc/claim_uitnodigingen')) return Response.json(opdrachten);
    if (adres.endsWith('/rpc/uitnodiging_afronden')) return new Response(null, { status: 204 });
    if (adres.endsWith('/auth/v1/admin/users') && init?.method === 'POST') {
      return opties.accountStatus && opties.accountStatus !== 200
        ? new Response('{}', { status: opties.accountStatus })
        : Response.json({ id: 'account-nieuw' });
    }
    if (adres.includes('/auth/v1/admin/users/')) return Response.json({});
    if (adres.includes('postmarkapp.com'))
      return new Response('{}', { status: opties.postmarkStatus ?? 200 });
    throw new Error(`onverwachte aanroep: ${adres}`);
  }) as typeof fetch;
  return aanroepen;
}

const NIEUW: Opdracht = {
  id: 7,
  lid_id: 'lid-1',
  voornaam: 'Piet',
  email: 'piet@example.test',
  account_id: null,
  account_email: null,
};

const afronden = (aanroepen: Aanroep[]) => aanroepen.find((a) => a.url.endsWith('/rpc/uitnodiging_afronden'));
const mail = (aanroepen: Aanroep[]) => aanroepen.find((a) => a.url.includes('postmarkapp.com'));

test('uitnodigingen: zonder geheimen gebeurt er niets', async () => {
  const aanroepen = nabootsen([NIEUW]);
  assert.deepEqual(await stuurUitnodigingen({}), { verstuurd: 0, mislukt: 0 });
  assert.equal(aanroepen.length, 0);
});

test('uitnodigingen: een nieuw lid krijgt een account en een mail, en het account wordt vastgelegd', async () => {
  const aanroepen = nabootsen([NIEUW]);
  assert.deepEqual(await stuurUitnodigingen(ENV), { verstuurd: 1, mislukt: 0 });
  const account = aanroepen.find((a) => a.url.endsWith('/auth/v1/admin/users'));
  assert.deepEqual(account?.body, { email: 'piet@example.test', email_confirm: true });
  assert.equal(mail(aanroepen)?.body.To, 'piet@example.test');
  assert.match(String(mail(aanroepen)?.body.TextBody), /Beste Piet,/);
  assert.doesNotMatch(String(mail(aanroepen)?.body.TextBody), /nog geen e-mail als je wordt ingedeeld/);
  assert.deepEqual(afronden(aanroepen)?.body, {
    p_id: 7,
    p_status: 'verstuurd',
    p_auth_user_id: 'account-nieuw',
    p_fout: null,
  });
});

test('uitnodigingen: een testadres vangt de mail op, met [TEST] in het onderwerp', async () => {
  const aanroepen = nabootsen([NIEUW]);
  await stuurUitnodigingen({ ...ENV, BERICHT_TEST_ADRES: 'ik@example.test' });
  assert.equal(mail(aanroepen)?.body.To, 'ik@example.test');
  assert.match(String(mail(aanroepen)?.body.Subject), /^\[TEST\] /);
});

test('uitnodigingen: een account dat al bestaat maar een ander adres heeft, krijgt het nieuwe adres', async () => {
  const aanroepen = nabootsen([
    { ...NIEUW, account_id: 'account-oud', account_email: 'typfout@example.test' },
  ]);
  assert.deepEqual(await stuurUitnodigingen(ENV), { verstuurd: 1, mislukt: 0 });
  const gewijzigd = aanroepen.find((a) => a.url.endsWith('/auth/v1/admin/users/account-oud'));
  assert.equal(gewijzigd?.methode, 'PUT');
  assert.deepEqual(gewijzigd?.body, { email: 'piet@example.test', email_confirm: true });
  assert.equal(afronden(aanroepen)?.body.p_auth_user_id, 'account-oud');
});

test('uitnodigingen: een account met het goede adres wordt niet aangeraakt', async () => {
  const aanroepen = nabootsen([{ ...NIEUW, account_id: 'account-oud', account_email: 'PIET@example.test' }]);
  await stuurUitnodigingen(ENV);
  assert.equal(aanroepen.filter((a) => a.url.includes('/auth/v1/')).length, 0);
});

test('uitnodigingen: een account dat niet lukt geeft geen mail en laat de opdracht staan', async () => {
  const aanroepen = nabootsen([NIEUW], { accountStatus: 422 });
  assert.deepEqual(await stuurUitnodigingen(ENV), { verstuurd: 0, mislukt: 1 });
  assert.equal(mail(aanroepen), undefined);
  assert.deepEqual(afronden(aanroepen)?.body, {
    p_id: 7,
    p_status: 'wacht',
    p_auth_user_id: null,
    p_fout: 'account_422',
  });
});

test('uitnodigingen: een mislukte mail laat de opdracht staan, met het account wel vastgelegd', async () => {
  const aanroepen = nabootsen([NIEUW], { postmarkStatus: 500 });
  assert.deepEqual(await stuurUitnodigingen(ENV), { verstuurd: 0, mislukt: 1 });
  assert.deepEqual(afronden(aanroepen)?.body, {
    p_id: 7,
    p_status: 'wacht',
    p_auth_user_id: 'account-nieuw',
    p_fout: 'postmark_500',
  });
});

test('uitnodigingen: oppakken mislukt, dan mislukt de run', async () => {
  globalThis.fetch = (async () => new Response('stuk', { status: 500 })) as typeof fetch;
  await assert.rejects(stuurUitnodigingen(ENV), /uitnodigingen oppakken mislukt: 500/);
});
