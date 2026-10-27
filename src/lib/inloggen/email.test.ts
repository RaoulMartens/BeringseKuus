import { describe, expect, it } from 'vitest';

import { normaliseerEmailadres } from './email';

describe('normaliseerEmailadres', () => {
  it('accepteert een gewoon adres en maakt het klein, zonder spaties', () => {
    expect(normaliseerEmailadres('  Lid@Example.com ')).toBe('lid@example.com');
  });

  it('weigert iets dat geen adres is', () => {
    for (const fout of [
      '',
      '   ',
      'geen-adres',
      'a@b',
      '@example.com',
      'iemand@',
      'twee woorden@example.com',
    ]) {
      expect(normaliseerEmailadres(fout), fout).toBeNull();
    }
  });

  it('weigert een te lang adres en iets dat geen tekst is', () => {
    expect(normaliseerEmailadres(`${'a'.repeat(250)}@example.com`)).toBeNull();
    expect(normaliseerEmailadres(null)).toBeNull();
    expect(normaliseerEmailadres(42)).toBeNull();
  });
});
