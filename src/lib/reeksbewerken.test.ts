import { describe, expect, it } from 'vitest';

import {
  bepaalWijziging,
  isLeeg,
  REEKSVELDEN,
  startGroepen,
  startwaarden,
  vertaalReeksfout,
  type DagWaarden,
  type ReeksInvoer,
} from './reeksbewerken';

function dag(rest: Partial<DagWaarden> = {}): DagWaarden {
  return {
    verzameltijd: null,
    starttijd: null,
    eindtijd: null,
    locatie: null,
    bus_vertrektijd: null,
    bus_locatie: null,
    notitie: null,
    groepen: [],
    ...rest,
  };
}

function invoer(rest: Partial<ReeksInvoer> = {}, velden: Partial<ReeksInvoer['velden']> = {}): ReeksInvoer {
  const leeg = Object.fromEntries(REEKSVELDEN.map((v) => [v, ''])) as ReeksInvoer['velden'];
  return {
    velden: { ...leeg, ...velden },
    groepenWijzigen: false,
    groepen: [],
    eindverantwoordelijke: '',
    ...rest,
  };
}

describe('startwaarden', () => {
  it('toont wat alle dagen gemeen hebben, tijden zonder seconden', () => {
    const start = startwaarden([
      dag({ starttijd: '10:00:00', locatie: 'Wieksjlaag' }),
      dag({ starttijd: '10:00', locatie: 'Wieksjlaag ' }),
      dag({ starttijd: '10:00:00', locatie: 'Wieksjlaag' }),
    ]);
    expect(start.starttijd).toEqual({ waarde: '10:00', verschilt: false });
    expect(start.locatie).toEqual({ waarde: 'Wieksjlaag', verschilt: false });
  });

  it('zegt dat een veld leeg is als alle dagen het leeg hebben', () => {
    expect(startwaarden([dag(), dag()]).eindtijd).toEqual({ waarde: '', verschilt: false });
  });

  it('zegt dat de dagen verschillen, ook als een dag leeg is en een dag niet', () => {
    const start = startwaarden([dag({ eindtijd: '21:00' }), dag({ eindtijd: '22:00' }), dag()]);
    expect(start.eindtijd).toEqual({ waarde: '', verschilt: true });
    expect(startwaarden([dag({ notitie: 'a' }), dag()]).notitie.verschilt).toBe(true);
  });
});

describe('startGroepen', () => {
  it('geeft de gedeelde groepen, op volgorde', () => {
    expect(startGroepen([dag({ groepen: ['b', 'a'] }), dag({ groepen: ['a', 'b'] })])).toEqual({
      ids: ['a', 'b'],
      verschilt: false,
    });
    expect(startGroepen([dag(), dag()])).toEqual({ ids: [], verschilt: false });
  });

  it('zegt dat ze verschillen', () => {
    expect(startGroepen([dag({ groepen: ['a'] }), dag()]).verschilt).toBe(true);
  });
});

