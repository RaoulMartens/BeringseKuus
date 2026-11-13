import { describe, expect, it } from 'vitest';

import {
  controleerRegel,
  isImportFout,
  jaarVoorMaand,
  koppelGroepen,
  leesDatum,
  leesRegels,
  leesTijd,
  MAX_REGELS,
  naarServerregels,
  samenvatting,
  vertaalBulkfout,
  vertaalImportfout,
  type Groep,
  type ImportRegel,
} from './activiteitenimport';
import type { Cel } from './xlsx';

const SEIZOEN = 2026; // 2026/2027
const GROEPEN: Groep[] = [
  { id: 'g-bestuur', naam: 'Bestuur' },
  { id: 'g-rv', naam: 'Raad van Elf' },
];

/** Het serienummer dat Excel voor een datum bewaart: dagen sinds 30-12-1899. */
function serie(iso: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

describe('leesDatum', () => {
  it('leest een serienummer van Excel', () => {
    expect(leesDatum(45_000, SEIZOEN)).toBe('2023-03-15');
    expect(leesDatum(serie('2028-02-29'), SEIZOEN)).toBe('2028-02-29');
    expect(leesDatum(serie('2027-01-04') + 0.5, SEIZOEN)).toBe('2027-01-04');
  });

  it('leest tekst in de gewone vormen, met punt, streep of schuine streep', () => {
    expect(leesDatum('11-02-2028', SEIZOEN)).toBe('2028-02-11');
    expect(leesDatum('11/2/2028', SEIZOEN)).toBe('2028-02-11');
    expect(leesDatum('11.02.28', SEIZOEN)).toBe('2028-02-11');
    expect(leesDatum('2028-02-11', SEIZOEN)).toBe('2028-02-11');
    expect(leesDatum(' 5-1-2027 ', SEIZOEN)).toBe('2027-01-05');
  });

  it('neemt zonder jaar het jaar van het seizoen: september tot december het beginjaar, januari tot augustus het eindjaar', () => {
    expect(leesDatum('27-02', SEIZOEN)).toBe('2027-02-27');
    expect(leesDatum('15-11', SEIZOEN)).toBe('2026-11-15');
    expect(leesDatum('27 feb', SEIZOEN)).toBe('2027-02-27');
    expect(leesDatum('11 november', SEIZOEN)).toBe('2026-11-11');
    expect(leesDatum('1 sep', SEIZOEN)).toBe('2026-09-01');
    expect(leesDatum('31 aug', SEIZOEN)).toBe('2027-08-31');
    expect(jaarVoorMaand(9, 2026)).toBe(2026);
    expect(jaarVoorMaand(8, 2026)).toBe(2027);
  });

  it('leest maandnamen en een weekdag ervoor', () => {
    expect(leesDatum('vr 11 feb 2028', SEIZOEN)).toBe('2028-02-11');
    expect(leesDatum('Vrijdag 11 februari 2028', SEIZOEN)).toBe('2028-02-11');
    expect(leesDatum('1 mrt', SEIZOEN)).toBe('2027-03-01');
    expect(leesDatum('4 januari 2027', SEIZOEN)).toBe('2027-01-04');
  });

  it('kent een schrikkeljaar', () => {
    expect(leesDatum('29-02-2028', SEIZOEN)).toBe('2028-02-29');
    expect(leesDatum('29-02-2027', SEIZOEN)).toBeNull();
  });

  it('weigert wat geen datum is', () => {
    for (const fout of [
      '31-02-2027',
      '32-01-2027',
      '1-13-2027',
      'morgen',
      '',
      '   ',
      '11 xyz 2027',
      '1999-01-01',
      '2101-01-01',
      '5',
    ]) {
      expect(leesDatum(fout, SEIZOEN), fout).toBeNull();
    }
    expect(leesDatum(null, SEIZOEN)).toBeNull();
    expect(leesDatum(5, SEIZOEN)).toBeNull();
    expect(leesDatum(Number.NaN, SEIZOEN)).toBeNull();
  });
});

describe('leesTijd', () => {
  it('leest tekst', () => {
    expect(leesTijd('18:30')).toBe('18:30');
    expect(leesTijd('18.30')).toBe('18:30');
    expect(leesTijd('18:30:00')).toBe('18:30');
    expect(leesTijd('9:05')).toBe('09:05');
    expect(leesTijd('19')).toBe('19:00');
    expect(leesTijd(' 0:00 ')).toBe('00:00');
  });

  it('leest een deel van een dag van Excel', () => {
    expect(leesTijd(0.75)).toBe('18:00');
    expect(leesTijd(18.5 / 24)).toBe('18:30');
    expect(leesTijd(0)).toBe('00:00');
    expect(leesTijd(0.99999)).toBeNull(); // rondt af op 24:00
  });

  it('leest een heel uur als getal', () => {
    expect(leesTijd(19)).toBe('19:00');
    expect(leesTijd(24)).toBeNull();
    expect(leesTijd(5.5)).toBeNull();
  });

  it('weigert wat geen tijd is', () => {
    for (const fout of ['24:00', '18:60', 'avond', '', '18:3', '1830'])
      expect(leesTijd(fout), fout).toBeNull();
    expect(leesTijd(null)).toBeNull();
  });
});

const KOP: Cel[] = [
  'naam',
  'datum',
  'verzameltijd',
  'starttijd',
  'eindtijd',
  'locatie',
  'busvertrek',
  'notitie',
  'voor_wie',
];

describe('leesRegels', () => {
  it('maakt regels uit de rijen, met rijnummers van het bestand', () => {
    const uit = leesRegels(
      [
        KOP,
        [
          'Bonte Avond',
          '11-02-2028',
          '18:30',
          0.8125,
          '23:00',
          'De Kuus',
          null,
          'Let op',
          'Bestuur; Raad van Elf',
        ],
        ['Optocht', serie('2028-02-27'), null, '13:00', null, 'Beringe', '12:00', null, null],
      ],
      SEIZOEN,
    );
    if (isImportFout(uit)) throw new Error(uit.code);
    expect(uit.regels).toHaveLength(2);
    expect(uit.regels[0]).toEqual({
      nr: 2,
      naam: 'Bonte Avond',
      datum: '2028-02-11',
      verzameltijd: '18:30',
      starttijd: '19:30',
      eindtijd: '23:00',
      locatie: 'De Kuus',
      busvertrek: '',
      notitie: 'Let op',
      voorWie: 'Bestuur; Raad van Elf',
      meenemen: true,
    });
    expect(uit.regels[1]).toMatchObject({ nr: 3, datum: '2028-02-27', busvertrek: '12:00', voorWie: '' });
  });

  it('herkent kolommen aan hun naam, ongeacht volgorde of hoofdletters, en negeert wat het niet kent', () => {
    const uit = leesRegels(
      [
        ['Locatie', 'Opmerking van het bestuur', 'Starttijd', ' DATUM ', 'Naam'],
        ['Kuus', 'x', '20:00', '5-1-2027', 'Bestuursvergadering'],
      ],
      SEIZOEN,
    );
    if (isImportFout(uit)) throw new Error(uit.code);
    expect(uit.regels[0]).toMatchObject({
      naam: 'Bestuursvergadering',
      datum: '2027-01-05',
      starttijd: '20:00',
      locatie: 'Kuus',
    });
  });

  it('slaat voorbeeldregels en lege rijen over en meldt de voorbeelden', () => {
    const uit = leesRegels(
      [
        KOP,
        ['Voorbeeld: Bonte Avond', '11-02-2028', null, '19:00', null, 'x', null, null, null],
        [null, null, null, null, null, null, null, null, null],
        [],
        ['voorbeeld : Jeugdmiddag', '26-02-2028', null, '14:00', null, 'x', null, null, null],
        ['Echte activiteit', '1-3-2028', null, '19:00', null, 'Kuus', null, null, null],
      ],
      SEIZOEN,
    );
    if (isImportFout(uit)) throw new Error(uit.code);
    expect(uit.voorbeelden).toEqual([2, 5]);
    expect(uit.regels.map((r) => [r.nr, r.naam])).toEqual([[6, 'Echte activiteit']]);
  });

  it('laat een datum of tijd die niet te lezen is leeg, zodat de beheerder hem op de regel invult', () => {
    const uit = leesRegels(
      [KOP, ['X', 'binnenkort', null, 'avond', null, 'Kuus', null, null, null]],
      SEIZOEN,
    );
    if (isImportFout(uit)) throw new Error(uit.code);
    expect(uit.regels[0]).toMatchObject({ datum: '', starttijd: '' });
  });

  it('zegt welke kolommen ontbreken', () => {
    expect(
      leesRegels(
        [
          ['naam', 'locatie'],
          ['X', 'Y'],
        ],
        SEIZOEN,
      ),
    ).toEqual({
      code: 'kolom_ontbreekt',
      kolommen: ['datum', 'starttijd'],
    });
    expect(leesRegels([], SEIZOEN)).toMatchObject({ code: 'kolom_ontbreekt' });
  });

  it('zegt dat er niets in staat', () => {
    expect(leesRegels([KOP], SEIZOEN)).toEqual({ code: 'geen_regels' });
    expect(
      leesRegels([KOP, ['Voorbeeld: X', '1-1-2027', null, '19:00', null, 'x', null, null, null]], SEIZOEN),
    ).toEqual({
      code: 'geen_regels',
    });
  });

  it('begrenst op 200 regels', () => {
    const rij = (i: number): Cel[] => [
      `Activiteit ${i}`,
      '1-3-2027',
      null,
      '19:00',
      null,
      'Kuus',
      null,
      null,
      null,
    ];
    const goed = Array.from({ length: MAX_REGELS }, (_, i) => rij(i));
    expect(isImportFout(leesRegels([KOP, ...goed], SEIZOEN))).toBe(false);
    expect(leesRegels([KOP, ...goed, rij(999)], SEIZOEN)).toEqual({ code: 'te_veel_regels' });
  });
});

function regel(rest: Partial<ImportRegel> = {}): ImportRegel {
  return {
    nr: 2,
    naam: 'Bonte Avond',
    datum: '2028-02-11',
    verzameltijd: '',
    starttijd: '19:00',
    eindtijd: '',
    locatie: 'De Kuus',
    busvertrek: '',
    notitie: '',
    voorWie: '',
    meenemen: true,
    ...rest,
  };
}

describe('controleerRegel', () => {
  it('laat een goede regel door', () => {
    expect(controleerRegel(regel(), GROEPEN)).toEqual({});
    expect(
      controleerRegel(
        regel({ voorWie: 'bestuur; Raad van Elf', eindtijd: '23:00', verzameltijd: '18:30' }),
        GROEPEN,
      ),
    ).toEqual({});
  });

  it('eist naam, datum, starttijd en locatie, elk met zijn eigen melding', () => {
    const fouten = controleerRegel(regel({ naam: ' ', datum: '', starttijd: '', locatie: '' }), GROEPEN);
    expect(Object.keys(fouten).sort()).toEqual(['datum', 'locatie', 'naam', 'starttijd']);
  });

  it('accepteert een datum in de gewone vorm die de beheerder zelf intypt', () => {
    expect(controleerRegel(regel({ datum: '11-02-2028' }), GROEPEN)).toEqual({});
    expect(controleerRegel(regel({ datum: '31-02-2028' }), GROEPEN).datum).toMatch(/geen datum/);
    expect(controleerRegel(regel({ datum: '27 feb' }), GROEPEN).datum).toMatch(/geen datum/); // zonder jaar niet bij het intypen
  });

  it('weigert een tijd die geen tijd is, en een eindtijd gelijk aan de starttijd', () => {
    expect(controleerRegel(regel({ eindtijd: 'laat' }), GROEPEN).eindtijd).toMatch(/geen tijd/);
    expect(controleerRegel(regel({ busvertrek: '25:00' }), GROEPEN).busvertrek).toMatch(/geen tijd/);
    expect(controleerRegel(regel({ eindtijd: '19:00' }), GROEPEN).eindtijd).toMatch(/gelijk/);
    expect(controleerRegel(regel({ eindtijd: '19.00' }), GROEPEN).eindtijd).toMatch(/gelijk/);
  });

  it('noemt een groep die niet bestaat, op naam', () => {
    const fouten = controleerRegel(regel({ voorWie: 'Bestuur; RV 11' }), GROEPEN);
    expect(fouten.voorWie).toContain('“RV 11”');
    expect(fouten.voorWie).toContain('Bestuur, Raad van Elf');
  });

  it('let niet op een regel die niet wordt meegenomen', () => {
    expect(controleerRegel(regel({ meenemen: false, naam: '', datum: 'nee' }), GROEPEN)).toEqual({});
  });
});

describe('koppelGroepen en samenvatting', () => {
  it('koppelt op hoofdletters na, zonder dubbelen, en meldt wat onbekend is', () => {
    expect(koppelGroepen('bestuur;Bestuur;  raad van elf ', GROEPEN)).toEqual({
      ids: ['g-bestuur', 'g-rv'],
      onbekend: [],
    });
    expect(koppelGroepen('Dames', GROEPEN)).toEqual({ ids: [], onbekend: ['Dames'] });
    expect(koppelGroepen('', GROEPEN)).toEqual({ ids: [], onbekend: [] });
  });

  it('telt wat wordt aangemaakt en wat nog niet klopt; een weggelaten regel telt niet mee', () => {
    expect(
      samenvatting(
        [regel(), regel({ naam: '' }), regel({ meenemen: false }), regel({ locatie: '' })],
        GROEPEN,
      ),
    ).toEqual({ aantal: 1, metFouten: 2 });
  });
});

describe('naarServerregels', () => {
  it('maakt van een regel wat de database verwacht, met lege velden weggelaten', () => {
    const uit = naarServerregels(
      [
        regel({
          verzameltijd: '18:30',
          eindtijd: '23:00',
          busvertrek: '17:00',
          notitie: ' Let op ',
          voorWie: 'Bestuur; Raad van Elf',
        }),
        regel({ nr: 3, naam: 'Optocht', datum: '27-02-2028' }),
      ],
      GROEPEN,
    );
    expect(uit.regels[0]).toEqual({
      naam: 'Bonte Avond',
      datum: '2028-02-11',
      starttijd: '19:00',
      locatie: 'De Kuus',
      verzameltijd: '18:30',
      eindtijd: '23:00',
      bus_vertrektijd: '17:00',
      notitie: 'Let op',
      groepen: ['g-bestuur', 'g-rv'],
    });
    // Zonder iets optioneels komt er niets extra mee, en een datum in de vorm van de beheerder wordt ISO.
    expect(uit.regels[1]).toEqual({
      naam: 'Optocht',
      datum: '2028-02-27',
      starttijd: '19:00',
      locatie: 'De Kuus',
    });
    expect(uit.nummers).toEqual([2, 3]);
  });

  it('laat een weggelaten regel weg en houdt de rijnummers bij de juiste regel', () => {
    const uit = naarServerregels(
      [regel({ nr: 2 }), regel({ nr: 3, meenemen: false }), regel({ nr: 4 })],
      GROEPEN,
    );
    expect(uit.regels).toHaveLength(2);
    expect(uit.nummers).toEqual([2, 4]);
  });
});

describe('foutteksten', () => {
  it('heeft voor elke fout bij het lezen een eigen tekst', () => {
    const codes = [
      'geen_xlsx',
      'macro',
      'te_groot',
      'beschadigd',
      'leeg',
      'geen_regels',
      'te_veel_regels',
    ] as const;
    const teksten = codes.map((code) => vertaalImportfout({ code }));
    expect(new Set(teksten).size).toBe(codes.length);
    expect(vertaalImportfout({ code: 'kolom_ontbreekt', kolommen: ['datum', 'locatie'] })).toContain(
      'datum, locatie',
    );
  });

  it('zegt bij een fout van de database in welke rij het misging, en dat er niets is aangemaakt', () => {
    expect(vertaalBulkfout('veld_ontbreekt', 7)).toMatch(/^Rij 7 /);
    expect(vertaalBulkfout('datum_ongeldig', null)).toMatch(/^Een regel /);
    for (const code of ['veld_ontbreekt', 'datum_ongeldig', 'veld_ongeldig', 'groep_onbekend']) {
      expect(vertaalBulkfout(code, 3)).toMatch(/niets aangemaakt/);
    }
    expect(vertaalBulkfout('iets_anders', 3)).toMatch(/niet gelukt/);
  });
});
