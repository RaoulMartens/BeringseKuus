// De terug-link ("← Terug naar …") staat in een eigen balk tussen de bovenbalk en het kopvlak (ontwerp: `.wf-nav`), niet als
// link in de inhoud. Deze tests leggen de plek vast met de HTML die Kader maakt.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Kader } from './kader';

const html = renderToStaticMarkup;

describe('Kader: de terug-link', () => {
  it('staat in een eigen balk tussen de bovenbalk en het kopvlak, niet in de inhoud', () => {
    const uit = html(
      <Kader titel="Mijn account" terug={{ href: '/', tekst: 'Terug naar start' }}>
        <p>Inhoud</p>
      </Kader>,
    );
    const balk = uit.indexOf('aria-label="Terug"');
    expect(balk).toBeGreaterThan(uit.indexOf('<header'));
    expect(balk).toBeLessThan(uit.indexOf('<h1'));
    expect(balk).toBeLessThan(uit.indexOf('Inhoud'));
    expect(uit).toMatch(/<nav [^>]*aria-label="Terug"[^>]*><a href="\/"[^>]*>.*Terug naar start<\/a><\/nav>/);
  });

  it('is er niet zonder terug', () => {
    const uit = html(
      <Kader titel="Start">
        <p>Inhoud</p>
      </Kader>,
    );
    expect(uit).not.toContain('aria-label="Terug"');
  });
});
