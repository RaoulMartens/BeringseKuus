import { describe, expect, it } from 'vitest';

import { aandachtRegel, uitnodigingTekst, type Lidregel } from './leden';

const LID: Lidregel = {
  lidId: '11111111-1111-4111-8111-111111111111',
  voornaam: 'Rick',
  achternaam: 'Jacobs',
  naam: 'Rick Jacobs',
  actief: true,
  groepen: ['Dames'],
  isBeheerder: false,
  ooitIngelogd: false,
  accountSinds: '2026-11-14T10:00:00Z',
  inactiefSinds: null,
};

describe('de status van een uitnodiging', () => {
  it('zegt wat er met de uitnodiging is', () => {
    expect(aandachtRegel({ ...LID, uitnodiging: { status: 'wacht', verstuurdOp: null } })).toBe(
      'Nog niet ingelogd · uitnodiging wordt verstuurd',
    );
    expect(aandachtRegel({ ...LID, uitnodiging: { status: 'mislukt', verstuurdOp: null } })).toContain(
      'mislukt',
    );
    expect(
      aandachtRegel({ ...LID, uitnodiging: { status: 'verstuurd', verstuurdOp: '2026-11-14T10:00:00Z' } }),
    ).toBe('Nog niet ingelogd · uitgenodigd 14 november');
    expect(aandachtRegel(LID)).toBe('Nog niet ingelogd · account sinds 14 november');
  });

  it('zegt wat er met de herinnering is', () => {
    expect(
      aandachtRegel({ ...LID, uitnodiging: { soort: 'herinnering', status: 'wacht', verstuurdOp: null } }),
    ).toBe('Nog niet ingelogd · herinnering wordt verstuurd');
    expect(
      aandachtRegel({
        ...LID,
        uitnodiging: { soort: 'herinnering', status: 'verstuurd', verstuurdOp: '2026-11-18T07:00:00Z' },
      }),
    ).toBe('Nog niet ingelogd · herinnerd 18 november');
  });

  it('zegt het op het lidscherm in woorden, en niets als er niets is', () => {
    expect(uitnodigingTekst(null)).toBeNull();
    expect(uitnodigingTekst({ status: 'wacht', verstuurdOp: null })).toBe('Wordt verstuurd');
    expect(uitnodigingTekst({ status: 'verstuurd', verstuurdOp: '2026-11-14T10:00:00Z' })).toBe(
      'Verstuurd op 14 november',
    );
    expect(
      uitnodigingTekst({ soort: 'herinnering', status: 'verstuurd', verstuurdOp: '2026-11-18T07:00:00Z' }),
    ).toBe('Herinnering verstuurd op 18 november');
    expect(uitnodigingTekst({ soort: 'herinnering', status: 'wacht', verstuurdOp: null })).toBe(
      'Herinnering wordt verstuurd',
    );
  });
});
