import { describe, expect, it } from 'vitest';

import { heeftBeheerknop } from './beheer';

describe('heeftBeheerknop', () => {
  it('geeft de knop aan een beheerder en aan wie het kan worden', () => {
    expect(heeftBeheerknop('ok')).toBe(true);
    expect(heeftBeheerknop('mfa_instellen')).toBe(true);
  });

  it('geeft geen knop zonder sessie, aan een lid zonder beheerrechten of aan wie geen lid is', () => {
    expect(heeftBeheerknop(null)).toBe(false);
    expect(heeftBeheerknop('geen_beheerder')).toBe(false);
    expect(heeftBeheerknop('geen_lid')).toBe(false);
  });
});
