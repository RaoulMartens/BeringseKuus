import { describe, expect, it } from 'vitest';

import { dienstenTekst, maakVerdeling, telDiensten, trapVan, type VerdelingLid } from './verdeling';

const LEDEN: VerdelingLid[] = [
  { id: 'a', voornaam: 'Anna', achternaam: 'Smeets' },
  { id: 'b', voornaam: 'Bert', achternaam: 'Claessens' },
  { id: 'c', voornaam: 'Carla', achternaam: 'van der Jacobs' },
  { id: 'd', voornaam: 'Dirk', achternaam: 'Hendrikx' },
];

describe('telDiensten', () => {
  it('telt elke bezette plek van een lid', () => {
    const telling = telDiensten([{ lidId: 'a' }, { lidId: 'a' }, { lidId: 'b' }]);
    expect(telling.get('a')).toBe(2);
    expect(telling.get('b')).toBe(1);
    expect(telling.get('c')).toBeUndefined();
  });
});

describe('maakVerdeling', () => {
  it('zet de minste diensten eerst, gelijk op alfabet, en telt wie nog geen dienst heeft', () => {
    const verdeling = maakVerdeling(LEDEN, [{ lidId: 'a' }, { lidId: 'a' }, { lidId: 'a' }, { lidId: 'd' }]);
    expect(verdeling.rijen.map((rij) => [rij.naam, rij.aantal])).toEqual([
      ['Bert Claessens', 0],
      ['Carla van der Jacobs', 0],
      ['Dirk Hendrikx', 1],
      ['Anna Smeets', 3],
    ]);
    expect(verdeling.nogNiet).toBe(2);
  });

  it('geeft initialen zonder tussenvoegsel', () => {
    const verdeling = maakVerdeling(LEDEN, []);
    expect(verdeling.rijen.find((rij) => rij.lidId === 'c')?.initialen).toBe('CJ');
  });

  it('geeft een lege lijst zonder leden', () => {
    expect(maakVerdeling([], [{ lidId: 'x' }])).toEqual({ rijen: [], nogNiet: 0 });
  });
});

describe('trapVan en dienstenTekst', () => {
  it('kent drie trappen', () => {
    expect([0, 1, 2, 3, 9].map(trapVan)).toEqual(['geen', 'weinig', 'weinig', 'veel', 'veel']);
  });

  it('zegt het in woorden', () => {
    expect(dienstenTekst(0)).toBe('nog geen dienst dit seizoen');
    expect(dienstenTekst(1)).toBe('1 dienst dit seizoen');
    expect(dienstenTekst(4)).toBe('4 diensten dit seizoen');
  });
});
