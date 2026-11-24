// Het telefoonnummer op Mijn account: eerst lezen, dan wijzigen. Deze tests leggen de beginstaten vast met de HTML die het formulier maakt;
// wat een klik doet (Wijzig, Annuleren, een fout) bewijst e2e/mijn-account.spec.ts in een echte browser.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// De serveractie raakt cookies en de database; hier is alleen de opbouw van het formulier van belang.
vi.mock('./acties', () => ({ zetTelefoon: vi.fn() }));

import { Telefoonformulier } from './telefoonformulier';

const html = renderToStaticMarkup;

describe('Telefoonformulier', () => {
  it('zonder nummer staat het veld meteen open, en er is geen Annuleren', () => {
    const uit = html(<Telefoonformulier nummer="" />);
    expect(uit).toContain('name="telefoon"');
    expect(uit).toContain('Opslaan');
    expect(uit).not.toContain('Annuleren');
    expect(uit).not.toContain('Wijzig');
  });

  it('met een nummer zie je het als tekst met een knop Wijzig, en geen veld', () => {
    const uit = html(<Telefoonformulier nummer="06 12 34 56 78" />);
    expect(uit).toContain('06 12 34 56 78');
    expect(uit).toContain('Wijzig');
    expect(uit).not.toContain('name="telefoon"');
    expect(uit).not.toContain('Opslaan');
  });

  it('zegt voor een schermlezer wat Wijzig wijzigt', () => {
    expect(html(<Telefoonformulier nummer="06 12 34 56 78" />)).toMatch(
      /Wijzig<span [^>]*> telefoonnummer<\/span>/,
    );
  });

  it('toont wat de pagina onderaan meegeeft, alleen in de leesweergave', () => {
    const link = <a href="/mfa/toestel-kwijt">Telefoon kwijt</a>;
    expect(html(<Telefoonformulier nummer="06 12 34 56 78" onderaan={link} />)).toContain('Telefoon kwijt');
    expect(html(<Telefoonformulier nummer="" onderaan={link} />)).not.toContain('Telefoon kwijt');
  });
});
