// "Je seizoen": de staat van een dienst staat niet alleen in kleur en teken, een schermlezer hoort hem ook.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { SeizoenStop } from '@/lib/mijndiensten';

import { Seizoenslijn } from './seizoenslijn';

const html = renderToStaticMarkup;

const stops: SeizoenStop[] = [
  { activiteitId: 'a', naam: 'Prins Onthulling', datum: '2026-11-14', rol: 'werker', staat: 'gedaan' },
  { activiteitId: 'b', naam: 'Bonte Avond', datum: '2027-01-22', rol: 'drankhaler', staat: 'komt' },
  { activiteitId: 'c', naam: 'Bonte Avond', datum: '2027-01-23', rol: null, staat: 'afgemeld' },
];

describe('Seizoenslijn', () => {
  it('is een genummerde lijst met een regel per dienst, met een korte datum', () => {
    const uit = html(<Seizoenslijn stops={stops} />);
    expect(uit).toMatch(/<h2[^>]*>Je seizoen<\/h2>/);
    expect(uit.match(/<li /g)).toHaveLength(3);
    expect(uit).toContain('14 nov');
    expect(uit).toContain('22 jan');
  });

  it('zegt de staat ook in woorden, en toont de rol', () => {
    const uit = html(<Seizoenslijn stops={stops} />);
    expect(uit).toContain(', gedaan');
    expect(uit).toContain(', komt nog');
    expect(uit).toContain('werker');
    expect(uit).toContain('drankhaler');
  });

  it('noemt een afmelding "afgemeld" zonder rol', () => {
    const uit = html(<Seizoenslijn stops={[stops[2]!]} />);
    expect(uit).toContain('afgemeld');
    expect(uit).not.toContain('werker');
  });

  it('houdt de bolletjes buiten het toegankelijkheidsbeeld (het teken is versiering)', () => {
    const uit = html(<Seizoenslijn stops={stops} />);
    expect(uit.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
