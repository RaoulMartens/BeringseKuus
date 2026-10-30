import { describe, expect, it } from 'vitest';

import {
  dagTekst,
  isActiviteitStatus,
  maakProgramma,
  maandTitel,
  regelOnderNaam,
  tijdTekst,
  vandaagInNederland,
  type ProgrammaActiviteit,
} from './programma';

function activiteit(
  naam: string,
  datum: string,
  rest: Partial<ProgrammaActiviteit> = {},
): ProgrammaActiviteit {
  return {
    id: `${naam}-${datum}`,
    naam,
    datum,
    starttijd: null,
    locatie: null,
    status: 'gepubliceerd',
    ...rest,
  };
}

describe('vandaagInNederland', () => {
  it('geeft de dag in Nederland, niet in UTC', () => {
    // 23:30 UTC op 21 januari is al 00:30 op 22 januari in Nederland (winter, UTC+1)
    expect(vandaagInNederland(new Date('2027-01-21T23:30:00Z'))).toBe('2027-01-22');
    expect(vandaagInNederland(new Date('2027-01-21T22:59:00Z'))).toBe('2027-01-21');
  });

  it('kent de zomertijd', () => {
    // 22:30 UTC op 15 juli is 00:30 op 16 juli (zomer, UTC+2)
    expect(vandaagInNederland(new Date('2027-07-15T22:30:00Z'))).toBe('2027-07-16');
  });
});

describe('dagTekst', () => {
  it('geeft weekdag, dag en de lange vorm in het Nederlands', () => {
    expect(dagTekst('2027-01-22')).toEqual({ weekdag: 'vr', dag: '22', lang: 'vr 22 januari' });
    expect(dagTekst('2027-02-07')).toEqual({ weekdag: 'zo', dag: '7', lang: 'zo 7 februari' });
  });

  it('klopt rond het jaarwissel en een schrikkeldag', () => {
    expect(dagTekst('2026-12-31').lang).toBe('do 31 december');
    expect(dagTekst('2028-02-29').lang).toBe('di 29 februari');
  });

  it('weigert iets dat geen datum is', () => {
    for (const fout of ['', 'morgen', '2027-1-1', '22-01-2027', '2027-01-22T10:00']) {
      expect(() => dagTekst(fout), fout).toThrow();
    }
  });
});

describe('maandTitel', () => {
  it('begint met een hoofdletter en noemt het jaar', () => {
    expect(maandTitel('2027-01-22')).toBe('Januari 2027');
    expect(maandTitel('2026-11-06')).toBe('November 2026');
  });
});

describe('tijdTekst en regelOnderNaam', () => {
  it('kort de seconden af en kent een ontbrekende tijd', () => {
    expect(tijdTekst('18:30:00')).toBe('18:30');
    expect(tijdTekst('09:05')).toBe('09:05');
    expect(tijdTekst(null)).toBeNull();
    expect(() => tijdTekst('half zeven')).toThrow();
  });

  it('toont alleen wat is ingevuld', () => {
    expect(regelOnderNaam({ starttijd: '18:30:00', locatie: 'De Kuus' })).toBe('18:30 · De Kuus');
    expect(regelOnderNaam({ starttijd: '18:30:00', locatie: null })).toBe('18:30');
    expect(regelOnderNaam({ starttijd: null, locatie: 'De Kuus' })).toBe('De Kuus');
    expect(regelOnderNaam({ starttijd: null, locatie: null })).toBe('');
    expect(regelOnderNaam({ starttijd: null, locatie: '' })).toBe('');
  });
});

describe('maakProgramma', () => {
  const lijst = [
    activiteit('Optocht', '2027-02-07', { starttijd: '13:00:00' }),
    activiteit('Bonte Avond', '2027-01-22', { starttijd: '18:30:00' }),
    activiteit('Oud papier', '2026-11-06'),
    activiteit('Nieuwjaarsreceptie', '2027-01-09'),
    activiteit('Oud papier', '2026-12-04'),
  ];

  it('zet de komende op volgorde per maand, en het geweest dat het laatst was eerst', () => {
    const programma = maakProgramma(lijst, '2027-01-21');
    expect(programma.komende.map((m) => [m.titel, m.activiteiten.map((a) => a.naam)])).toEqual([
      ['Januari 2027', ['Bonte Avond']],
      ['Februari 2027', ['Optocht']],
    ]);
    expect(programma.geweest.map((m) => [m.titel, m.activiteiten.map((a) => a.datum)])).toEqual([
      ['Januari 2027', ['2027-01-09']],
      ['December 2026', ['2026-12-04']],
      ['November 2026', ['2026-11-06']],
    ]);
    expect(programma.aantalKomende).toBe(2);
  });

  it('telt vandaag als komend en gisteren als geweest', () => {
    expect(maakProgramma(lijst, '2027-01-22').komende[0]?.activiteiten[0]?.naam).toBe('Bonte Avond');
    expect(maakProgramma(lijst, '2027-01-23').geweest[0]?.activiteiten[0]?.naam).toBe('Bonte Avond');
  });

  it('is leeg zonder activiteiten', () => {
    expect(maakProgramma([], '2027-01-21')).toEqual({ komende: [], geweest: [], aantalKomende: 0 });
  });

  it('zet een activiteit zonder tijd na die met een tijd op dezelfde dag, en is stabiel op naam', () => {
    const dag = [
      activiteit('Zonder tijd', '2027-01-22'),
      activiteit('Beta', '2027-01-22', { starttijd: '20:00:00' }),
      activiteit('Alfa', '2027-01-22', { starttijd: '20:00:00' }),
    ];
    const namen = maakProgramma(dag, '2027-01-01').komende[0]?.activiteiten.map((a) => a.naam);
    expect(namen).toEqual(['Alfa', 'Beta', 'Zonder tijd']);
  });

  it('wijzigt de invoer niet', () => {
    const kopie = [...lijst];
    maakProgramma(lijst, '2027-01-21');
    expect(lijst).toEqual(kopie);
  });

  it('weigert een ongeldige vandaag', () => {
    expect(() => maakProgramma(lijst, 'vandaag')).toThrow();
  });

  it('houdt een geannuleerde activiteit in de lijst', () => {
    const p = maakProgramma([activiteit('Afgelast', '2027-03-01', { status: 'geannuleerd' })], '2027-01-01');
    expect(p.komende[0]?.activiteiten[0]?.status).toBe('geannuleerd');
  });
});

describe('isActiviteitStatus', () => {
  it('kent alleen de drie statussen', () => {
    for (const goed of ['concept', 'gepubliceerd', 'geannuleerd'])
      expect(isActiviteitStatus(goed)).toBe(true);
    for (const fout of ['', 'Concept', 'verwijderd', null, undefined, 1])
      expect(isActiviteitStatus(fout)).toBe(false);
  });
});
