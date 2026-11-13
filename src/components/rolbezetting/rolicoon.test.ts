import { describe, expect, it } from 'vitest';

import { rolIcoon } from './rolbezetting';

describe('rolIcoon', () => {
  it('geeft elke vaste rol een eigen icoon', () => {
    const rollen = [
      'eindverantwoordelijke',
      'bob',
      'werker',
      'drankhaler',
      'fotograaf',
      'tapper',
      'buffet',
      'ober',
      'bonnenkassa',
    ];
    const iconen = rollen.map((rol) => rolIcoon(rol));
    expect(new Set(iconen).size).toBe(rollen.length);
  });

  it('valt voor een eigen rol terug op het icoon van de werker', () => {
    expect(rolIcoon('iets-anders')).toBe(rolIcoon('werker'));
  });
});
