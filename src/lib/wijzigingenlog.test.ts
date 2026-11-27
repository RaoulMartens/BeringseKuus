import { describe, expect, it } from 'vitest';

import {
  dagKop,
  doelHref,
  groepeerPerDag,
  leesSoort,
  leesWijzigingen,
  uurTekst,
  wijzigingenHref,
  type Wijziging,
} from './wijzigingenlog';

const NU = new Date('2027-01-21T12:00:00Z');
const ID = '11111111-1111-4111-8111-111111111111';

describe('het filter', () => {
  it('kent de vijf soorten en valt anders terug op alles', () => {
    expect(leesSoort('diensten')).toBe('diensten');
    expect(leesSoort(['leden', 'beheer'])).toBe('leden');
    expect(leesSoort('onzin')).toBe('alles');
    expect(leesSoort(undefined)).toBe('alles');
  });

  it('maakt de adressen: alleen wat afwijkt van de standaard staat erin', () => {
    expect(wijzigingenHref('alles')).toBe('/beheer/wijzigingen');
    expect(wijzigingenHref('diensten')).toBe('/beheer/wijzigingen?soort=diensten');
    expect(wijzigingenHref('alles', 40)).toBe('/beheer/wijzigingen?voor=40');
    expect(wijzigingenHref('leden', 40)).toBe('/beheer/wijzigingen?soort=leden&voor=40');
  });
});

describe('leesWijzigingen', () => {
  it('leest de regels en laat wat niet klopt weg', () => {
    const uit = leesWijzigingen([
      {
        id: 5,
        moment: '2027-01-21T10:00:00Z',
        door: 'Mark Hendriks',
        omschrijving: 'Iets',
        doel_soort: 'activiteit',
        doel_id: ID,
      },
      {
        id: 4,
        moment: '2027-01-21T09:00:00Z',
        door: 'Het systeem',
        omschrijving: 'Anders',
        doel_soort: null,
        doel_id: null,
      },
      { id: 'x' },
    ]);
    expect(uit).toHaveLength(2);
    expect(uit[0]?.doel).toEqual({ soort: 'activiteit', id: ID });
    expect(uit[1]?.doel).toBeNull();
  });

  it('geeft niets bij een antwoord dat geen lijst is', () => {
    expect(leesWijzigingen(null)).toEqual([]);
    expect(leesWijzigingen({})).toEqual([]);
  });

  it('linkt naar de activiteit of het lid, anders niet', () => {
    expect(doelHref({ doel: { soort: 'activiteit', id: ID } })).toBe(`/beheer/activiteiten/${ID}`);
    expect(doelHref({ doel: { soort: 'lid', id: ID } })).toBe(`/beheer/leden/${ID}`);
    expect(doelHref({ doel: null })).toBeNull();
  });
});

describe('per dag', () => {
  const regel = (id: number, moment: string): Wijziging => ({
    id,
    moment,
    door: 'A',
    omschrijving: 'x',
    doel: null,
  });

  it('noemt vandaag en gisteren, daarna de dag in woorden', () => {
    expect(dagKop('2027-01-21T08:00:00Z', NU)).toBe('Vandaag');
    expect(dagKop('2027-01-20T08:00:00Z', NU)).toBe('Gisteren');
    expect(dagKop('2027-01-19T08:00:00Z', NU)).toBe('Dinsdag 19 januari');
  });

  it('rekent in de tijd van Nederland: kort na middernacht is al de volgende dag', () => {
    expect(dagKop('2027-01-20T23:30:00Z', NU)).toBe('Vandaag');
    expect(uurTekst('2027-01-20T23:30:00Z')).toBe('00:30');
    expect(uurTekst('2027-07-01T12:05:00Z')).toBe('14:05');
  });

  it('groepeert op dag, in de volgorde van binnenkomst', () => {
    const dagen = groepeerPerDag(
      [
        regel(5, '2027-01-21T10:00:00Z'),
        regel(4, '2027-01-21T09:00:00Z'),
        regel(3, '2027-01-20T10:00:00Z'),
        regel(2, '2027-01-19T10:00:00Z'),
      ],
      NU,
    );
    expect(dagen.map((d) => [d.kop, d.regels.length])).toEqual([
      ['Vandaag', 2],
      ['Gisteren', 1],
      ['Dinsdag 19 januari', 1],
    ]);
    expect(groepeerPerDag([], NU)).toEqual([]);
  });
});
