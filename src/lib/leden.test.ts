// Leden beheren (UC-013): de zuivere logica achter de schermen. De regels zelf staan in de database (ledenbeheer.test.sql).

import { describe, expect, it } from 'vitest';

import {
  aandachtRegel,
  groepenRegel,
  inactiefRegel,
  ledenIngangTekst,
  ledenMelding,
  leesLeden,
  leesLid,
  maakLedenoverzicht,
  telWijzigingen,
  vertaalLedenfout,
  wijzigingenTekst,
  type LedenRij,
} from './leden';

const rij = (naam: string, over: Partial<LedenRij> = {}): LedenRij => ({
  lid_id: `id-${naam}`,
  voornaam: naam,
  achternaam: 'Test',
  actief: true,
  groepen: ['Dames'],
  is_beheerder: false,
  ooit_ingelogd: true,
  account_sinds: '2026-11-14T10:00:00Z',
  inactief_sinds: null,
  ...over,
});

describe('maakLedenoverzicht', () => {
  const leden = leesLeden([
    rij('Truus'),
    rij('Rick', { ooit_ingelogd: false }),
    rij('Anne'),
    rij('Jo', { actief: false, inactief_sinds: '2026-10-03T10:00:00Z' }),
  ]);

  it('zet wie nog niet is ingelogd onder aandacht en laat die ook in de lijst staan', () => {
    const uit = maakLedenoverzicht(leden);
    expect(uit.aandacht.map((l) => l.voornaam)).toEqual(['Rick']);
    expect(uit.actief.map((l) => l.voornaam)).toEqual(['Anne', 'Rick', 'Truus']);
  });

  it('houdt inactieve leden apart, ook als ze nooit zijn ingelogd', () => {
    const uit = maakLedenoverzicht(leesLeden([rij('Jo', { actief: false, ooit_ingelogd: false })]));
    expect(uit.inactief).toHaveLength(1);
    expect(uit.aandacht).toHaveLength(0);
  });
});

describe('regels in woorden', () => {
  it('zet Beheerder bij de groepen', () => {
    expect(groepenRegel({ groepen: ['Bestuur'], isBeheerder: true })).toBe('Bestuur · Beheerder');
    expect(groepenRegel({ groepen: [], isBeheerder: false })).toBe('Geen groep');
  });

  it('zegt wat er aan de hand is bij wie niet is ingelogd', () => {
    const lid = leesLeden([rij('Rick', { ooit_ingelogd: false })])[0]!;
    expect(aandachtRegel(lid)).toBe('Nog niet ingelogd · account sinds 14 november');
  });

  it('zegt sinds wanneer een lid inactief is, als dat bekend is', () => {
    const leden = leesLeden([
      rij('Jo', { actief: false, inactief_sinds: '2026-10-03T10:00:00Z' }),
      rij('Karin', { actief: false }),
    ]);
    expect(inactiefRegel(leden[0]!)).toBe('Inactief sinds 3 oktober');
    expect(inactiefRegel(leden[1]!)).toBe('Inactief');
  });

  it('noemt op de kaart in het beheeroverzicht de taak', () => {
    expect(ledenIngangTekst(0)).toBe('Leden bekijken');
    expect(ledenIngangTekst(1)).toBe('1 nog niet ingelogd');
    expect(ledenIngangTekst(2)).toBe('2 nog niet ingelogd');
  });
});

describe('wijzigingen tellen', () => {
  const begin = { telefoon: '06 12 34 56 78', groepen: ['a', 'b'], aanmerkingen: ['bob'] };

  it('telt niets als er niets is gewijzigd, ook niet bij spaties om het nummer', () => {
    expect(telWijzigingen(begin, { ...begin, telefoon: ' 06 12 34 56 78 ' })).toBe(0);
    expect(wijzigingenTekst(0)).toBe('Niets gewijzigd');
  });

  it('telt een gewijzigd nummer, een groep erbij of eraf en een aanmerking apart', () => {
    expect(telWijzigingen(begin, { ...begin, telefoon: '06 99 99 99 99' })).toBe(1);
    expect(telWijzigingen(begin, { ...begin, groepen: ['a'] })).toBe(1);
    expect(telWijzigingen(begin, { ...begin, groepen: ['a', 'c'] })).toBe(2);
    expect(
      telWijzigingen(begin, { telefoon: '06 99 99 99 99', groepen: ['a', 'b', 'c'], aanmerkingen: [] }),
    ).toBe(3);
    expect(wijzigingenTekst(1)).toBe('1 wijziging nog niet opgeslagen');
    expect(wijzigingenTekst(3)).toBe('3 wijzigingen nog niet opgeslagen');
  });
});

describe('vertaalLedenfout', () => {
  it('geeft de activiteiten mee bij een blokkade door een dienst', () => {
    const uit = vertaalLedenfout('dienst_blokkeert', {
      activiteiten: [{ id: 'x', naam: 'Bonte Avond', datum: '2027-01-22' }],
    });
    expect(uit.tekst).toContain('Vul die plek eerst anders in');
    expect(uit.activiteiten).toEqual([{ naam: 'Bonte Avond', datum: '2027-01-22' }]);
  });

  it('heeft voor elke foutcode van de database een eigen tekst en een nette terugval', () => {
    for (const code of [
      'lid_onbekend',
      'zelf',
      'is_beheerder',
      'al_inactief',
      'al_actief',
      'telefoon_ongeldig',
      'groep_nodig',
      'groep_onbekend',
    ]) {
      expect(vertaalLedenfout(code).tekst).not.toMatch(/Probeer het nog eens/);
    }
    expect(vertaalLedenfout('iets_nieuws').tekst).toMatch(/Probeer het nog eens/);
  });

  it('houdt een kapotte detail-tekst buiten de pagina', () => {
    expect(vertaalLedenfout('dienst_blokkeert', 'geen json').activiteiten).toEqual([]);
  });
});

describe('ledenMelding', () => {
  it('zegt hoeveel plekken openvielen, in enkelvoud en meervoud', () => {
    expect(ledenMelding('inactief', 'Truus', 2).vervolg).toContain('2 plekken zijn open gevallen');
    expect(ledenMelding('inactief', 'Truus', 1).vervolg).toContain('1 plek is open gevallen');
    expect(ledenMelding('inactief', 'Truus', 0).vervolg).toContain('Er waren geen komende plekken');
  });

  it('zegt dat de plekken van eerder niet terugkomen', () => {
    expect(ledenMelding('actief', 'Truus').vervolg).toContain('komen niet terug');
  });
});

describe('leesLid', () => {
  const uitDatabase = {
    lid: {
      id: '7e6b2b1e-6b8a-4f0b-9d3f-0c1a2b3c4d5e',
      voornaam: 'Truus',
      achternaam: 'Janssen',
      actief: true,
      email: 'truus@example.com',
      telefoon: null,
      mag_bob: false,
      mag_eindverantw: true,
      is_beheerder: false,
      is_ik: false,
      laatst_ingelogd: null,
    },
    groepen: [{ id: '0b6b2b1e-6b8a-4f0b-9d3f-0c1a2b3c4d5e', naam: 'Dames', aantal: 14, gekozen: true }],
    diensten: [],
  };

  it('leest het antwoord van de database', () => {
    const lid = leesLid(uitDatabase);
    expect(lid.naam).toBe('Truus Janssen');
    expect(lid.magEindverantwoordelijke).toBe(true);
    expect(lid.groepen[0]?.gekozen).toBe(true);
  });

  it('weigert een vorm die we niet kennen', () => {
    expect(() => leesLid({ lid: {} })).toThrow();
  });
});
