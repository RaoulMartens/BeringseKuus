// De bovenbalk met Beheer als knop naast je naam en naam plus rondje als één link naar Mijn account (ontwerp 24-11-2026).

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Bovenbalk } from './bovenbalk';

const html = renderToStaticMarkup;
const onderdelen = [
  { href: '/', label: 'Start', stip: 1 as const },
  { href: '/programma', label: 'Programma', stip: 2 as const },
  { href: '/programma/mijn', label: 'Mijn diensten', stip: 3 as const, actief: true },
];

describe('Bovenbalk: Beheer en je naam', () => {
  it('zet de knop Beheer buiten het menu, vóór je naam', () => {
    const uit = html(
      <Bovenbalk
        merk="X"
        onderdelen={onderdelen}
        beheer={{ href: '/beheer', actief: false }}
        gebruiker={{ voornaam: 'Sam', href: '/mijn' }}
      />,
    );
    const menu = uit.slice(uit.indexOf('<nav'), uit.indexOf('</nav>'));
    expect(menu).not.toContain('Beheer');
    expect(menu).toContain('Mijn diensten');
    expect(uit.indexOf('>Beheer<')).toBeGreaterThan(uit.indexOf('</nav>'));
    expect(uit.indexOf('>Beheer<')).toBeLessThan(uit.indexOf('Mijn account'));
    expect(uit).not.toContain('aria-current="page">Beheer');
  });

  it('zegt op een beheerscherm dat Beheer de gekozen is', () => {
    const uit = html(
      <Bovenbalk merk="X" onderdelen={onderdelen} beheer={{ href: '/beheer', actief: true }} />,
    );
    expect(uit).toMatch(/<a [^>]*aria-current="page"[^>]*>Beheer<\/a>/);
  });

  it('heeft geen knop Beheer zonder beheer', () => {
    const uit = html(
      <Bovenbalk merk="X" onderdelen={onderdelen} gebruiker={{ voornaam: 'Sam', href: '/mijn' }} />,
    );
    expect(uit).not.toContain('>Beheer<');
  });

  it('maakt naam en rondje samen één link naar Mijn account', () => {
    const uit = html(
      <Bovenbalk merk="X" onderdelen={onderdelen} gebruiker={{ voornaam: 'Sam', href: '/mijn' }} />,
    );
    const links = uit.match(/<a [^>]*href="\/mijn"[^>]*>.*?<\/a>/g) ?? [];
    expect(links).toHaveLength(1);
    expect(links[0]).toContain('aria-label="Mijn account (Sam)"');
    expect(links[0]).toContain('Sam');
    expect(links[0]).toContain('>S<');
  });
});
