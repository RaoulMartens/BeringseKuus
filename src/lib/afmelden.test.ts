import { describe, expect, it } from 'vitest';

import {
  deadlineTekst,
  leesOndergrensQuery,
  maakAanbod,
  momentTekst,
  ondergrensQuery,
  ondergrensUitDetail,
  ONDERGRENS_TEKST,
  vertaalAfmeldfout,
  vertaalIntrekfout,
} from './afmelden';

const TOEKOMST = { status: 'gepubliceerd', eindigtOm: '2099-01-02T00:00:00Z' };
const NU = new Date('2027-01-21T12:00:00Z');

describe('maakAanbod', () => {
  it('biedt afmelden aan voor wie zonder dienst op aanwezig staat', () => {
    expect(maakAanbod(TOEKOMST, NU, false, [])).toEqual({ afmelden: true, intrekken: false, hulp: null });
  });

  it('biedt intrekken aan voor wie is afgemeld, ook als hij eerst een dienst had', () => {
    expect(maakAanbod(TOEKOMST, NU, true, [])).toEqual({ afmelden: false, intrekken: true, hulp: null });
  });

  it('biedt niets aan voor een activiteit die is geweest, geannuleerd of nog geen activiteit is (R15, R9)', () => {
    const geweest = { status: 'gepubliceerd', eindigtOm: '2027-01-21T11:59:59Z' };
    expect(maakAanbod(geweest, NU, false, [])).toEqual({ afmelden: false, intrekken: false, hulp: null });
    expect(maakAanbod(geweest, NU, true, [])).toEqual({ afmelden: false, intrekken: false, hulp: null });
    expect(maakAanbod({ ...TOEKOMST, status: 'geannuleerd' }, NU, true, [])).toEqual({
      afmelden: false,
      intrekken: false,
      hulp: null,
    });
    expect(maakAanbod({ ...TOEKOMST, status: 'concept' }, NU, false, [])).toEqual({
      afmelden: false,
      intrekken: false,
      hulp: null,
    });
  });

  it('houdt een activiteit die precies nu eindigt voor voorbij (R16)', () => {
    expect(maakAanbod({ status: 'gepubliceerd', eindigtOm: NU.toISOString() }, NU, false, []).afmelden).toBe(
      false,
    );
  });

  it('biedt geen afmelden aan voor BOB of eindverantwoordelijke, maar zegt wie het wel kan (R4)', () => {
    for (const rol of ['bob', 'eindverantwoordelijke']) {
      const aanbod = maakAanbod(TOEKOMST, NU, false, [rol]);
      expect(aanbod.afmelden).toBe(false);
      expect(aanbod.hulp).toContain('alleen het bestuur');
    }
  });

  it('biedt met een dienst nog geen afmelden aan: dat is eerst overdragen (R7, stap D)', () => {
    const aanbod = maakAanbod(TOEKOMST, NU, false, ['werker']);
    expect(aanbod.afmelden).toBe(false);
    expect(aanbod.hulp).toContain('eindverantwoordelijke');
  });
});

describe('momentTekst en deadlineTekst', () => {
  it('schrijft een moment in de tijd van Nederland', () => {
    // Winter: 13:32 UTC is 14:32 in Nederland.
    expect(momentTekst('2027-01-21T13:32:00Z')).toBe('21 januari, 14:32');
    // Zomer: 12:05 UTC is 14:05.
    expect(momentTekst('2027-07-01T12:05:00Z')).toBe('1 juli, 14:05');
  });

  it('zegt of de deadline is verstreken; op het moment zelf nog niet (R8)', () => {
    const deadline = '2027-01-22T11:00:00Z';
    expect(deadlineTekst(deadline, new Date('2027-01-21T12:00:00Z'))).toBe(
      '22 januari, 12:00 (nog niet verstreken)',
    );
    expect(deadlineTekst(deadline, new Date(deadline))).toBe('22 januari, 12:00 (nog niet verstreken)');
    expect(deadlineTekst(deadline, new Date('2027-01-22T11:00:01Z'))).toBe('22 januari, 12:00 (verstreken)');
  });

  it('zegt bij geen deadline dat je je vrij kunt afmelden', () => {
    expect(deadlineTekst(null, NU)).toContain('vrij afmelden');
  });
});