describe('bepaalWijziging', () => {
  const gelijk = startwaarden([dag({ starttijd: '10:00:00' }), dag({ starttijd: '10:00:00' })]);

  it('neemt alleen wat verandert mee, en zet een tijd om naar HH:MM', () => {
    const w = bepaalWijziging(
      invoer({}, { starttijd: '10:00', eindtijd: '12.30', locatie: ' Wieksjlaag ' }),
      gelijk,
    );
    expect(w.velden).toEqual({ eindtijd: '12:30', locatie: 'Wieksjlaag' });
    expect(w.fouten).toEqual({});
  });

  it('laat een veld dat gelijk blijft met rust', () => {
    expect(bepaalWijziging(invoer({}, { starttijd: '10:00' }), gelijk).velden).toEqual({});
    expect(isLeeg(bepaalWijziging(invoer({}, { starttijd: '10:00' }), gelijk))).toBe(true);
  });

  it('maakt een veld leeg voor alle dagen als alle dagen er dezelfde waarde hadden en de beheerder het leegmaakt', () => {
    expect(bepaalWijziging(invoer(), gelijk).velden).toEqual({ starttijd: null });
  });

  it('laat een veld per dag zoals het is als de dagen verschilden en de beheerder niets invult', () => {
    const verschillend = startwaarden([dag({ eindtijd: '21:00' }), dag({ eindtijd: '22:00' })]);
    expect(bepaalWijziging(invoer(), verschillend).velden).toEqual({});
    // Vult hij wel iets in, dan krijgen alle dagen die waarde.
    expect(bepaalWijziging(invoer({}, { eindtijd: '23:00' }), verschillend).velden).toEqual({
      eindtijd: '23:00',
    });
  });

  it('weigert een tijd die geen tijd is en een tekst die te lang is', () => {
    const w = bepaalWijziging(
      invoer({}, { eindtijd: 'laat', notitie: 'x'.repeat(2001), locatie: 'y'.repeat(201) }),
      gelijk,
    );
    expect(w.fouten.eindtijd).toMatch(/geen tijd/);
    expect(w.fouten.notitie).toMatch(/te lang/);
    expect(w.fouten.locatie).toMatch(/te lang/);
  });

  it('neemt de groepen alleen mee als de beheerder ze wil instellen, zonder dubbelen', () => {
    expect(bepaalWijziging(invoer({ groepen: ['a'] }), gelijk).velden.groepen).toBeUndefined();
    expect(
      bepaalWijziging(invoer({ groepenWijzigen: true, groepen: ['a', 'a', 'b'] }), gelijk).velden.groepen,
    ).toEqual(['a', 'b']);
    // "Iedereen" is een lege lijst: alle groepen eraf.
    expect(bepaalWijziging(invoer({ groepenWijzigen: true, groepen: [] }), gelijk).velden.groepen).toEqual(
      [],
    );
  });

  it('geeft de eindverantwoordelijke door als hij is gekozen', () => {
    expect(bepaalWijziging(invoer({ eindverantwoordelijke: ' id-1 ' }), gelijk).eindverantwoordelijke).toBe(
      'id-1',
    );
    expect(bepaalWijziging(invoer({ eindverantwoordelijke: '' }), gelijk).eindverantwoordelijke).toBeNull();
    expect(
      isLeeg(bepaalWijziging(invoer({ eindverantwoordelijke: 'id-1' }, { starttijd: '10:00' }), gelijk)),
    ).toBe(false);
  });
});

describe('vertaalReeksfout', () => {
  const datums = ['2027-01-04', '2027-01-05', '2027-01-06'];

  it('noemt de dag waar het misging, en zegt dat er niets is gewijzigd', () => {
    const tekst = vertaalReeksfout('publiceren_niet_mogelijk', { ontbreekt: ['eindtijd'], dag: 2 }, datums);
    expect(tekst).toContain('wo 6 januari');
    expect(tekst).toContain('de eindtijd');
    expect(tekst).toMatch(/geen enkele dag iets gewijzigd/);
  });

  it('heeft een eigen tekst voor elke fout die het formulier kan geven', () => {
    const codes = [
      'versie_verouderd',
      'alleen_concept',
      'activiteit_onbekend',
      'activiteit_niet_open',
      'veld_ongeldig',
      'lid_buiten_doelgroep',
      'extern_niet_toegestaan',
      'lid_inactief',
      'dubbelboeking',
      'slot_gewijzigd',
      'groep_onbekend',
      'te_veel_regels',
    ];
    const teksten = codes.map((code) => vertaalReeksfout(code, { dag: 0 }, datums));
    expect(new Set(teksten).size).toBe(codes.length);
    for (const t of teksten) expect(t).toMatch(/geen enkele dag iets gewijzigd/);
  });

  it('zegt bij een ongeldig veld welk veld', () => {
    expect(vertaalReeksfout('veld_ongeldig', { veld: 'starttijd', dag: 1 }, datums)).toContain(
      'de starttijd klopt niet',
    );
    expect(vertaalReeksfout('veld_ongeldig', { veld: 'eindtijd', dag: 0 }, datums)).toMatch(
      /eindtijd kan niet gelijk/,
    );
  });

  it('valt terug op een algemene tekst, zonder dag als die niet bekend is', () => {
    expect(vertaalReeksfout('iets_anders', {}, datums)).toMatch(/niet gelukt/);
    expect(vertaalReeksfout('versie_verouderd', { dag: 9 }, datums)).not.toMatch(/^Op /);
  });
});
