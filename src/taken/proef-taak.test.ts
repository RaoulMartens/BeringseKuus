// Tests voor de geplande proeftaak (proefroute 3), zonder database: de diensten zijn nagemaakt. Het echte schrijven
// in de database testen e2e/geplande-taak.spec.ts (op de Worker) en supabase/tests/database/proef_taak.test.sql.
import { describe, expect, it, vi } from 'vitest';

import { minuutSleutel, type ProefTaakDiensten, voerProefTaakUit } from './proef-taak';

const MOMENT = new Date(Date.UTC(2026, 9, 28, 14, 7, 42));

function diensten(opties: { geclaimd?: boolean; berichtFaalt?: boolean } = {}) {
  const geregistreerd: { minuut: string; status: string; melding?: string }[] = [];
  const nep: ProefTaakDiensten = {
    registreer: vi.fn((minuut: string, status: 'gelukt' | 'mislukt', melding?: string) => {
      geregistreerd.push({ minuut, status, ...(melding === undefined ? {} : { melding }) });
      return Promise.resolve();
    }),
    claimBericht: vi.fn(() => Promise.resolve(opties.geclaimd ?? false)),
    stuurBericht: vi.fn(() =>
      opties.berichtFaalt ? Promise.reject(new Error('mail kapot')) : Promise.resolve(),
    ),
  };
  return { nep, geregistreerd };
}

describe('geplande proeftaak', () => {
  it('schrijft de minuut in UTC als sleutel, met status gelukt', async () => {
    const { nep, geregistreerd } = diensten();
    await voerProefTaakUit(MOMENT, false, nep);
    expect(geregistreerd).toEqual([{ minuut: '2026-10-28T14:07Z', status: 'gelukt' }]);
  });

  it('geeft in dezelfde minuut dezelfde sleutel, zodat een dubbele start niet dubbel telt', () => {
    expect(minuutSleutel(new Date(Date.UTC(2026, 9, 28, 14, 7, 0)))).toBe(minuutSleutel(MOMENT));
    expect(minuutSleutel(new Date(Date.UTC(2026, 9, 28, 14, 8, 0)))).not.toBe(minuutSleutel(MOMENT));
  });

  it('laat bij een gedwongen fout een zichtbare status mislukt achter, en faalt zelf ook', async () => {
    const { nep, geregistreerd } = diensten();
    await expect(voerProefTaakUit(MOMENT, true, nep)).rejects.toThrow();
    expect(geregistreerd).toEqual([
      { minuut: '2026-10-28T14:07Z', status: 'mislukt', melding: 'gedwongen fout (PROEF_TAAK_FORCEER_FOUT)' },
    ]);
  });

  it('stuurt het testbericht alleen als deze run het als eerste claimt: hooguit één keer', async () => {
    const eerste = diensten({ geclaimd: true });
    await voerProefTaakUit(MOMENT, false, eerste.nep);
    expect(eerste.nep.stuurBericht).toHaveBeenCalledTimes(1);

    const later = diensten({ geclaimd: false });
    await voerProefTaakUit(MOMENT, false, later.nep);
    expect(later.nep.stuurBericht).not.toHaveBeenCalled();
  });

  it('faalt zichtbaar als het testbericht niet verstuurd kan worden', async () => {
    const { nep } = diensten({ geclaimd: true, berichtFaalt: true });
    await expect(voerProefTaakUit(MOMENT, false, nep)).rejects.toThrow('mail kapot');
  });
});
