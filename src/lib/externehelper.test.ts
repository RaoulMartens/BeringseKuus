import { describe, expect, it } from 'vitest';
import { staatInKeuzelijst } from './externehelper';

describe('staatInKeuzelijst', () => {
  const hier = new Set<string | null>(['extern-hier', null]);

  it('toont een lid altijd', () => {
    expect(staatInKeuzelijst({ id: 'lid-1', type: 'lid' }, hier)).toBe(true);
    expect(staatInKeuzelijst({ id: 'lid-1', type: 'lid' }, new Set())).toBe(true);
  });

  it('toont een externe helper op de activiteit waar hij een plek heeft', () => {
    expect(staatInKeuzelijst({ id: 'extern-hier', type: 'extern' }, hier)).toBe(true);
  });

  it('toont een externe helper niet bij een andere activiteit', () => {
    expect(staatInKeuzelijst({ id: 'extern-elders', type: 'extern' }, hier)).toBe(false);
  });

  it('toont geen externe helper zonder activiteit (nieuw, reeks)', () => {
    expect(staatInKeuzelijst({ id: 'extern-hier', type: 'extern' }, new Set())).toBe(false);
  });

  it('telt een lege plek (bezetter null) niet als helper', () => {
    expect(staatInKeuzelijst({ id: 'null', type: 'extern' }, hier)).toBe(false);
  });
});
