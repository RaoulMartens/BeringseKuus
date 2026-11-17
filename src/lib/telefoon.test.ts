import { describe, expect, it } from 'vitest';

import { normaliseerTelefoon } from './telefoon';

describe('normaliseerTelefoon', () => {
  it('geeft een mobiel nummer zonder spaties de vorm van de lijst', () => {
    expect(normaliseerTelefoon('0612345678')).toBe('06 12 34 56 78');
  });

  it('laat een nummer dat al een vorm heeft staan, met één spatie', () => {
    expect(normaliseerTelefoon('06 12 34 56 78')).toBe('06 12 34 56 78');
    expect(normaliseerTelefoon('  06   12 34 56 78 ')).toBe('06 12 34 56 78');
    expect(normaliseerTelefoon('+31 6 1234 5678')).toBe('+31 6 1234 5678');
    expect(normaliseerTelefoon('043-123 45 67')).toBe('043-123 45 67');
  });

  it('weigert wat geen nummer is', () => {
    for (const slecht of [
      '',
      'abc',
      '0612',
      '612345678',
      '06 12 34 56 7x',
      '06.12.34.56.78',
      '0612345678901234567890',
    ]) {
      expect(normaliseerTelefoon(slecht), slecht).toBeNull();
    }
  });

  it('weigert een nummer met te weinig of te veel cijfers', () => {
    expect(normaliseerTelefoon('06 1234 56')).toBeNull();
    expect(normaliseerTelefoon('+31 6 1234 5678 9012 3456')).toBeNull();
  });
});
