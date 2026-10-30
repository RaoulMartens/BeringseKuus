import { describe, expect, it } from 'vitest';

import { normaliseerInlogcode } from './code';

describe('een inlogcode uit de mail', () => {
  it('behoudt voorloopnullen en accepteert de ingestelde lengte van 6 tot 10 cijfers', () => {
    for (const code of ['001234', '00123456', '0012345678']) {
      expect(normaliseerInlogcode(code)).toBe(code);
    }
  });

  it('verwijdert witruimte die bij het kopieren kan meekomen', () => {
    expect(normaliseerInlogcode(' 0012 3456\n')).toBe('00123456');
  });

  it('weigert ontbrekende, te korte, te lange en niet-numerieke invoer', () => {
    for (const code of [undefined, null, 123456, '', '12345', '12345678901', '12345a', '123456.']) {
      expect(normaliseerInlogcode(code)).toBeNull();
    }
  });
});
