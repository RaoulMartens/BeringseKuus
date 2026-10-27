import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { uitStatus } from './lokale-supabase.ts';

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
