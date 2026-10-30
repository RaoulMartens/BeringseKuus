import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bevestigInlogcode, type InlogStaat, stuurInlogcode } from './acties';

interface AuthFout {
  code: string;
  name: string;
  status?: number;
}
const auth = vi.hoisted(() => ({
  stuur: vi.fn<(invoer: unknown) => Promise<{ error: AuthFout | null }>>(),
  bevestig: vi.fn<(invoer: unknown) => Promise<{ error: AuthFout | null }>>(),
}));
vi.mock('@/lib/supabase/server', () => ({
  maakSupabase: () => Promise.resolve({ auth: { signInWithOtp: auth.stuur, verifyOtp: auth.bevestig } }),
}));
vi.mock('next/navigation', () => ({
  redirect: (pad: string): never => {
    throw new Error(`redirect:${pad}`);
  },
}));

const BEGIN: InlogStaat = { email: '', verstuurd: false, fout: null };
function formulier(email: string, code?: string): FormData {
  const data = new FormData();
  data.set('email', email);
  if (code !== undefined) data.set('code', code);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.stuur.mockResolvedValue({ error: null });
  auth.bevestig.mockResolvedValue({ error: null });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('inloggen met een mailcode', () => {
  it('maakt geen accounts aan en geeft voor een onbekend adres dezelfde buitenkant', async () => {
    const bekend = await stuurInlogcode(BEGIN, formulier(' Lid@EXAMPLE.COM '));
    expect(auth.stuur).toHaveBeenCalledWith({
      email: 'lid@example.com',
      options: { shouldCreateUser: false },
    });
    auth.stuur.mockResolvedValue({ error: { code: 'user_not_found', name: 'AuthApiError' } });
    const onbekend = await stuurInlogcode(BEGIN, formulier('onbekend@example.com'));
    expect(onbekend).toEqual({ ...bekend, email: 'onbekend@example.com' });
    expect(console.error).toHaveBeenCalledWith('inlogcode niet verstuurd: user_not_found');
  });

  it('weigert ongeldige en te lange adressen voordat de maildienst wordt aangeroepen', async () => {
    for (const adres of ['a@b', `${'a'.repeat(250)}@example.com`]) {
      expect((await stuurInlogcode(BEGIN, formulier(adres))).fout).toBe('adres');
    }
    expect(auth.stuur).not.toHaveBeenCalled();
  });

  it('weigert ongeldige codes voordat Supabase wordt aangeroepen', async () => {
    for (const code of ['', '12345', '12345678901', 'abc123']) {
      expect((await bevestigInlogcode(BEGIN, formulier('lid@example.com', code))).fout).toBe('vorm');
    }
    expect(auth.bevestig).not.toHaveBeenCalled();
  });

  it('bindt de cijfercode aan het genormaliseerde adres en logt alleen de foutsoort', async () => {
    auth.bevestig.mockResolvedValue({ error: { code: 'otp_expired', name: 'AuthApiError' } });
    const staat = await bevestigInlogcode(BEGIN, formulier(' LID@example.com ', ' 0012 3456 '));
    expect(auth.bevestig).toHaveBeenCalledWith({
      email: 'lid@example.com',
      token: '00123456',
      type: 'email',
    });
    expect(staat).toEqual({ email: 'lid@example.com', verstuurd: true, fout: 'code' });
    expect(console.error).toHaveBeenCalledWith('inlogcode niet geaccepteerd: otp_expired');
  });

  it('geeft bij te veel verificaties een melding om te wachten', async () => {
    auth.bevestig.mockResolvedValue({
      error: { code: 'over_request_rate_limit', name: 'AuthApiError', status: 429 },
    });
    expect((await bevestigInlogcode(BEGIN, formulier('lid@example.com', '00123456'))).fout).toBe('te-vaak');
  });

  it('gaat na een goede code altijd naar mijn account, ongeacht een meegestuurd doeladres', async () => {
    const data = formulier('lid@example.com', '00123456');
    data.set('redirect', 'https://example.org/elders');
    await expect(bevestigInlogcode(BEGIN, data)).rejects.toThrow('redirect:/mijn');
  });
});
