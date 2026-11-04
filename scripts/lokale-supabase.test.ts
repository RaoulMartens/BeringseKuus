import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { leesLokaleSupabase, uitStatus } from './lokale-supabase.ts';

const GOED = {
  API_URL: 'http://127.0.0.1:54321',
  PUBLISHABLE_KEY: 'publiceerbaar-voorbeeld',
  SECRET_KEY: 'geheim-voorbeeld',
  MAILPIT_URL: 'http://127.0.0.1:54324',
  STUDIO_URL: 'http://127.0.0.1:54323',
};

describe('uitStatus', () => {
  it('neemt de vier velden over', () => {
    assert.deepEqual(uitStatus(GOED), {
      apiUrl: GOED.API_URL,
      publishableKey: GOED.PUBLISHABLE_KEY,
      secretKey: GOED.SECRET_KEY,
      mailpitUrl: GOED.MAILPIT_URL,
    });
  });

  it('faalt als een veld ontbreekt of leeg is', () => {
    assert.throws(() => uitStatus({ ...GOED, SECRET_KEY: undefined }), /SECRET_KEY/);
    assert.throws(() => uitStatus({ ...GOED, PUBLISHABLE_KEY: '' }), /PUBLISHABLE_KEY/);
    assert.throws(() => uitStatus(null), /API_URL/);
  });

  it('weigert een adres dat niet op deze computer is', () => {
    assert.throws(
      () => uitStatus({ ...GOED, API_URL: 'https://voorbeeld.supabase.co' }),
      /niet naar deze computer/,
    );
    assert.throws(
      () => uitStatus({ ...GOED, MAILPIT_URL: 'http://127.0.0.1.voorbeeld.nl' }),
      /niet naar deze computer/,
    );
  });
});

describe('leesLokaleSupabase', () => {
  const json = JSON.stringify(GOED);

  it('leest de uitvoer van een gewone aanroep', () => {
    assert.equal(leesLokaleSupabase(() => json).apiUrl, GOED.API_URL);
  });

  it('negeert een regel tekst voor of na het JSON-blok', () => {
    assert.equal(
      leesLokaleSupabase(() => 'Stopped services: [a b]\n' + json + '\nWARN: iets').apiUrl,
      GOED.API_URL,
    );
  });

  it('leest de uitvoer ook als supabase status exitcode 1 geeft, zoals na supabase db reset', () => {
    const fout = Object.assign(new Error('Command failed'), { status: 1, stdout: json });
    assert.equal(
      leesLokaleSupabase(() => {
        throw fout;
      }).secretKey,
      GOED.SECRET_KEY,
    );
  });

  it('zegt wat te doen als er geen uitvoer is: de lokale Supabase draait niet', () => {
    const leeg = Object.assign(new Error('Command failed'), { status: 1, stdout: '' });
    assert.throws(
      () =>
        leesLokaleSupabase(() => {
          throw leeg;
        }),
      /npm run supabase:start/,
    );
    assert.throws(
      () =>
        leesLokaleSupabase(() => {
          throw new Error('geen stdout');
        }),
      /npm run supabase:start/,
    );
  });

  it('weigert nog steeds een adres dat niet op deze computer is, ook bij exitcode 1', () => {
    const buiten = JSON.stringify({ ...GOED, API_URL: 'https://voorbeeld.supabase.co' });
    assert.throws(
      () =>
        leesLokaleSupabase(() => {
          throw Object.assign(new Error('x'), { stdout: buiten });
        }),
      /niet naar deze computer/,
    );
  });
});
