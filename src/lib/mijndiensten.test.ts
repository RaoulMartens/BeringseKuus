import { describe, expect, it } from 'vitest';

import { aantalKomende, rolTekst, sorteerAfgemeld, splitsDiensten, type DienstRij } from './mijndiensten';

const NU = new Date('2027-01-21T12:00:00Z');

function rij(naam: string, datum: string, eindigtOm: string, opties: Partial<DienstRij> = {}): DienstRij {
  return {
    activiteitId: `id-${naam}`,
    naam,
    datum,
    starttijd: '20:00',
    locatie: 'De Kuus',
    rol: 'werker',
    eindigtOm,
    ...opties,
  };
}

describe('splitsDiensten', () => {
  it('zet de komende diensten op volgorde en wat geweest is apart, het laatste eerst', () => {
    const uitkomst = splitsDiensten(
      [
        rij('Oud papier zuid', '2027-02-06', '2027-02-06T12:00:00Z'),
        rij('Prins Onthulling', '2026-11-14', '2026-11-14T23:00:00Z'),
        rij('Bonte Avond', '2027-01-22', '2027-01-23T00:00:00Z'),
        rij('Opening', '2026-10-01', '2026-10-01T23:00:00Z'),
        rij('Oud papier noord', '2027-02-05', '2027-02-05T12:00:00Z'),
      ],
      NU,
    );
    expect(uitkomst.komend.map((d) => d.naam)).toEqual([
      'Bonte Avond',
      'Oud papier noord',
      'Oud papier zuid',
    ]);
    expect(uitkomst.geweest.map((d) => d.naam)).toEqual(['Prins Onthulling', 'Opening']);
  });

  it('houdt wat precies nu eindigt voor geweest (R16) en wat net erna eindigt voor komend', () => {
    const uitkomst = splitsDiensten(
      [
        rij('Net voorbij', '2027-01-21', NU.toISOString()),
        rij('Net niet', '2027-01-21', '2027-01-21T12:00:01Z'),
      ],
      NU,
    );
    expect(uitkomst.geweest.map((d) => d.naam)).toEqual(['Net voorbij']);
    expect(uitkomst.komend.map((d) => d.naam)).toEqual(['Net niet']);
  });

  it('zet op een dag de vroegste start eerst, en een activiteit zonder starttijd laatst', () => {
    const uitkomst = splitsDiensten(
      [
        rij('Laat', '2027-03-01', '2027-03-02T00:00:00Z', { starttijd: '21:00' }),
        rij('Zonder tijd', '2027-03-01', '2027-03-02T00:00:00Z', { starttijd: null }),
        rij('Vroeg', '2027-03-01', '2027-03-02T00:00:00Z', { starttijd: '09:00' }),
      ],
      NU,
    );
    expect(uitkomst.komend.map((d) => d.naam)).toEqual(['Vroeg', 'Laat', 'Zonder tijd']);
  });

  it('geeft lege lijsten als er niets is, en verandert de invoer niet', () => {
    expect(splitsDiensten([], NU)).toEqual({ komend: [], geweest: [] });
    const invoer = [
      rij('B', '2027-03-02', '2027-03-03T00:00:00Z'),
      rij('A', '2027-03-01', '2027-03-02T00:00:00Z'),
    ];
    splitsDiensten(invoer, NU);
    expect(invoer.map((d) => d.naam)).toEqual(['B', 'A']);
  });

  it('weigert een eindmoment dat geen tijd is', () => {
    expect(() => splitsDiensten([rij('Kapot', '2027-03-01', 'geen tijd')], NU)).toThrow('ongeldig moment');
  });
});

describe('sorteerAfgemeld', () => {
  it('zet de afmeldingen op datum', () => {
    const lijst = sorteerAfgemeld([
      { activiteitId: 'b', naam: 'B', datum: '2027-03-02', starttijd: null, locatie: null },
      { activiteitId: 'a', naam: 'A', datum: '2027-03-01', starttijd: null, locatie: null },
    ]);
    expect(lijst.map((a) => a.naam)).toEqual(['A', 'B']);
  });
});

describe('rolTekst en aantalKomende', () => {
  const label = (rol: string): string | null => ({ werker: 'Werker', drankhaler: 'Drankhaler' })[rol] ?? null;

  it('schrijft de rol met een kleine letter, en een onbekende rol zoals hij is', () => {
    expect(rolTekst(['werker'], label)).toBe('werker');
    expect(rolTekst(['werker', 'drankhaler'], label)).toBe('werker en drankhaler');
    expect(rolTekst(['iets'], label)).toBe('iets');
  });

  it('zegt hoeveel diensten er komen', () => {
    expect(aantalKomende(3)).toBe('3 komende');
    expect(aantalKomende(0)).toBe('nog geen diensten');
  });
});
