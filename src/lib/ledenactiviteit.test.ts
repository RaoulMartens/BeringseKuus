import { describe, expect, it } from 'vitest';

import {
  dagLabel,
  groepeerRollen,
  isNogNietIngedeeld,
  kiesWelkom,
  maakJouwstatus,
  maakTijdlijn,
  rolLabel,
  telefoonBijEindverantwoordelijke,
  statusZin,
  volgendeDag,
  type LedenActiviteit,
} from './ledenactiviteit';

function activiteit(extra: Partial<LedenActiviteit> = {}): LedenActiviteit {
  return {
    id: 'a',
    naam: 'Bonte Avond',
    datum: '2027-01-22',
    verzameltijd: '18:30:00',
    starttijd: '20:00:00',
    eindtijd: '01:00:00',
    locatie: 'Gemeenschapshuis De Kuus, Kerkstraat 12',
    busVertrektijd: null,
    busLocatie: null,
    notitie: null,
    status: 'gepubliceerd',
    eindigtOm: '2027-01-23T00:00:00+00:00',
    ...extra,
  };
}

// Donderdag 21 januari 2027, 12:00 in Nederland.
const NU = new Date('2027-01-21T11:00:00Z');
const VANDAAG = '2027-01-21';

describe('volgendeDag', () => {
  it('telt op de kalender, ook over een maand- en jaarwissel en de zomertijd', () => {
    expect(volgendeDag('2027-01-21')).toBe('2027-01-22');
    expect(volgendeDag('2027-01-31')).toBe('2027-02-01');
    expect(volgendeDag('2026-12-31')).toBe('2027-01-01');
    expect(volgendeDag('2027-03-27')).toBe('2027-03-28');
  });
});

describe('dagLabel', () => {
  it('noemt vandaag en morgen, en anders de dag voluit', () => {
    expect(dagLabel('2027-01-21', VANDAAG)).toBe('Vandaag, donderdag 21 januari');
    expect(dagLabel('2027-01-22', VANDAAG)).toBe('Morgen, vrijdag 22 januari');
    expect(dagLabel('2027-02-06', VANDAAG)).toBe('Zaterdag 6 februari');
  });
});

describe('kiesWelkom', () => {
  it('kiest de eerstvolgende activiteit', () => {
    const later = activiteit({ id: 'b', datum: '2027-02-06', eindigtOm: '2027-02-06T23:00:00+00:00' });
    expect(kiesWelkom([later, activiteit()], VANDAAG, NU).map((a) => a.id)).toEqual(['a']);
  });

  it('toont alle activiteiten van die dag, op tijd (twee op één dag)', () => {
    const middag = activiteit({
      id: 'm',
      datum: '2027-02-06',
      starttijd: '14:00:00',
      verzameltijd: '13:30:00',
    });
    const ochtend = activiteit({
      id: 'o',
      datum: '2027-02-06',
      starttijd: null,
      verzameltijd: '09:00:00',
      eindigtOm: '2027-02-06T11:00:00+00:00',
    });
    const andere = activiteit({ id: 'x', datum: '2027-02-07' });
    expect(kiesWelkom([middag, andere, ochtend], VANDAAG, NU).map((a) => a.id)).toEqual(['o', 'm']);
  });

  it('laat een activiteit van vandaag staan tot hij voorbij is (R16)', () => {
    const vandaag = activiteit({ id: 'v', datum: VANDAAG, eindigtOm: '2027-01-21T22:00:00+00:00' });
    const morgen = activiteit({ id: 'g' });
    expect(kiesWelkom([vandaag, morgen], VANDAAG, NU).map((a) => a.id)).toEqual(['v']);
    expect(kiesWelkom([vandaag, morgen], VANDAAG, new Date('2027-01-21T22:00:00Z')).map((a) => a.id)).toEqual(
      ['g'],
    );
  });

  it('toont een activiteit van gisteren die na middernacht nog loopt (de Bonte Avond om 00:30)', () => {
    // Vrijdag 22 januari 20:11 tot zaterdag 01:11; het is zaterdag 23 januari 00:30 in Nederland.
    const bonteAvond = activiteit({
      id: 'b',
      datum: '2027-01-22',
      starttijd: '20:11:00',
      eindtijd: '01:11:00',
      eindigtOm: '2027-01-23T00:11:00+00:00',
    });
    const zaterdag = activiteit({
      id: 'z',
      datum: '2027-01-23',
      eindigtOm: '2027-01-23T22:00:00+00:00',
    });
    const halfEen = new Date('2027-01-22T23:30:00Z');
    expect(kiesWelkom([zaterdag, bonteAvond], '2027-01-23', halfEen).map((a) => a.id)).toEqual(['b', 'z']);
    // Na het einde (01:11) blijft alleen de zaterdag over.
    expect(
      kiesWelkom([zaterdag, bonteAvond], '2027-01-23', new Date('2027-01-23T00:11:00Z')).map((a) => a.id),
    ).toEqual(['z']);
  });

  it('slaat concepten, geannuleerde en geweest zijnde activiteiten over', () => {
    const geweest = activiteit({ id: 'w', datum: '2027-01-10', eindigtOm: '2027-01-10T23:00:00+00:00' });
    expect(
      kiesWelkom(
        [activiteit({ id: 'c', status: 'concept' }), activiteit({ id: 'g', status: 'geannuleerd' }), geweest],
        VANDAAG,
        NU,
      ),
    ).toEqual([]);
  });

  it('is leeg zonder activiteiten', () => {
    expect(kiesWelkom([], VANDAAG, NU)).toEqual([]);
  });
});

