import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ICOON_DATA, type IcoonNaam } from './data';
import { Icoon } from './icoon';

const namen = Object.keys(ICOON_DATA) as IcoonNaam[];

describe('Icoon', () => {
  it('toont elk icoon als svg met paden', () => {
    for (const naam of namen) {
      const html = renderToStaticMarkup(<Icoon naam={naam} />);
      expect(html, naam).toMatch(/^<svg [^>]*viewBox="0 0 256 256"/);
      expect(html, naam).toContain('<path d="');
    }
  });

  it('is versiering zonder label: verborgen voor schermlezers, niet te focussen', () => {
    const html = renderToStaticMarkup(<Icoon naam="pijl-links" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    expect(html).not.toContain('role=');
    expect(html).not.toContain('aria-label');
  });

  it('krijgt met een label een naam voor schermlezers', () => {
    const html = renderToStaticMarkup(<Icoon naam="kruis" label="Sluiten" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Sluiten"');
    expect(html).not.toContain('aria-hidden');
  });

  it('kiest het vette gewicht als dat er is, en valt anders terug op het gewone', () => {
    const regular = renderToStaticMarkup(<Icoon naam="plus" />);
    const bold = renderToStaticMarkup(<Icoon naam="plus" gewicht="bold" />);
    expect(bold).not.toBe(regular);
    // Een icoon zonder vette versie valt terug en geeft dezelfde tekening.
    expect(renderToStaticMarkup(<Icoon naam="pijl-links" gewicht="bold" />)).toBe(
      renderToStaticMarkup(<Icoon naam="pijl-links" />),
    );
  });

  it('erft de kleur en de grootte van de tekst eromheen', () => {
    const html = renderToStaticMarkup(<Icoon naam="info" />);
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain('width="1em"');
  });
});
