import { describe, expect, it } from 'vitest';

import {
  aantalIngedeeld,
  nogLeegTekst,
  vertaalPubliceerfout,
  zelfNietZichtbaarTekst,
  zichtbaarVoorTekst,
} from './publiceren';

describe('nogLeegTekst', () => {
  it('is leeg als alles is ingedeeld', () => {
    expect(nogLeegTekst([])).toBeNull();
    expect(nogLeegTekst([{ rol: 'werker', bezetterId: 'a' }])).toBeNull();
  });

  it('telt de lege plekken per rol, in enkelvoud of meervoud', () => {
    expect(nogLeegTekst([{ rol: 'werker', bezetterId: null }])).toBe('1 werker-plek');
    expect(
      nogLeegTekst([
        { rol: 'werker', bezetterId: null },
        { rol: 'werker', bezetterId: null },
        { rol: 'drankhaler', bezetterId: null },
        { rol: 'werker', bezetterId: 'a' },
      ]),
    ).toBe('2 werker-plekken, 1 drankhaler-plek');
    expect(nogLeegTekst([{ rol: 'bob', bezetterId: null }])).toBe('1 BOB-plek');
  });

  it('noemt een eigen rol bij zijn naam, na de vaste rollen; de bak en de eindverantwoordelijke niet', () => {
    expect(
      nogLeegTekst([
        { rol: 'Garderobe', bezetterId: null },
        { rol: 'tapper', bezetterId: null },
        { rol: 'tapper', bezetterId: null },
        { rol: 'bak', bezetterId: null },
        { rol: 'eindverantwoordelijke', bezetterId: null },
      ]),
    ).toBe('2 tapper-plekken, 1 garderobe-plek');
  });
});

describe('aantalIngedeeld', () => {
  it('telt mensen, niet plekken, en neemt de eindverantwoordelijke mee', () => {
    const plekken = [
      { rol: 'werker', bezetterId: 'a' },
      { rol: 'drankhaler', bezetterId: 'b' },
      { rol: 'werker', bezetterId: null },
    ];
    expect(aantalIngedeeld(plekken, 'c')).toBe(3);
    expect(aantalIngedeeld(plekken, null)).toBe(2);
    expect(aantalIngedeeld(plekken, 'a')).toBe(2);
    expect(aantalIngedeeld([], null)).toBe(0);
  });
});

describe('zichtbaarVoorTekst', () => {
  const groepen = [
    { id: '1', naam: 'Bestuur' },
    { id: '2', naam: 'Raad van Elf' },
    { id: '3', naam: 'Dames' },
  ];

  it('zegt "alle leden" zonder doelgroep', () => {
    expect(zichtbaarVoorTekst([], groepen, 42)).toBe('Alle 42 actieve leden');
  });

  it('noemt de groepen bij een doelgroep', () => {
    expect(zichtbaarVoorTekst(['1'], groepen, 42)).toBe('Alleen leden van Bestuur');
    expect(zichtbaarVoorTekst(['1', '2'], groepen, 42)).toBe('Alleen leden van Bestuur en Raad van Elf');
    expect(zichtbaarVoorTekst(['1', '2', '3'], groepen, 42)).toBe(
      'Alleen leden van Bestuur, Raad van Elf en Dames',
    );
  });

  it('slaat een groep over die er niet meer is, en valt dan terug op iedereen', () => {
    expect(zichtbaarVoorTekst(['9'], groepen, 42)).toBe('Alle 42 actieve leden');
  });
});

describe('zelfNietZichtbaarTekst', () => {
  const groepen = [
    { id: '1', naam: 'Bestuur' },
    { id: '2', naam: 'Raad van Elf' },
    { id: '3', naam: 'Dames' },
  ];

  it('zegt niets zonder doelgroep: iedereen ziet de activiteit, de beheerder ook', () => {
    expect(zelfNietZichtbaarTekst([], groepen, [])).toBeNull();
    expect(zelfNietZichtbaarTekst([], groepen, ['1'])).toBeNull();
  });

  it('zegt niets als de beheerder in een van de gekozen groepen zit', () => {
    expect(zelfNietZichtbaarTekst(['1'], groepen, ['1'])).toBeNull();
    expect(zelfNietZichtbaarTekst(['1', '2'], groepen, ['2', '3'])).toBeNull();
  });

  it('waarschuwt als de beheerder in geen van de gekozen groepen zit, met de naam van de groep', () => {
    expect(zelfNietZichtbaarTekst(['2'], groepen, [])).toBe(
      'Jij zit zelf niet in Raad van Elf, dus je ziet deze activiteit zelf niet op Start of Programma. Leden in die groep zien hem wel.',
    );
    expect(zelfNietZichtbaarTekst(['2'], groepen, ['1', '3'])).toContain(
      'Jij zit zelf niet in Raad van Elf,',
    );
  });

  it('noemt meer groepen in meervoud', () => {
    expect(zelfNietZichtbaarTekst(['1', '2'], groepen, ['3'])).toBe(
      'Jij zit zelf niet in Bestuur en Raad van Elf, dus je ziet deze activiteit zelf niet op Start of Programma. Leden in die groepen zien hem wel.',
    );
  });

  it('negeert een groep die er niet meer is: dan is er geen doelgroep', () => {
    expect(zelfNietZichtbaarTekst(['9'], groepen, [])).toBeNull();
  });
});

describe('vertaalPubliceerfout', () => {
  it('noemt wat er ontbreekt bij publiceren_niet_mogelijk', () => {
    expect(vertaalPubliceerfout('publiceren_niet_mogelijk', { ontbreekt: ['eindtijd'] })).toBe(
      'Publiceren kan nog niet: er ontbreekt de eindtijd. Vul dat eerst in en probeer het opnieuw.',
    );
    expect(
      vertaalPubliceerfout('publiceren_niet_mogelijk', {
        ontbreekt: ['eindtijd', 'eindverantwoordelijke'],
      }),
    ).toContain('de eindtijd en een eindverantwoordelijke');
    expect(
      vertaalPubliceerfout('publiceren_niet_mogelijk', { ontbreekt: ['telefoon_eindverantwoordelijke'] }),
    ).toContain('het telefoonnummer van de eindverantwoordelijke');
  });

  it('valt terug op een algemene tekst als het detail niets zegt', () => {
    for (const detail of [{}, null, 'tekst', { ontbreekt: ['onbekend'] }]) {
      expect(vertaalPubliceerfout('publiceren_niet_mogelijk', detail)).toContain('er ontbreekt nog iets');
    }
  });

  it('kent de overige codes', () => {
    expect(vertaalPubliceerfout('versie_verouderd', { versie: 3 })).toContain(
      'Iemand anders heeft deze activiteit net gewijzigd',
    );
    expect(vertaalPubliceerfout('alleen_concept', {})).toBe('Deze activiteit is al gepubliceerd.');
    expect(vertaalPubliceerfout('activiteit_niet_open', {})).toContain('al geweest of geannuleerd');
    expect(vertaalPubliceerfout('activiteit_onbekend', {})).toBe('Deze activiteit bestaat niet meer.');
    expect(vertaalPubliceerfout('iets_nieuws', {})).toContain('niet gelukt');
  });
});
