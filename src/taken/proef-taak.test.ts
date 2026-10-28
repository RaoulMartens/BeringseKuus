// Tests voor de geplande proeftaak (proefroute 3). Eerst de volgorde van de taak met nagemaakte diensten, dan de
// echte diensten (maakDiensten) met een nagemaakte fetch: welke aanroepen naar Supabase en Resend er gaan. Het
// schrijven in een echte database testen e2e/geplande-taak.spec.ts en supabase/tests/database/proef_taak.test.sql.
import { describe, expect, it, vi } from 'vitest';

import { maakDiensten, minuutSleutel, type ProefTaakDiensten, voerProefTaakUit } from './proef-taak';

const MOMENT = new Date(Date.UTC(2026, 9, 28, 14, 7, 42));

function diensten(opties: { geclaimd?: boolean; berichtFaalt?: boolean } = {}) {
  const stappen: string[] = [];
  const nep: ProefTaakDiensten = {
    registreer: vi.fn((minuut: string, status: 'gelukt' | 'mislukt', melding?: string) => {
      stappen.push(`registreer ${minuut} ${status}${melding ? ` (${melding})` : ''}`);
      return Promise.resolve();
    }),
    claimBericht: vi.fn(() => {
      stappen.push('claim');
      return Promise.resolve(opties.geclaimd ?? false);
    }),
    stuurBericht: vi.fn(() => {
      stappen.push('stuur');
      return opties.berichtFaalt ? Promise.reject(new Error('mail kapot')) : Promise.resolve();
    }),
    markeerBericht: vi.fn((status: 'verstuurd' | 'mislukt') => {
      stappen.push(`bericht ${status}`);
      return Promise.resolve();
    }),
  };
  return { nep, stappen };
}

describe('geplande proeftaak: de volgorde', () => {
  it('schrijft de uitkomst pas aan het eind, met de minuut in UTC als sleutel (review PR12-03)', async () => {
    const { nep, stappen } = diensten();
    await voerProefTaakUit(MOMENT, false, nep);
    expect(stappen).toEqual(['claim', 'registreer 2026-10-28T14:07Z gelukt']);
  });

  it('geeft in dezelfde minuut dezelfde sleutel, zodat een dubbele start niet dubbel telt', () => {
    expect(minuutSleutel(new Date(Date.UTC(2026, 9, 28, 14, 7, 0)))).toBe(minuutSleutel(MOMENT));
    expect(minuutSleutel(new Date(Date.UTC(2026, 9, 28, 14, 8, 0)))).not.toBe(minuutSleutel(MOMENT));
  });

  it('laat bij een gedwongen fout de status mislukt achter, en faalt zelf ook', async () => {
    const { nep, stappen } = diensten();
    await expect(voerProefTaakUit(MOMENT, true, nep)).rejects.toThrow();
    expect(stappen).toEqual([
      'registreer 2026-10-28T14:07Z mislukt (gedwongen fout (PROEF_TAAK_FORCEER_FOUT))',
    ]);
  });

  it('stuurt het testbericht alleen als deze run het als eerste claimt, en markeert het als verstuurd', async () => {
    const eerste = diensten({ geclaimd: true });
    await voerProefTaakUit(MOMENT, false, eerste.nep);
    expect(eerste.stappen).toEqual([
      'claim',
      'stuur',
      'bericht verstuurd',
      'registreer 2026-10-28T14:07Z gelukt',
    ]);

    const later = diensten({ geclaimd: false });
    await voerProefTaakUit(MOMENT, false, later.nep);
    expect(later.nep.stuurBericht).not.toHaveBeenCalled();
  });

  it('laat zien dat het bericht mislukte: bij het bericht én bij de run, en faalt (review PR12-03)', async () => {
    const { nep, stappen } = diensten({ geclaimd: true, berichtFaalt: true });
    await expect(voerProefTaakUit(MOMENT, false, nep)).rejects.toThrow('mail kapot');
    expect(stappen).toEqual([
      'claim',
      'stuur',
      'bericht mislukt',
      'registreer 2026-10-28T14:07Z mislukt (mail kapot)',
    ]);
  });
});

