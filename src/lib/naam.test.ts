import { describe, expect, it } from 'vitest';

import { hoofdwoord, kleineTussenvoegsels } from './naam';

describe('hoofdwoord', () => {
  it('slaat tussenvoegsels over, met of zonder hoofdletter', () => {
    expect(hoofdwoord('van der Berg')).toBe('Berg');
    expect(hoofdwoord('Van der Voorbeeld')).toBe('Voorbeeld');
    expect(hoofdwoord('De Wit')).toBe('Wit');
  });

  it('kent tussenvoegsels die aan de naam vastzitten', () => {
    expect(hoofdwoord("d'Hondt")).toBe('Hondt');
    expect(hoofdwoord("van 't Hoff")).toBe('Hoff');
    expect(hoofdwoord("'s-Gravesande")).toBe('Gravesande');
  });

  it('valt terug op het eerste woord als alles een tussenvoegsel lijkt', () => {
    expect(hoofdwoord('van den')).toBe('van');
    expect(hoofdwoord('')).toBe('');
  });
});

describe('kleineTussenvoegsels', () => {
  it('zet de tussenvoegsels aan het begin op een kleine letter', () => {
    expect(kleineTussenvoegsels('Van der Voorbeeld')).toBe('van der Voorbeeld');
    expect(kleineTussenvoegsels('Van Dijk')).toBe('van Dijk');
    expect(kleineTussenvoegsels('DE WIT')).toBe('de WIT');
    expect(kleineTussenvoegsels('Van den Test')).toBe('van den Test');
  });

  it('laat de naam zelf en alles daarna ongemoeid', () => {
    expect(kleineTussenvoegsels('Van Der Voorbeeld')).toBe('van der Voorbeeld');
    expect(kleineTussenvoegsels('Test-Van Voorbeeld')).toBe('Test-Van Voorbeeld');
    expect(kleineTussenvoegsels('Test De Voorbeeld')).toBe('Test De Voorbeeld');
  });

  it('kent tussenvoegsels die aan de naam vastzitten', () => {
    expect(kleineTussenvoegsels("D'Hondt")).toBe("d'Hondt");
    expect(kleineTussenvoegsels("Van 'T Hoff")).toBe("van 't Hoff");
  });

  it('laat een achternaam zonder tussenvoegsel en een enkel tussenvoegsel zoals ze zijn', () => {
    expect(kleineTussenvoegsels('Verstraten')).toBe('Verstraten');
    expect(kleineTussenvoegsels('Van')).toBe('Van');
  });

  it('maakt van meerdere spaties één en negeert spaties aan de rand', () => {
    expect(kleineTussenvoegsels('  Van   Dijk ')).toBe('van Dijk');
  });
});