describe('maakTijdlijn', () => {
  it('zonder bus verzamel je bij de locatie en begint de activiteit daar', () => {
    expect(maakTijdlijn(activiteit())).toEqual([
      { tijd: '18:30', wat: 'Verzamelen', plek: 'Gemeenschapshuis De Kuus, Kerkstraat 12' },
      { tijd: '20:00', wat: 'Begint' },
      { tijd: '01:00', wat: 'Is afgelopen' },
    ]);
  });

  it('met bus verzamel je bij de bus en is de locatie waar je naartoe gaat', () => {
    const stops = maakTijdlijn(
      activiteit({ busVertrektijd: '18:45:00', busLocatie: 'Parkeerplaats Sporthal' }),
    );
    expect(stops).toEqual([
      { tijd: '18:30', wat: 'Verzamelen', plek: 'Parkeerplaats Sporthal' },
      { tijd: '18:45', wat: 'Bus vertrekt', icoon: 'bus' },
      { tijd: '20:00', wat: 'Begint', plek: 'Gemeenschapshuis De Kuus, Kerkstraat 12' },
      { tijd: '01:00', wat: 'Is afgelopen' },
    ]);
  });

  it('zet de vertrekplaats bij de bus zelf als er geen verzameltijd is', () => {
    const stops = maakTijdlijn(
      activiteit({ verzameltijd: null, busVertrektijd: '18:45:00', busLocatie: 'Parkeerplaats Sporthal' }),
    );
    expect(stops[0]).toEqual({
      tijd: '18:45',
      wat: 'Bus vertrekt',
      icoon: 'bus',
      plek: 'Parkeerplaats Sporthal',
    });
    expect(stops[1]).toEqual({
      tijd: '20:00',
      wat: 'Begint',
      plek: 'Gemeenschapshuis De Kuus, Kerkstraat 12',
    });
  });

  it('met bus maar zonder bekende vertrekplaats staat bij Verzamelen geen plaats, en de locatie bij Begint', () => {
    const stops = maakTijdlijn(activiteit({ busVertrektijd: '18:45:00' }));
    expect(stops[0]).toEqual({ tijd: '18:30', wat: 'Verzamelen' });
    expect(stops[2]).toEqual({
      tijd: '20:00',
      wat: 'Begint',
      plek: 'Gemeenschapshuis De Kuus, Kerkstraat 12',
    });
  });

  it('zet de locatie bij het einde als de activiteit geen begintijd heeft en er een bus rijdt', () => {
    const stops = maakTijdlijn(
      activiteit({ starttijd: null, busVertrektijd: '18:45:00', busLocatie: 'Parkeerplaats Sporthal' }),
    );
    expect(stops.at(-1)).toEqual({
      tijd: '01:00',
      wat: 'Is afgelopen',
      plek: 'Gemeenschapshuis De Kuus, Kerkstraat 12',
    });
  });

  it('toont alleen wat is ingevuld', () => {
    const stops = maakTijdlijn(activiteit({ verzameltijd: null, starttijd: null }));
    expect(stops).toEqual([
      { tijd: '01:00', wat: 'Is afgelopen', plek: 'Gemeenschapshuis De Kuus, Kerkstraat 12' },
    ]);
    expect(
      maakTijdlijn(activiteit({ verzameltijd: null, starttijd: null, eindtijd: null, locatie: null })),
    ).toEqual([]);
  });

  it('laat zonder locatie de plaats weg', () => {
    const stops = maakTijdlijn(activiteit({ busVertrektijd: '18:45:00', locatie: ' ' }));
    expect(stops[0]).toEqual({ tijd: '18:30', wat: 'Verzamelen' });
    expect(stops[2]).toEqual({ tijd: '20:00', wat: 'Begint' });
  });
});

