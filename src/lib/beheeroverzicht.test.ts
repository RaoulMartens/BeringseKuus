import { describe, expect, it } from 'vitest';

import {
  bezettingTaak,
  dagLabel,
  indeelTaak,
  invulTaak,
  leesFilter,
  leesPlekkenPerRol,
  maakOverzicht,
  maakRij,
  type OverzichtRij,
} from './beheeroverzicht';

const VANDAAG = '2027-01-21';

function rij(naam: string, datum: string, rest: Partial<OverzichtRij> = {}): OverzichtRij {
  return {
    activiteitId: `${naam}-${datum}`,
    naam,
    datum,
    status: 'gepubliceerd',
    starttijdOntbreekt: false,
    eindtijdOntbreekt: false,
    locatieOntbreekt: false,
    eindverantwoordelijkeOntbreekt: false,
    legePlekken: 0,
    legePlekkenPerRol: {},
    aanwezigen: 30,
    minAanwezigen: 13,
    alleenGroepen: false,
    tijd: null,
    ...rest,
  };
}

// De voorbeelddata van het wireframe admin-activiteiten (CLAUDE.md, "Voorbeelddata"): 13 diensten nog in te delen en 1 concept.
const WIREFRAME: OverzichtRij[] = [
  rij('Bonte Avond', '2027-01-22', {
    tijd: '18:30:00',
    legePlekken: 1,
    legePlekkenPerRol: { werker: 1 },
    aanwezigen: 27,
  }),
  rij('Bonte Avond', '2027-01-23', { tijd: '18:30:00', aanwezigen: 30 }),
  // Een vergadering heeft geen minimum (BA-5: zonder deadline en minimum geldt de ondergrens niet): 9 aanwezig is op orde.
  rij('Bestuursvergadering', '2027-01-25', {
    tijd: '20:00:00',
    aanwezigen: 9,
    alleenGroepen: true,
    minAanwezigen: null,
  }),
  rij('Oud papier noord', '2027-02-05', {
    tijd: '09:00:00',
    legePlekken: 2,
    legePlekkenPerRol: { werker: 2 },
    aanwezigen: 40,
  }),
  rij('Jeugdmiddag', '2027-02-06', {
    tijd: '13:30:00',
    status: 'concept',
    eindtijdOntbreekt: true,
    eindverantwoordelijkeOntbreekt: true,
    legePlekken: 2,
    legePlekkenPerRol: { werker: 1, eindverantwoordelijke: 1 },
  }),
  rij('Oud papier zuid', '2027-02-06', { tijd: '09:00:00', aanwezigen: 39 }),
  rij('Optocht', '2027-02-07', {
    tijd: '13:00:00',
    legePlekken: 8,
    legePlekkenPerRol: { werker: 3, drankhaler: 3, fotograaf: 2 },
    aanwezigen: 38,
  }),
  rij('Pulverkesbal', '2027-02-08', { tijd: '15:00:00', aanwezigen: 14 }),
];

