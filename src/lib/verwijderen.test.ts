import { describe, expect, it } from 'vitest';

import { ingedeeldTekst, naamUitLog, vertaalVerwijderfout } from './verwijderen';

describe('ingedeeldTekst', () => {
  it('zegt wat er met de indeling gebeurt', () => {
    expect(ingedeeldTekst(0)).toBe('Er is nog niemand ingedeeld.');
    expect(ingedeeldTekst(1)).toBe('1 persoon is al ingedeeld. Die indeling verdwijnt.');
    expect(ingedeeldTekst(4)).toBe('4 mensen zijn al ingedeeld. Die indeling verdwijnt.');
  });
});

describe('naamUitLog', () => {
  it('haalt de naam uit de logregel van concept_verwijderen', () => {
    expect(naamUitLog('Jeugdmiddag (06-02-2027) verwijderd als concept')).toBe('Jeugdmiddag');
  });

  it('houdt haakjes en datums in de naam zelf heel', () => {
    expect(naamUitLog('Bal (zaal 2) (01-03-2027) verwijderd als concept')).toBe('Bal (zaal 2)');
  });

  it('geeft niets terug als de regel anders is', () => {
    expect(naamUitLog('Jeugdmiddag aangemaakt')).toBeNull();
    expect(naamUitLog('')).toBeNull();
    expect(naamUitLog(' (06-02-2027) verwijderd als concept')).toBeNull();
  });
});

describe('vertaalVerwijderfout', () => {
  it('kent de codes van concept_verwijderen', () => {
    expect(vertaalVerwijderfout('alleen_concept')).toContain('intussen gepubliceerd');
    expect(vertaalVerwijderfout('activiteit_onbekend')).toBe('Deze activiteit bestaat niet meer.');
  });

  it('valt terug op een algemene tekst', () => {
    expect(vertaalVerwijderfout('iets_nieuws')).toContain('niet gelukt');
    expect(vertaalVerwijderfout('')).toContain('niet gelukt');
  });
});