describe('rolbezetting', () => {
  const plekken = [
    { rol: 'drankhaler', lidId: 'm', naam: 'Mark Hendriks' },
    { rol: 'werker', lidId: 'a', naam: 'Anne Smeets' },
    { rol: 'eindverantwoordelijke', lidId: 'g', naam: 'Ger Hermans' },
    { rol: 'werker', lidId: 't', naam: 'Truus Janssen' },
    { rol: 'bak', lidId: 'p', naam: 'Prins Bram' },
  ];

  it('groepeert per rol in de volgorde van het scherm en laat de bak weg', () => {
    const groepen = groepeerRollen(plekken, 'm');
    expect(groepen.map((g) => g.label)).toEqual(['Eindverantwoordelijke', 'Werker', 'Drankhaler']);
    expect(groepen[1]?.namen.map((n) => n.naam)).toEqual(['Anne Smeets', 'Truus Janssen']);
  });

  it('markeert jezelf', () => {
    const groepen = groepeerRollen(plekken, 'm');
    expect(groepen[2]?.namen).toEqual([{ lidId: 'm', naam: 'Mark Hendriks', jij: true }]);
    expect(groepen[1]?.namen.some((n) => n.jij)).toBe(false);
  });

  it('weet of de indeling nog niet is gemaakt', () => {
    expect(isNogNietIngedeeld(groepeerRollen([], 'm'))).toBe(true);
    expect(isNogNietIngedeeld(groepeerRollen([plekken[2]!], 'm'))).toBe(true);
    expect(isNogNietIngedeeld(groepeerRollen(plekken, 'm'))).toBe(false);
  });

  it('kent de labels', () => {
    expect(rolLabel('bob')).toBe('BOB');
    expect(rolLabel('bak')).toBeNull();
  });
});

describe('jouw status', () => {
  const groepen = groepeerRollen(
    [
      { rol: 'drankhaler', lidId: 'm', naam: 'Mark Hendriks' },
      { rol: 'werker', lidId: 'a', naam: 'Anne Smeets' },
    ],
    'm',
  );

  it('zegt aanwezig als drankhaler', () => {
    expect(statusZin(maakJouwstatus('Bonte Avond', groepen, false))).toEqual({
      soort: 'aanwezig',
      tekst: 'Je staat op aanwezig als drankhaler.',
    });
  });

  it('zegt aanwezig zonder dienst als je nergens staat', () => {
    expect(statusZin(maakJouwstatus('Optocht', groepeerRollen([], 'm'), false)).tekst).toBe(
      'Je staat op aanwezig, zonder dienst.',
    );
  });

  it('zegt afgemeld, ook als je een plek hebt', () => {
    expect(statusZin(maakJouwstatus('Bonte Avond', groepen, true))).toEqual({
      soort: 'afgemeld',
      tekst: 'Je bent afgemeld.',
    });
  });
});

describe('telefoonBijEindverantwoordelijke (CR-09)', () => {
  const plekken = [
    { rol: 'werker', lidId: 'a', naam: 'Anne Smeets' },
    { rol: 'eindverantwoordelijke', lidId: 'g', naam: 'Ger Hermans' },
  ];

  it('geeft het nummer als het contact dezelfde persoon is als de eindverantwoordelijke op het scherm', () => {
    expect(
      telefoonBijEindverantwoordelijke(plekken, { naam: 'Ger Hermans', telefoon: '06 12 34 56 78' }),
    ).toBe('06 12 34 56 78');
  });

  it('geeft niets als het bestuur daartussen een ander heeft gekozen: het nummer hoort niet bij de naam', () => {
    expect(
      telefoonBijEindverantwoordelijke(plekken, { naam: 'Piet Opvolger', telefoon: '06 87 65 43 21' }),
    ).toBeNull();
  });

  it('geeft niets zonder contact of zonder eindverantwoordelijke op het scherm', () => {
    expect(telefoonBijEindverantwoordelijke(plekken, null)).toBeNull();
    expect(
      telefoonBijEindverantwoordelijke([plekken[0]!], { naam: 'Ger Hermans', telefoon: '06 12 34 56 78' }),
    ).toBeNull();
  });
});
