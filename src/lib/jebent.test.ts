import { describe, expect, it } from 'vitest';

import { jeBent } from './jebent';

describe('jeBent', () => {
  it('is lid zonder groep en zonder beheer', () => {
    expect(jeBent([], false)).toBe('Lid');
  });

  it('noemt alleen de groep, want iedereen is lid', () => {
    expect(jeBent(['Raad van Elf'], false)).toBe('Raad van Elf');
  });

  it('noemt meer groepen en beheer in een nette opsomming', () => {
    expect(jeBent(['Bestuur', 'Dames'], false)).toBe('Bestuur en Dames');
    expect(jeBent(['Raad van Elf'], true)).toBe('Raad van Elf en beheerder');
    expect(jeBent(['Bestuur', 'Dames'], true)).toBe('Bestuur, Dames en beheerder');
  });

  it('noemt beheer zonder groep bij lid', () => {
    expect(jeBent([], true)).toBe('Lid en beheerder');
  });

  it('slaat een lege groepsnaam over', () => {
    expect(jeBent(['', ' '], false)).toBe('Lid');
  });
});
