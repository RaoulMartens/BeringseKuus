// De onderdelen zijn semantisch (echte knoppen, koppen en landmarks) en hun toegankelijkheid zit in de opbouw. Deze tests
// leggen dat vast met de HTML die ze maken; het uiterlijk en het contrast (per thema) controleert e2e/ontwerp.spec.ts in
// een echte browser.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Bovenbalk } from './bovenbalk/bovenbalk';
import { Kaart } from './kaart/kaart';
import { Knop } from './knop/knop';
import { Kopvlak } from './kopvlak/kopvlak';
import { Lijst, Lijstrij } from './lijst/lijst';
import { Melding } from './melding/melding';
import { Statuslabel } from './statuslabel/statuslabel';
import { Veld } from './veld/veld';

const html = renderToStaticMarkup;

describe('Knop', () => {
  it('is een echte button, standaard van het type button (verstuurt geen formulier per ongeluk)', () => {
    const uit = html(<Knop>Opslaan</Knop>);
    expect(uit).toMatch(/^<button /);
    expect(uit).toContain('type="button"');
    expect(uit).toContain('>Opslaan</button>');
  });

  it('verstuurt een formulier alleen als dat gevraagd wordt', () => {
    expect(html(<Knop type="submit">Stuur</Knop>)).toContain('type="submit"');
  });

  it('is met een href een link, geen knop', () => {
    const uit = html(<Knop href="/ergens">Ga</Knop>);
    expect(uit).toMatch(/^<a /);
    expect(uit).toContain('href="/ergens"');
    expect(uit).not.toContain('<button');
  });

  it('kan worden uitgeschakeld', () => {
    expect(html(<Knop disabled>Publiceren</Knop>)).toContain('disabled=""');
  });

  it('laat een icoon naast de tekst staan als versiering', () => {
    const uit = html(<Knop icoon="plus">Erbij</Knop>);
    expect(uit).toContain('<svg');
    expect(uit).toContain('aria-hidden="true"');
  });

  it('kent elke soort', () => {
    for (const soort of [
      'primair',
      'positief',
      'negatief',
      'secundair',
      'gevaar',
      'tekst',
      'tekst-gevaar',
    ] as const) {
      expect(html(<Knop soort={soort}>x</Knop>), soort).toContain('<button');
    }
  });
});

describe('Veld', () => {
  it('koppelt het label aan het veld', () => {
    const uit = html(<Veld id="naam" label="Naam" />);
    expect(uit).toContain('<label for="naam"');
    expect(uit).toContain('id="naam"');
  });

  it('koppelt hulp en fout aan het veld en markeert de fout', () => {
    const uit = html(<Veld id="code" label="Code" hulp="6 cijfers" fout="Deze code klopt niet." />);
    expect(uit).toContain('aria-invalid="true"');
    expect(uit).toContain('aria-describedby="code-fout code-hulp"');
    expect(uit).toContain('id="code-fout"');
    expect(uit).toContain('role="alert"');
    expect(uit).toContain('id="code-hulp"');
  });

  it('heeft zonder fout en hulp geen beschrijving en geen foutstaat', () => {
    const uit = html(<Veld id="x" label="X" />);
    expect(uit).not.toContain('aria-describedby');
    expect(uit).not.toContain('aria-invalid');
  });

  it('geeft de gewone invoereigenschappen door', () => {
    const uit = html(<Veld id="e" label="E" type="email" autoComplete="email" required name="email" />);
    expect(uit).toContain('type="email"');
    expect(uit).toContain('autoComplete="email"');
    expect(uit).toContain('required=""');
    expect(uit).toContain('name="email"');
  });
});

describe('Melding', () => {
  it('is standaard een status en een alert alleen als gevraagd', () => {
    expect(html(<Melding>Info</Melding>)).toContain('role="status"');
    expect(
      html(
        <Melding soort="fout" rol="alert">
          Fout
        </Melding>,
      ),
    ).toContain('role="alert"');
  });

  it('heeft een icoon dat versiering is', () => {
    for (const soort of ['info', 'let-op', 'fout', 'succes', 'afgemeld'] as const) {
      expect(html(<Melding soort={soort}>x</Melding>), soort).toContain('aria-hidden="true"');
    }
  });
});

describe('Statuslabel', () => {
  it('toont de tekst, en een icoon bij een status', () => {
    expect(html(<Statuslabel status="concept">Concept</Statuslabel>)).toContain('<svg');
    expect(html(<Statuslabel>Neutraal</Statuslabel>)).not.toContain('<svg');
  });
});

describe('Kaart', () => {
  it('maakt van de titel een kop van het gevraagde niveau', () => {
    expect(html(<Kaart titel="Jouw status">x</Kaart>)).toMatch(/<h2 [^>]*>Jouw status<\/h2>/);
    expect(
      html(
        <Kaart titel="Jouw status" kop="h3">
          x
        </Kaart>,
      ),
    ).toMatch(/<h3 [^>]*>Jouw status<\/h3>/);
  });

  it('heeft zonder titel geen kop', () => {
    expect(html(<Kaart>x</Kaart>)).not.toContain('<h2');
  });
});

describe('Lijst', () => {
  it('is een echte lijst met items', () => {
    const uit = html(
      <Lijst>
        <Lijstrij>A</Lijstrij>
        <Lijstrij>B</Lijstrij>
      </Lijst>,
    );
    expect(uit).toMatch(/^<ul /);
    expect(uit.match(/<li /g)).toHaveLength(2);
  });

  it('maakt van een rij met href een link met een pijltje dat versiering is', () => {
    const uit = html(<Lijstrij href="/a">Rij</Lijstrij>);
    expect(uit).toContain('<a ');
    expect(uit).toContain('href="/a"');
    expect(uit).toContain('aria-hidden="true"');
  });

  it('is zonder href geen link', () => {
    expect(html(<Lijstrij>Rij</Lijstrij>)).not.toContain('<a ');
  });
});

describe('Bovenbalk', () => {
  const balk = (
    <Bovenbalk
      merk="De Vereniging"
      onderdelen={[
        { href: '/start', label: 'Start', stip: 1, actief: true },
        { href: '/programma', label: 'Programma', stip: 2 },
      ]}
      gebruiker={{ voornaam: 'Sam', href: '/mijn' }}
    />
  );

  it('is een header met een navigatie met een naam', () => {
    const uit = html(balk);
    expect(uit).toMatch(/^<header /);
    expect(uit).toContain('<nav aria-label="Hoofdmenu"');
  });

  it('zegt waar je bent met aria-current, en alleen daar', () => {
    const uit = html(balk);
    expect(uit.match(/aria-current="page"/g)).toHaveLength(1);
    expect(uit).toMatch(/aria-current="page"[^>]*>Start</);
  });

  it('geeft het rondje met de gebruiker een naam voor schermlezers', () => {
    expect(html(balk)).toContain('aria-label="Mijn account (Sam)"');
  });

  it('werkt ook zonder gebruiker', () => {
    expect(html(<Bovenbalk merk="X" onderdelen={[]} />)).not.toContain('Mijn account');
  });
});

describe('Kopvlak', () => {
  it('heeft de titel als h1', () => {
    expect(html(<Kopvlak titel="Programma" />)).toMatch(/<h1 [^>]*>Programma<\/h1>/);
  });

  it('toont de datum erboven en een actie rechts als ze er zijn', () => {
    const uit = html(
      <Kopvlak titel="Alaaf" datum="Vrijdag" groot>
        <a href="/terug">Terug</a>
      </Kopvlak>,
    );
    expect(uit).toContain('Vrijdag');
    expect(uit).toContain('href="/terug"');
  });
});
