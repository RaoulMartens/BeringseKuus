import { describe, expect, it } from 'vitest';

import {
  controleNaam,
  isLedenLeesFout,
  leesLedenControle,
  leesLedenRegels,
  naarLedenServerregels,
  onbekendeGroepen,
  regelFoutTekst,
  vertaalLedenLeesfout,
} from './ledenimport';

const GROEPEN = [
  { id: '11111111-1111-4111-8111-111111111111', naam: 'Dames' },
  { id: '22222222-2222-4222-8222-222222222222', naam: 'Bestuur' },
];
const KOP = ['Voornaam', 'Achternaam', 'E-mailadres', 'Groepen', 'Telefoon'];

describe('leesLedenRegels', () => {
  it('leest de regels, met het rijnummer van het bestand', () => {
    const uit = leesLedenRegels([KOP, ['Piet', 'Aarts', ' piet@example.com ', 'Dames', '06 12 34 56 78']]);
    expect(isLedenLeesFout(uit)).toBe(false);
    expect(uit).toEqual({
      regels: [
        {
          nr: 2,
          voornaam: 'Piet',
          achternaam: 'Aarts',
          email: 'piet@example.com',
          groepen: 'Dames',
          telefoon: '06 12 34 56 78',
        },
      ],
      voorbeelden: [],
    });
  });

  it('kent de kolommen onder andere namen en in een andere volgorde', () => {
    const uit = leesLedenRegels([
      ['groep', 'e-mail', 'achternaam', 'voornaam'],
      ['Dames', 'a@example.com', 'Aarts', 'Piet'],
    ]);
    expect(isLedenLeesFout(uit) ? null : uit.regels[0]).toMatchObject({
      voornaam: 'Piet',
      email: 'a@example.com',
      groepen: 'Dames',
    });
  });

  it('meldt welke kolommen ontbreken', () => {
    const uit = leesLedenRegels([
      ['voornaam', 'achternaam'],
      ['Piet', 'Aarts'],
    ]);
    expect(uit).toEqual({ code: 'kolom_ontbreekt', kolommen: ['e-mailadres', 'groepen'] });
    expect(vertaalLedenLeesfout({ code: 'kolom_ontbreekt', kolommen: ['e-mailadres', 'groepen'] })).toContain(
      'e-mailadres, groepen',
    );
  });

  it('slaat lege rijen over en meldt voorbeeldregels', () => {
    const uit = leesLedenRegels([
      KOP,
      ['Voorbeeld: Piet', 'Aarts', 'a@example.com', 'Dames', null],
      [null, null, null, null, null],
      ['Marie', 'Verbeek', 'm@example.com', 'Dames', null],
    ]);
    expect(isLedenLeesFout(uit)).toBe(false);
    if (!isLedenLeesFout(uit)) {
      expect(uit.voorbeelden).toEqual([2]);
      expect(uit.regels.map((r) => r.nr)).toEqual([4]);
    }
  });

  it('geeft een fout als er niets staat of er te veel is', () => {
    expect(leesLedenRegels([KOP])).toEqual({ code: 'geen_regels' });
    const veel = Array.from({ length: 201 }, (_, i) => ['A', 'B', `a${i}@b.nl`, 'Dames', null]);
    expect(leesLedenRegels([KOP, ...veel])).toEqual({ code: 'te_veel_regels' });
  });

  it('zet een telefoonnummer dat Excel als getal opsloeg (zonder 0) terug', () => {
    const uit = leesLedenRegels([KOP, ['P', 'A', 'a@example.com', 'Dames', 612345678]]);
    expect(isLedenLeesFout(uit) ? null : uit.regels[0]?.telefoon).toBe('0612345678');
  });
});

describe('groepen koppelen', () => {
  const regels = [
    {
      nr: 2,
      voornaam: 'P',
      achternaam: 'A',
      email: 'a@example.com',
      telefoon: '',
      groepen: 'dames; Bestuur',
    },
    { nr: 3, voornaam: 'M', achternaam: 'V', email: 'm@example.com', telefoon: '', groepen: 'Dames; Raad' },
  ];

  it('koppelt op naam, zonder op hoofdletters te letten', () => {
    expect(naarLedenServerregels(regels, GROEPEN)[0]?.groepen).toEqual([GROEPEN[0]?.id, GROEPEN[1]?.id]);
  });

  it('meldt de namen die niet bestaan, per regel', () => {
    expect(onbekendeGroepen(regels, GROEPEN)).toEqual(new Map([[3, ['Raad']]]));
  });
});

describe('de uitkomst van de controle', () => {
  const json = {
    regels: [
      { regel: 2, status: 'toevoegen', voornaam: 'Piet', achternaam: 'Aarts', email: 'p@example.com' },
      { regel: 3, status: 'bestaat_al', voornaam: 'Truus', achternaam: 'Janssen', email: 't@example.com' },
      { regel: 4, status: 'fout', code: 'email_ongeldig', voornaam: 'Jan', achternaam: '', email: 'kapot' },
    ],
  };

  it('telt per status', () => {
    expect(leesLedenControle(json)).toMatchObject({ toevoegen: 1, bestaatAl: 1, fouten: 1 });
  });

  it('wijst een antwoord af dat niet de verwachte vorm heeft', () => {
    expect(leesLedenControle(null)).toBeNull();
    expect(leesLedenControle({ regels: [{ regel: 'x' }] })).toBeNull();
    expect(leesLedenControle({ regels: [{ regel: 1, status: 'onbekend' }] })).toBeNull();
  });

  it('zegt in woorden wat er mis is', () => {
    expect(regelFoutTekst('email_ongeldig')).toBe('Het e-mailadres klopt niet.');
    expect(regelFoutTekst('email_dubbel')).toContain('al eerder in het bestand');
    expect(regelFoutTekst(undefined, ['Raad'])).toBe('De groep “Raad” bestaat niet.');
    expect(regelFoutTekst(undefined, ['A', 'B'])).toBe('De groepen “A”, “B” bestaan niet.');
    expect(regelFoutTekst('iets_anders')).toBe('Deze regel klopt niet.');
  });

  it('kiest een naam voor een regel, ook als die ontbreekt', () => {
    expect(controleNaam({ voornaam: 'Piet', achternaam: 'Aarts', email: 'p@example.com' })).toBe(
      'Piet Aarts',
    );
    expect(controleNaam({ voornaam: '', achternaam: '', email: 'p@example.com' })).toBe('p@example.com');
    expect(controleNaam({ voornaam: '', achternaam: '', email: '' })).toBe('Naam ontbreekt');
  });
});
