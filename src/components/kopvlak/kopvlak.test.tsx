// Het kopvlak met de confetti (ontwerp: de WebGL-versie). Het canvas is versiering: verborgen voor een schermlezer, vóór de tekst en
// zonder invloed op de koppen. Wat het canvas tekent, bewijst de browser (e2e/ontwerp.spec.ts en het scherm zelf).

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Kopvlak } from './kopvlak';

const html = renderToStaticMarkup;

describe('Kopvlak: de confetti', () => {
  it('heeft een canvas dat voor een schermlezer verborgen is, vóór de tekst', () => {
    const uit = html(<Kopvlak titel="Programma" />);
    const canvas = uit.indexOf('<canvas');
    expect(canvas).toBeGreaterThan(-1);
    expect(uit).toMatch(/<canvas [^>]*aria-hidden="true"/);
    expect(canvas).toBeLessThan(uit.indexOf('<h1'));
  });

  it('houdt precies één h1', () => {
    expect(html(<Kopvlak titel="Programma" datum="Vrijdag 22 januari" />).match(/<h1 /g)).toHaveLength(1);
  });
});
