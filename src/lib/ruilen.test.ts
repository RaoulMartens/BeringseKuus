import { describe, expect, it } from 'vitest';

import {
  bevestigHref,
  geluktHref,
  isRuilbaar,
  leesNietGelukt,
  leesTaak,
  nietGeluktHref,
  redenTekst,
  ruilHref,
  stap2Href,
  vertaalRuilfout,
} from './ruilen';

const ID = '11111111-1111-4111-8111-111111111111';
const V = '22222222-2222-4222-8222-222222222222';

describe('isRuilbaar', () => {
  it('laat een lid werker, drankhaler en fotograaf overdragen (R4)', () => {
    for (const rol of ['werker', 'drankhaler', 'fotograaf']) expect(isRuilbaar(rol)).toBe(true);
  });

  it('laat BOB, eindverantwoordelijke en de bak aan het bestuur', () => {
    for (const rol of ['bob', 'eindverantwoordelijke', 'bak', '']) expect(isRuilbaar(rol)).toBe(false);
  });

  it('een lid kan de nieuwe rollen en een eigen rol zelf overdragen, zoals roltypen.ruilbaar_door_lid', () => {
    for (const rol of ['tapper', 'buffet', 'ober', 'bonnenkassa', 'Garderobe'])
      expect(isRuilbaar(rol)).toBe(true);
  });
});

describe('de adressen', () => {
  it('zet de taak alleen in het adres als de overdracht bij afmelden hoort', () => {
    expect(ruilHref(ID)).toBe(`/ruilen/${ID}`);
    expect(ruilHref(ID, 'afmelden')).toBe(`/ruilen/${ID}?taak=afmelden`);
    expect(bevestigHref(ID, V)).toBe(`/ruilen/${ID}/bevestigen?vervanger=${V}`);
    expect(bevestigHref(ID, V, 'afmelden')).toBe(`/ruilen/${ID}/bevestigen?vervanger=${V}&taak=afmelden`);
  });

  it('noemt de vervanger in het adres van het resultaat en van stap 2', () => {
    expect(geluktHref(ID, V)).toBe(`/ruilen/${ID}/gelukt?v=${V}`);
    expect(stap2Href(ID, V)).toBe(`/afmelden/${ID}?stap=2&v=${V}`);
  });

  it('geeft bij een overdracht die niet doorging de reden mee, en de taak als het afmelden was', () => {
    expect(nietGeluktHref(ID, 'afgemeld', V)).toBe(`/ruilen/${ID}/niet-gelukt?reden=afgemeld&v=${V}`);
    expect(nietGeluktHref(ID, 'dubbel', V, 'afmelden')).toBe(
      `/ruilen/${ID}/niet-gelukt?reden=dubbel&v=${V}&taak=afmelden`,
    );
  });
});

describe('leesTaak en leesNietGelukt', () => {
  it('kent alleen de waarden die de pagina zelf maakt', () => {
    expect(leesTaak('afmelden')).toBe('afmelden');
    for (const waarde of [undefined, '', 'iets', ['afmelden']]) expect(leesTaak(waarde)).toBeNull();
    expect(leesNietGelukt('afgemeld')).toBe('afgemeld');
    expect(leesNietGelukt('dubbel')).toBe('dubbel');
    expect(leesNietGelukt('ongeldig')).toBe('ongeldig');
    for (const waarde of [undefined, 'x', ['dubbel']]) expect(leesNietGelukt(waarde)).toBeNull();
  });
});

describe('redenTekst', () => {
  it('zegt waarom iemand niet te kiezen is', () => {
    expect(redenTekst('afgemeld')).toBe('Afgemeld voor deze activiteit');
    expect(redenTekst('al_ingedeeld')).toBe('Staat al op een plek bij deze activiteit');
    expect(redenTekst(null)).toBe('Kan nu niet overnemen');
  });
});

describe('vertaalRuilfout', () => {
  it('stuurt een sessie zonder lid naar het inloggen', () => {
    expect(vertaalRuilfout('geen_lid', '{}')).toEqual({ soort: 'inloggen' });
  });

  it('stuurt wie zijn dienst niet meer heeft naar Start, waar de stand staat', () => {
    expect(vertaalRuilfout('geen_bezetter', '{}')).toEqual({ soort: 'start' });
  });

  it('maakt van een afgemelde, al ingedeelde of ongeldige vervanger een eigen pagina', () => {
    expect(vertaalRuilfout('vervanger_afgemeld', '{}')).toEqual({ soort: 'niet-gelukt', reden: 'afgemeld' });
    expect(vertaalRuilfout('dubbelboeking', '{}')).toEqual({ soort: 'niet-gelukt', reden: 'dubbel' });
    expect(vertaalRuilfout('vervanger_ongeldig', '{"lid_id": null}')).toEqual({
      soort: 'niet-gelukt',
      reden: 'ongeldig',
    });
  });

  it('noemt de reden als de activiteit niet meer open is', () => {
    expect(vertaalRuilfout('activiteit_niet_open', '{"reden": "afgelopen"}')).toMatchObject({
      soort: 'melding',
      tekst: expect.stringContaining('al geweest') as unknown,
    });
    expect(vertaalRuilfout('activiteit_niet_open', '{"reden": "geannuleerd"}')).toMatchObject({
      tekst: expect.stringContaining('geannuleerd') as unknown,
    });
    expect(vertaalRuilfout('activiteit_niet_open', '{}')).toMatchObject({
      tekst: expect.stringContaining('niet meer open') as unknown,
    });
  });

  it('zegt dat een niet-ruilbare dienst alleen het bestuur wijzigt', () => {
    expect(vertaalRuilfout('rol_niet_ruilbaar', '{}')).toMatchObject({
      soort: 'melding',
      tekst: expect.stringContaining('bestuur') as unknown,
    });
  });

  it('geeft bij iets onverwachts een algemene melding zonder de code te noemen', () => {
    const uitkomst = vertaalRuilfout('iets_nieuws', '{}');
    expect(uitkomst).toMatchObject({ soort: 'melding' });
    expect(JSON.stringify(uitkomst)).not.toContain('iets_nieuws');
  });
});
