import { describe, expect, it } from 'vitest';

import {
  bronUitRij,
  controleerKopie,
  dagenTussen,
  isVasteDatum,
  kopieSamenvatting,
  leesInvoerDatum,
  lokaleDelen,
  maakKopie,
  naarInvoer,
  naarKopieServerregels,
  nieuweDeadline,
  plusDagen,
  seizoenVan,
  type BronActiviteit,
  type BronRij,
} from './kopieren';

function bron(over: Partial<BronActiviteit> & { id: string; naam: string; datum: string }): BronActiviteit {
  return {
    verzameltijd: null,
    starttijd: '20:00:00',
    eindtijd: '23:00:00',
    locatie: 'De Kuus',
    bus_vertrektijd: null,
    bus_locatie: null,
    notitie: null,
    afmeld_deadline: null,
    min_aanwezigen: null,
    groepen: [],
    plekken: [],
    ...over,
  };
}

// Een klein vorig seizoen: Elfde van de elfde, twee avonden, de Optocht (de activiteit met de bekende datum) en het Pulverkesbal.
const SEIZOEN: BronActiviteit[] = [
  bron({ id: 'a1', naam: 'Elfde van de elfde', datum: '2026-11-11', starttijd: '11:11:00' }),
  bron({ id: 'a2', naam: 'Bonte Avond', datum: '2027-01-22', verzameltijd: '18:30:00' }),
  bron({ id: 'a3', naam: 'Bonte Avond', datum: '2027-01-23', verzameltijd: '18:30:00' }),
  bron({ id: 'a4', naam: 'Optocht', datum: '2027-02-07', starttijd: '13:00:00' }),
  bron({ id: 'a5', naam: 'Pulverkesbal', datum: '2027-02-08', starttijd: '15:00:00' }),
];