describe('maakOverzicht', () => {
  const overzicht = maakOverzicht(WIREFRAME, VANDAAG, 'alles');

  it('telt de diensten en de concepten uit dezelfde rijen als de lijst', () => {
    expect(overzicht.tellers).toEqual({ diensten: 13, concepten: 1 });
  });

  it('zet onder "Vraagt aandacht" per regel de taak in woorden, op datum', () => {
    expect(overzicht.aandacht.map((r) => [r.dag, r.naam, r.tijd, r.taak])).toEqual([
      ['Morgen', 'Bonte Avond', '18:30', '1 werker indelen'],
      ['vr 5 februari', 'Oud papier noord', '09:00', '2 werkers indelen'],
      [
        'za 6 februari',
        'Jeugdmiddag',
        '13:30',
        'Eindtijd en eindverantwoordelijke invullen, 1 werker indelen',
      ],
      ['zo 7 februari', 'Optocht', '13:00', '8 plekken indelen'],
      ['ma 8 februari', 'Pulverkesbal', '15:00', 'Bijna te weinig: 14 aanwezig, minimaal 13'],
    ]);
  });

  it('zet de rest onder "Op orde" met het aantal aanwezigen', () => {
    expect(overzicht.opOrde.map((r) => [r.dag, r.naam, r.aanwezigheid])).toEqual([
      ['za 23 januari', 'Bonte Avond', '30 aanwezig'],
      ['ma 25 januari', 'Bestuursvergadering', '9 aanwezig · alleen voor een groep'],
      ['za 6 februari', 'Oud papier zuid', '39 aanwezig'],
    ]);
  });

  it('geeft een concept het label en geen aanwezigen (leden zien het nog niet)', () => {
    const jeugdmiddag = overzicht.aandacht.find((r) => r.naam === 'Jeugdmiddag');
    expect(jeugdmiddag?.status).toBe('concept');
    expect(jeugdmiddag?.aanwezigheid).toBeNull();
  });

  it('filtert op diensten: wie nog plekken open heeft, met de tellers ongewijzigd', () => {
    const gefilterd = maakOverzicht(WIREFRAME, VANDAAG, 'diensten');
    expect(gefilterd.aandacht.map((r) => r.naam)).toEqual([
      'Bonte Avond',
      'Oud papier noord',
      'Jeugdmiddag',
      'Optocht',
    ]);
    expect(gefilterd.opOrde).toEqual([]);
    expect(gefilterd.tellers).toEqual({ diensten: 13, concepten: 1 });
  });

  it('filtert op concepten', () => {
    const gefilterd = maakOverzicht(WIREFRAME, VANDAAG, 'concepten');
    expect(gefilterd.aandacht.map((r) => r.naam)).toEqual(['Jeugdmiddag']);
  });

  it('toont een geannuleerde activiteit niet', () => {
    const met = [...WIREFRAME, rij('Afgelast', '2027-02-09', { status: 'geannuleerd', legePlekken: 5 })];
    const uit = maakOverzicht(met, VANDAAG, 'alles');
    expect(uit.tellers.diensten).toBe(13);
    expect([...uit.aandacht, ...uit.opOrde].some((r) => r.naam === 'Afgelast')).toBe(false);
  });

  it('zet een activiteit zonder tijd na die met een tijd op dezelfde dag, en is stabiel op naam', () => {
    const dag = [
      rij('Zonder tijd', '2027-02-01'),
      rij('Beta', '2027-02-01', { tijd: '20:00:00' }),
      rij('Alfa', '2027-02-01', { tijd: '20:00:00' }),
    ];
    expect(maakOverzicht(dag, VANDAAG, 'alles').opOrde.map((r) => r.naam)).toEqual([
      'Alfa',
      'Beta',
      'Zonder tijd',
    ]);
  });

  it('wijzigt de invoer niet', () => {
    const kopie = [...WIREFRAME];
    maakOverzicht(WIREFRAME, VANDAAG, 'alles');
    expect(WIREFRAME).toEqual(kopie);
  });
});

describe('invulTaak', () => {
  const niets = {
    starttijdOntbreekt: false,
    eindtijdOntbreekt: false,
    locatieOntbreekt: false,
    eindverantwoordelijkeOntbreekt: false,
  };

  it('is leeg als alles er is', () => {
    expect(invulTaak(niets)).toBeNull();
  });

  it('noemt wat ontbreekt, met een hoofdletter en een opsomming', () => {
    expect(invulTaak({ ...niets, eindtijdOntbreekt: true })).toBe('Eindtijd invullen');
    expect(invulTaak({ ...niets, eindtijdOntbreekt: true, eindverantwoordelijkeOntbreekt: true })).toBe(
      'Eindtijd en eindverantwoordelijke invullen',
    );
    expect(
      invulTaak({
        starttijdOntbreekt: true,
        eindtijdOntbreekt: true,
        locatieOntbreekt: true,
        eindverantwoordelijkeOntbreekt: true,
      }),
    ).toBe('Starttijd, eindtijd, locatie en eindverantwoordelijke invullen');
  });
});

describe('indeelTaak', () => {
  it('is leeg zonder lege plekken, en negeert de eindverantwoordelijke en de bak', () => {
    expect(indeelTaak({})).toBeNull();
    expect(indeelTaak({ eindverantwoordelijke: 1, bak: 14 })).toBeNull();
  });

  it('noemt de rol als het om één soort gaat, in het enkelvoud of meervoud', () => {
    expect(indeelTaak({ werker: 1 })).toBe('1 werker indelen');
    expect(indeelTaak({ werker: 2 })).toBe('2 werkers indelen');
    expect(indeelTaak({ drankhaler: 3 })).toBe('3 drankhalers indelen');
    expect(indeelTaak({ fotograaf: 1 })).toBe('1 fotograaf indelen');
    expect(indeelTaak({ fotograaf: 2 })).toBe('2 fotografen indelen');
    expect(indeelTaak({ bob: 1 })).toBe('1 BOB indelen');
    expect(indeelTaak({ bob: 2 })).toBe("2 BOB's indelen");
  });

  it('zegt "plekken" als het om meer dan één soort gaat, ook zonder de eindverantwoordelijke', () => {
    expect(indeelTaak({ werker: 3, drankhaler: 3, fotograaf: 2 })).toBe('8 plekken indelen');
    expect(indeelTaak({ werker: 1, drankhaler: 1, eindverantwoordelijke: 1 })).toBe('2 plekken indelen');
    // Eén soort naast de eindverantwoordelijke: de eindverantwoordelijke staat in de invultaak.
    expect(indeelTaak({ werker: 1, eindverantwoordelijke: 1 })).toBe('1 werker indelen');
  });

  it('noemt een eigen rol bij zijn naam, in plekken', () => {
    expect(indeelTaak({ Garderobe: 2 })).toBe('2 garderobe-plekken indelen');
    expect(indeelTaak({ Garderobe: 1 })).toBe('1 garderobe-plek indelen');
  });

  it('noemt de nieuwe rollen met hun eigen woorden', () => {
    expect(indeelTaak({ tapper: 2 })).toBe('2 tappers indelen');
    expect(indeelTaak({ ober: 1 })).toBe('1 ober indelen');
    expect(indeelTaak({ bonnenkassa: 1 })).toBe('1 bonnenkassa-plek indelen');
    expect(indeelTaak({ buffet: 3 })).toBe('3 buffet-plekken indelen');
  });
});

