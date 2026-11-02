import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  type User,
} from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { beoordeelSessie } from './sessie-uitkomst';

// Een gebruiker met alleen wat deze logica nodig heeft; de rest van het type doet er hier niet toe.
const gebruiker = { id: 'u1', email: 'lid@example.com' } as User;

describe('beoordeelSessie', () => {
  it('een gebruiker zonder fout is ingelogd', () => {
    expect(beoordeelSessie({ user: gebruiker, error: null })).toEqual({ soort: 'ingelogd', gebruiker });
  });

  it('geen gebruiker en geen fout is geen sessie', () => {
    expect(beoordeelSessie({ user: null, error: null })).toEqual({ soort: 'geen_sessie' });
  });

  it('een ontbrekende sessie is geen storing', () => {
    expect(beoordeelSessie({ user: null, error: new AuthSessionMissingError() })).toEqual({
      soort: 'geen_sessie',
    });
  });

  it('een verlopen of ongeldig token is geen storing', () => {
    const fout = new AuthApiError('invalid JWT', 401, 'bad_jwt');
    expect(beoordeelSessie({ user: null, error: fout })).toEqual({ soort: 'geen_sessie' });
  });

  it('een netwerkfout is een storing, geen uitlog', () => {
    const fout = new AuthRetryableFetchError('fetch failed', 0);
    expect(beoordeelSessie({ user: null, error: fout })).toEqual({ soort: 'storing' });
  });

  it('een serverfout van Supabase Auth (5xx) is een storing', () => {
    const fout = new AuthRetryableFetchError('Bad gateway', 502);
    expect(beoordeelSessie({ user: null, error: fout })).toEqual({ soort: 'storing' });
  });
});