describe('ondergrens', () => {
  it('leest de cijfers uit de detail van de database', () => {
    expect(ondergrensUitDetail('{"min": 13, "aanwezigen_na": 12, "aanwezigen_nu": 13}')).toEqual({
      min: 13,
      nu: 13,
      na: 12,
    });
  });

  it('geeft niets als de detail kapot is of iets anders bevat', () => {
    expect(ondergrensUitDetail('geen json')).toBeNull();
    expect(ondergrensUitDetail(undefined)).toBeNull();
    expect(ondergrensUitDetail('{"min": "13", "aanwezigen_na": 12, "aanwezigen_nu": 13}')).toBeNull();
    expect(ondergrensUitDetail('{"min": -1, "aanwezigen_na": 12, "aanwezigen_nu": 13}')).toBeNull();
    expect(ondergrensUitDetail('{"min": 1.5, "aanwezigen_na": 12, "aanwezigen_nu": 13}')).toBeNull();
    expect(ondergrensUitDetail('null')).toBeNull();
  });

  it('zet de cijfers in het adres en leest ze weer terug, en weigert wat er niet uitziet als een aantal', () => {
    expect(ondergrensQuery({ min: 13, nu: 13, na: 12 })).toBe('min=13&nu=13');
    expect(leesOndergrensQuery({ min: '13', nu: '13' })).toEqual({ min: 13, nu: 13 });
    expect(leesOndergrensQuery({ min: '13' })).toBeNull();
    expect(leesOndergrensQuery({ min: 'x', nu: '1' })).toBeNull();
    expect(leesOndergrensQuery({ min: '-1', nu: '1' })).toBeNull();
    expect(leesOndergrensQuery({ min: ['1', '2'], nu: '1' })).toBeNull();
    expect(leesOndergrensQuery({ min: '123456', nu: '1' })).toBeNull();
  });

  it('heeft de tekst van het ontwerp', () => {
    expect(ONDERGRENS_TEKST).toBe(
      'Meld je bij de eindverantwoordelijke, afmelden gaat nu niet i.v.m. laag aantal aanwezigen.',
    );
  });
});

describe('vertaalAfmeldfout', () => {
  it('stuurt een sessie zonder lid naar het inloggen', () => {
    expect(vertaalAfmeldfout('geen_lid', '{}')).toEqual({ soort: 'inloggen' });
  });

  it('behandelt dubbel afmelden als gelukt: het staat al zo', () => {
    expect(vertaalAfmeldfout('al_afgemeld', '{}')).toEqual({ soort: 'afgemeld' });
  });

  it('geeft bij de ondergrens de cijfers door', () => {
    expect(
      vertaalAfmeldfout('onder_ondergrens', '{"min": 13, "aanwezigen_na": 12, "aanwezigen_nu": 13}'),
    ).toEqual({ soort: 'ondergrens', ondergrens: { min: 13, nu: 13, na: 12 } });
    expect(vertaalAfmeldfout('onder_ondergrens', 'kapot')).toEqual({ soort: 'ondergrens', ondergrens: null });
  });

  it('noemt de reden als de activiteit niet meer open is', () => {
    expect(vertaalAfmeldfout('activiteit_niet_open', '{"reden": "afgelopen"}')).toMatchObject({
      soort: 'melding',
      tekst: expect.stringContaining('al geweest') as unknown,
    });
    expect(vertaalAfmeldfout('activiteit_niet_open', '{"reden": "geannuleerd"}')).toMatchObject({
      tekst: expect.stringContaining('geannuleerd') as unknown,
    });
    // Een onbekende of verborgen activiteit: geen reden.
    expect(vertaalAfmeldfout('activiteit_niet_open', '{}')).toMatchObject({
      tekst: expect.stringContaining('niet meer open') as unknown,
    });
  });

  it('legt uit wat een lid met een dienst of beheerrol moet doen', () => {
    expect(vertaalAfmeldfout('heeft_adminrol', '{}')).toMatchObject({ soort: 'melding' });
    expect(vertaalAfmeldfout('heeft_ruilbare_rol', '{}')).toMatchObject({
      soort: 'melding',
      tekst: expect.stringContaining('dienst') as unknown,
    });
  });

  it('geeft bij iets onverwachts een algemene melding zonder de code te noemen', () => {
    const uitkomst = vertaalAfmeldfout('iets_nieuws', '{}');
    expect(uitkomst).toMatchObject({ soort: 'melding' });
    expect(JSON.stringify(uitkomst)).not.toContain('iets_nieuws');
  });
});

describe('vertaalIntrekfout', () => {
  it('behandelt dubbel intrekken als gelukt', () => {
    expect(vertaalIntrekfout('niet_afgemeld', '{}')).toEqual({ soort: 'aanwezig' });
  });

  it('zegt dat een afgelopen activiteit niet meer kan', () => {
    expect(vertaalIntrekfout('activiteit_voorbij', '{}')).toMatchObject({
      tekst: expect.stringContaining('al geweest') as unknown,
    });
  });

  it('stuurt een sessie zonder lid naar het inloggen en vangt de rest algemeen af', () => {
    expect(vertaalIntrekfout('geen_lid', '{}')).toEqual({ soort: 'inloggen' });
    expect(vertaalIntrekfout('activiteit_niet_open', '{"reden": "geannuleerd"}')).toMatchObject({
      tekst: expect.stringContaining('geannuleerd') as unknown,
    });
    expect(vertaalIntrekfout('raar', '{}')).toMatchObject({ soort: 'melding' });
  });
});