describe('rekenen met datums', () => {
  it('telt dagen zonder last van de zomertijd', () => {
    expect(dagenTussen('2027-02-07', '2028-02-27')).toBe(385);
    expect(dagenTussen('2027-03-27', '2027-03-29')).toBe(2);
    expect(dagenTussen('2027-10-30', '2027-11-01')).toBe(2);
    expect(dagenTussen('2028-02-27', '2027-02-07')).toBe(-385);
  });

  it('schuift een datum, ook over een schrikkeldag', () => {
    expect(plusDagen('2027-02-07', 385)).toBe('2028-02-27');
    expect(plusDagen('2028-02-28', 1)).toBe('2028-02-29');
    expect(plusDagen('2028-02-29', 1)).toBe('2028-03-01');
    expect(plusDagen('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('kent het seizoen van een datum: september tot en met december is het beginjaar', () => {
    expect(seizoenVan('2026-11-11')).toBe(2026);
    expect(seizoenVan('2027-02-07')).toBe(2026);
    expect(seizoenVan('2027-09-01')).toBe(2027);
    expect(seizoenVan('2027-08-31')).toBe(2026);
  });

  it('kent alleen 11 november als vaste datum', () => {
    expect(isVasteDatum('2026-11-11')).toBe(true);
    expect(isVasteDatum('2027-11-11')).toBe(true);
    expect(isVasteDatum('2027-11-12')).toBe(false);
    expect(isVasteDatum('2027-01-11')).toBe(false);
  });

  it('toont en leest een datum als dd-mm-jjjj', () => {
    expect(naarInvoer('2028-02-11')).toBe('11-02-2028');
    expect(leesInvoerDatum('11-02-2028', 2027)).toBe('2028-02-11');
    expect(leesInvoerDatum('27 feb', 2027)).toBe('2028-02-27');
    expect(leesInvoerDatum('31-02-2028', 2027)).toBeNull();
    expect(leesInvoerDatum('', 2027)).toBeNull();
  });
});

describe('maakKopie', () => {
  it('schuift alles evenveel op als de activiteit met de bekende datum, en laat 11 november staan', () => {
    const regels = maakKopie(SEIZOEN, 'a4', '2028-02-27');
    expect(regels.map((r) => [r.bron.naam, r.datum, r.vast])).toEqual([
      ['Elfde van de elfde', '11-11-2027', true],
      ['Bonte Avond', '11-02-2028', false],
      ['Bonte Avond', '12-02-2028', false],
      ['Optocht', '27-02-2028', false],
      ['Pulverkesbal', '28-02-2028', false],
    ]);
  });

  it('toont per regel de datum van het vorige seizoen en zet elke regel op meenemen, op volgorde van datum', () => {
    const regels = maakKopie(SEIZOEN, 'a4', '2028-02-27');
    expect(regels.map((r) => r.oudeDatum)).toEqual([
      '2026-11-11',
      '2027-01-22',
      '2027-01-23',
      '2027-02-07',
      '2027-02-08',
    ]);
    expect(regels.every((r) => r.meenemen)).toBe(true);
    expect(regels.map((r) => r.nr)).toEqual([1, 2, 3, 4, 5]);
  });

  it('zet 11 november in het beginjaar van het nieuwe seizoen, ook als de nieuwe datum in januari valt', () => {
    // De Optocht valt in het nieuwe seizoen in januari 2029: het seizoen is 2028/2029, dus 11-11-2028.
    const regels = maakKopie(SEIZOEN, 'a4', '2029-01-14');
    expect(regels[0]?.datum).toBe('11-11-2028');
  });

  it('geeft niets als de activiteit met de bekende datum niet bestaat', () => {
    expect(maakKopie(SEIZOEN, 'onbekend', '2028-02-27')).toEqual([]);
  });

  it('zet activiteiten op dezelfde dag op naam, zodat de volgorde elke keer hetzelfde is', () => {
    const regels = maakKopie(
      [
        bron({ id: 'x', naam: 'Zaterdagmiddag', datum: '2027-02-06' }),
        bron({ id: 'y', naam: 'Aftreden', datum: '2027-02-06' }),
      ],
      'x',
      '2028-02-05',
    );
    expect(regels.map((r) => r.bron.naam)).toEqual(['Aftreden', 'Zaterdagmiddag']);
  });
});

describe('afmeld-deadline', () => {
  it('leest de tijd op de klok in Nederland, in de winter en in de zomer', () => {
    expect(lokaleDelen('2027-02-05T17:30:00Z')).toEqual({ datum: '2027-02-05', tijd: '18:30' });
    expect(lokaleDelen('2027-07-05T16:30:00Z')).toEqual({ datum: '2027-07-05', tijd: '18:30' });
    // Vlak na middernacht in Nederland is het in UTC nog de vorige dag.
    expect(lokaleDelen('2027-02-05T23:30:00Z')).toEqual({ datum: '2027-02-06', tijd: '00:30' });
  });

  it('houdt dezelfde afstand tot de nieuwe datum en dezelfde tijd op de klok', () => {
    // Twee dagen voor 22 jan 2027, om 18:00.
    expect(nieuweDeadline('2027-01-22', '2027-01-20T17:00:00Z', '2028-02-11')).toBe('2028-02-09T18:00:00');
  });

  it('houdt de tijd op de klok vast als de zomertijd ertussen komt', () => {
    // Wintertijd (UTC+1) in het vorige seizoen, zomertijd in het nieuwe: nog steeds 18:00 op de klok.
    expect(nieuweDeadline('2027-03-20', '2027-03-18T17:00:00Z', '2028-04-15')).toBe('2028-04-13T18:00:00');
  });

  it('heeft geen deadline als er geen was', () => {
    expect(nieuweDeadline('2027-01-22', null, '2028-02-11')).toBeNull();
  });

  it('gaat mee naar de regel voor de database', () => {
    const regels = maakKopie(
      [bron({ id: 'a', naam: 'Bonte Avond', datum: '2027-01-22', afmeld_deadline: '2027-01-20T17:00:00Z' })],
      'a',
      '2028-02-11',
    );
    expect(naarKopieServerregels(regels, 2027).regels[0]?.afmeld_deadline).toBe('2028-02-09T18:00:00');
  });

  it('volgt een datum die de beheerder zelf heeft aangepast', () => {
    const regels = maakKopie(
      [bron({ id: 'a', naam: 'Bonte Avond', datum: '2027-01-22', afmeld_deadline: '2027-01-20T17:00:00Z' })],
      'a',
      '2028-02-11',
    ).map((r) => ({ ...r, datum: '18-02-2028' }));
    expect(naarKopieServerregels(regels, 2027).regels[0]?.afmeld_deadline).toBe('2028-02-16T18:00:00');
  });
});

describe('controleerKopie', () => {
  const [regel] = maakKopie([bron({ id: 'a', naam: 'Optocht', datum: '2027-02-07' })], 'a', '2028-02-27');
  if (!regel) throw new Error('geen regel');

  it('vindt niets mis met een regel die klopt', () => {
    expect(controleerKopie(regel, 2027)).toEqual({});
  });

  it('wil een datum die klopt', () => {
    expect(controleerKopie({ ...regel, datum: '31-02-2028' }, 2027).datum).toMatch(/datum/);
    expect(controleerKopie({ ...regel, datum: '' }, 2027).datum).toMatch(/datum/);
  });

  it('meldt een concept uit het vorige seizoen zonder starttijd of locatie', () => {
    const fouten = controleerKopie(
      { ...regel, bron: { ...regel.bron, starttijd: null, locatie: '  ' } },
      2027,
    );
    expect(Object.keys(fouten).sort()).toEqual(['locatie', 'starttijd']);
  });
});

describe('naarKopieServerregels', () => {
  const rijen = maakKopie(
    [
      bron({
        id: 'a',
        naam: 'Bonte Avond',
        datum: '2027-01-22',
        verzameltijd: '18:30:00',
        bus_vertrektijd: '18:45:00',
        bus_locatie: 'Parkeerplaats Sporthal',
        notitie: 'Neem een jas mee',
        min_aanwezigen: 13,
        groepen: ['g1', 'g2'],
        plekken: [
          { rol_type: 'tapper', aantal: 2 },
          { rol_type: 'drankhaler', aantal: 1 },
        ],
      }),
      bron({ id: 'b', naam: 'Optocht', datum: '2027-02-07' }),
    ],
    'b',
    '2028-02-27',
  );

  it('neemt alles mee wat bij de activiteit hoort, met tijden zonder seconden', () => {
    const { regels, nummers } = naarKopieServerregels(rijen, 2027);
    expect(nummers).toEqual([1, 2]);
    expect(regels[0]).toEqual({
      naam: 'Bonte Avond',
      datum: '2028-02-11',
      starttijd: '20:00',
      eindtijd: '23:00',
      locatie: 'De Kuus',
      verzameltijd: '18:30',
      bus_vertrektijd: '18:45',
      bus_locatie: 'Parkeerplaats Sporthal',
      notitie: 'Neem een jas mee',
      min_aanwezigen: 13,
      groepen: ['g1', 'g2'],
      plekken: [
        { rol_type: 'tapper', aantal: 2 },
        { rol_type: 'drankhaler', aantal: 1 },
      ],
    });
  });

  it('laat lege velden weg', () => {
    const { regels } = naarKopieServerregels(rijen, 2027);
    expect(Object.keys(regels[1] ?? {}).sort()).toEqual([
      'datum',
      'eindtijd',
      'locatie',
      'naam',
      'starttijd',
    ]);
  });

  it('laat een regel weg die niet wordt meegenomen, en houdt de nummers erbij', () => {
    const [eerste, tweede] = rijen;
    if (!eerste || !tweede) throw new Error('te weinig regels');
    const { regels, nummers } = naarKopieServerregels([{ ...eerste, meenemen: false }, tweede], 2027);
    expect(regels.map((r) => r.naam)).toEqual(['Optocht']);
    expect(nummers).toEqual([2]);
  });

  it('slaat een regel over die de controle niet door had mogen laten', () => {
    const [eerste] = rijen;
    if (!eerste) throw new Error('geen regel');
    expect(naarKopieServerregels([{ ...eerste, datum: 'onzin' }], 2027).regels).toEqual([]);
  });

  it('telt de samenvatting: meegenomen regels en regels met een fout', () => {
    const [eerste, tweede] = rijen;
    if (!eerste || !tweede) throw new Error('te weinig regels');
    expect(kopieSamenvatting(rijen, 2027)).toEqual({ aantal: 2, metFouten: 0 });
    expect(
      kopieSamenvatting(
        [
          { ...eerste, datum: 'x' },
          { ...tweede, meenemen: false },
        ],
        2027,
      ),
    ).toEqual({
      aantal: 1,
      metFouten: 1,
    });
  });
});

describe('bronUitRij', () => {
  const rij: BronRij = {
    id: 'a',
    naam: 'Bonte Avond',
    datum: '2027-01-22',
    verzameltijd: null,
    starttijd: '20:00:00',
    eindtijd: null,
    locatie: 'De Kuus',
    bus_vertrektijd: null,
    bus_locatie: null,
    notitie: null,
    afmeld_deadline: null,
    min_aanwezigen: null,
    rol_slots: [
      { rol_type: 'eindverantwoordelijke' },
      { rol_type: 'drankhaler' },
      { rol_type: 'tapper' },
      { rol_type: 'tapper' },
      { rol_type: 'bak' },
      { rol_type: 'bak' },
    ],
    activiteit_groep: [{ groep_id: 'g1' }],
  };

  it('telt de plekken per soort werk, in vaste volgorde, zonder de eindverantwoordelijke en de bak', () => {
    const uit = bronUitRij(rij, new Set(['tapper', 'drankhaler']), ['tapper', 'drankhaler']);
    expect(uit.plekken).toEqual([
      { rol_type: 'tapper', aantal: 2 },
      { rol_type: 'drankhaler', aantal: 1 },
    ]);
    expect(uit.groepen).toEqual(['g1']);
  });
});