describe('bezettingTaak', () => {
  it('waarschuwt bij het minimum en één erboven, niet daarboven', () => {
    expect(bezettingTaak({ aanwezigen: 14, minAanwezigen: 13 })).toBe(
      'Bijna te weinig: 14 aanwezig, minimaal 13',
    );
    expect(bezettingTaak({ aanwezigen: 13, minAanwezigen: 13 })).toBe(
      'Bijna te weinig: 13 aanwezig, minimaal 13',
    );
    expect(bezettingTaak({ aanwezigen: 15, minAanwezigen: 13 })).toBeNull();
  });

  it('zegt "te weinig" onder het minimum', () => {
    expect(bezettingTaak({ aanwezigen: 12, minAanwezigen: 13 })).toBe('Te weinig: 12 aanwezig, minimaal 13');
  });

  it('zegt niets als het minimum uit staat', () => {
    expect(bezettingTaak({ aanwezigen: 1, minAanwezigen: null })).toBeNull();
  });
});

describe('dagLabel', () => {
  it('zegt vandaag en morgen, anders de dag', () => {
    expect(dagLabel('2027-01-21', '2027-01-21')).toBe('Vandaag');
    expect(dagLabel('2027-01-22', '2027-01-21')).toBe('Morgen');
    expect(dagLabel('2027-01-23', '2027-01-21')).toBe('za 23 januari');
  });

  it('klopt over het jaarwissel en een schrikkeldag', () => {
    expect(dagLabel('2027-01-01', '2026-12-31')).toBe('Morgen');
    expect(dagLabel('2028-02-29', '2028-02-28')).toBe('Morgen');
    expect(dagLabel('2028-03-01', '2028-02-28')).toBe('wo 1 maart');
  });
});

describe('leesFilter en leesPlekkenPerRol', () => {
  it('kent alleen de twee filters', () => {
    expect(leesFilter('diensten')).toBe('diensten');
    expect(leesFilter('concepten')).toBe('concepten');
    expect(leesFilter(['concepten', 'diensten'])).toBe('concepten');
    for (const fout of [undefined, '', 'alles', 'Diensten', 'x']) expect(leesFilter(fout)).toBe('alles');
  });

  it('leest de lege plekken per rol en negeert wat er niet in past', () => {
    expect(leesPlekkenPerRol({ werker: 2, drankhaler: 0, bob: -1, fotograaf: 1.5, x: 'een' })).toEqual({
      werker: 2,
    });
    expect(leesPlekkenPerRol(null)).toEqual({});
    expect(leesPlekkenPerRol([1, 2])).toEqual({});
    expect(leesPlekkenPerRol('werker')).toEqual({});
  });
});

describe('maakRij', () => {
  const basis = {
    activiteit_id: 'id',
    naam: 'Optocht',
    datum: '2027-02-07',
    status: 'gepubliceerd',
    starttijd_ontbreekt: false,
    eindtijd_ontbreekt: false,
    locatie_ontbreekt: false,
    eindverantwoordelijke_ontbreekt: false,
    lege_plekken: 2,
    lege_plekken_per_rol: { werker: 2 },
    aanwezigen: 38,
    min_aanwezigen: 13,
    alleen_groepen: false,
  };

  it('maakt een rij uit het antwoord van de database', () => {
    expect(maakRij(basis, '13:00:00')[0]).toMatchObject({
      activiteitId: 'id',
      legePlekken: 2,
      legePlekkenPerRol: { werker: 2 },
      tijd: '13:00:00',
    });
  });

  it('slaat een status over die we niet kennen', () => {
    expect(maakRij({ ...basis, status: 'verwijderd' }, null)).toEqual([]);
  });
});