/** Een nagemaakte fetch die elke aanroep onthoudt en per adres een antwoord geeft. */
function nepFetch(antwoord: (url: string) => Response) {
  const aanroepen: { url: string; init: RequestInit }[] = [];
  const ophalen = vi.fn((invoer: RequestInfo | URL, init?: RequestInit) => {
    const url = invoer instanceof Request ? invoer.url : String(invoer);
    aanroepen.push({ url, init: init ?? {} });
    return Promise.resolve(antwoord(url));
  });
  return { ophalen: ophalen as unknown as typeof fetch, aanroepen };
}

const OMGEVING = {
  SUPABASE_URL: 'https://projectref.supabase.test',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  RESEND_API_KEY: 're_test',
  RESEND_AFZENDER: 'Ledenplatform <afzender@example.com>',
  PROEF_TAAK_ONTVANGER: 'ontvanger@example.com',
};
const headersVan = (init: RequestInit | undefined): Headers => new Headers(init?.headers);

describe('geplande proeftaak: de aanroepen naar Supabase en Resend (maakDiensten)', () => {
  it('stuurt de geheime sleutel alleen als apikey, niet als Bearer (review PR12-09)', async () => {
    const { ophalen, aanroepen } = nepFetch(() => new Response(null, { status: 201 }));
    await maakDiensten(OMGEVING, ophalen)?.registreer('2026-10-28T14:07Z', 'gelukt');
    const headers = headersVan(aanroepen[0]?.init);
    expect(headers.get('apikey')).toBe('sb_secret_test');
    expect(headers.get('authorization')).toBeNull();
  });

  it('schrijft de uitkomst met merge-duplicates: de laatste poging in een minuut telt (review PR12-03)', async () => {
    const { ophalen, aanroepen } = nepFetch(() => new Response(null, { status: 201 }));
    await maakDiensten(OMGEVING, ophalen)?.registreer('2026-10-28T14:07Z', 'mislukt', 'kapot');
    expect(aanroepen[0]?.url).toBe('https://projectref.supabase.test/rest/v1/proef_taak');
    expect(headersVan(aanroepen[0]?.init).get('prefer')).toContain('resolution=merge-duplicates');
    expect(JSON.parse(String(aanroepen[0]?.init.body))).toEqual({
      minuut: '2026-10-28T14:07Z',
      status: 'mislukt',
      melding: 'kapot',
    });
  });

  it('claimt zonder fout in de database: een lege lijst betekent "al geclaimd" (review PR12-10)', async () => {
    const leeg = nepFetch(() => Response.json([], { status: 201 }));
    expect(await maakDiensten(OMGEVING, leeg.ophalen)?.claimBericht()).toBe(false);
    expect(headersVan(leeg.aanroepen[0]?.init).get('prefer')).toContain('resolution=ignore-duplicates');
    const nieuw = nepFetch(() => Response.json([{ id: 1 }], { status: 201 }));
    expect(await maakDiensten(OMGEVING, nieuw.ophalen)?.claimBericht()).toBe(true);
  });

  it('claimt niets zonder Resend-gegevens: dan geen bericht, de taak draait door', async () => {
    const { ophalen, aanroepen } = nepFetch(() => Response.json([{ id: 1 }], { status: 201 }));
    const zonder = { SUPABASE_URL: OMGEVING.SUPABASE_URL, SUPABASE_SECRET_KEY: OMGEVING.SUPABASE_SECRET_KEY };
    expect(await maakDiensten(zonder, ophalen)?.claimBericht()).toBe(false);
    expect(aanroepen).toEqual([]);
  });

  it('stuurt het bericht met een vaste Idempotency-Key, zodat opnieuw proberen niet dubbel verstuurt', async () => {
    const { ophalen, aanroepen } = nepFetch(() => Response.json({ id: 'x' }));
    await maakDiensten(OMGEVING, ophalen)?.stuurBericht();
    expect(aanroepen[0]?.url).toBe('https://api.resend.com/emails');
    expect(headersVan(aanroepen[0]?.init).get('idempotency-key')).toBe('proef-taak-testbericht');
  });

  it('wacht nooit langer dan een grens op Supabase of Resend (review PR12-11)', async () => {
    const { ophalen, aanroepen } = nepFetch(() => new Response(null, { status: 201 }));
    await maakDiensten(OMGEVING, ophalen)?.registreer('2026-10-28T14:07Z', 'gelukt');
    expect(aanroepen[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('is niet ingesteld zonder Supabase-gegevens: dan geen diensten, en de Worker stopt zonder fout', () => {
    expect(maakDiensten({}, fetch)).toBeUndefined();
  });
});
