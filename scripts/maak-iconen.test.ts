import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

import { BRON, DOEL, GEWICHTEN, ICONEN, leesBestand, leesSvg, maakData } from './maak-iconen.ts';

const GOED =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M224,128a8,8,0,0,1-8,8Z"/></svg>';

test('leesSvg geeft de paden van een Phosphor-bestand', () => {
  assert.deepEqual(leesSvg(GOED, 'x'), ['M224,128a8,8,0,0,1-8,8Z']);
  assert.deepEqual(leesSvg(GOED.replace('</svg>', '<path d="M1,1Z"/></svg>'), 'x'), [
    'M224,128a8,8,0,0,1-8,8Z',
    'M1,1Z',
  ]);
});

test('leesSvg weigert alles wat geen eenvoudig Phosphor-bestand is', () => {
  const fout: Record<string, string> = {
    'een script': GOED.replace('</svg>', '<script>alert(1)</script></svg>'),
    'een groep': GOED.replace('<path', '<g><path').replace('</svg>', '</g></svg>'),
    'een afbeelding': GOED.replace('</svg>', '<image href="x"/></svg>'),
    'een stijl': GOED.replace('</svg>', '<style>*{}</style></svg>'),
    'een eventattribuut': GOED.replace('<path ', '<path onload="x" '),
    'een andere kop': GOED.replace('0 0 256 256', '0 0 24 24'),
    'zonder pad': GOED.replace(/<path[^>]*>/, ''),
    'ongeldige padgegevens': GOED.replace('M224', 'url(#x)'),
    'andere tekst eromheen': GOED.replace('</svg>', 'tekst</svg>'),
  };
  for (const [wat, tekst] of Object.entries(fout)) assert.throws(() => leesSvg(tekst, 'x'), Error, wat);
});

test('data.ts is precies wat het script uit de iconen maakt', () => {
  assert.equal(readFileSync(DOEL, 'utf8'), maakData(leesBestand));
});

test('elk bronbestand wordt gebruikt, en elk gebruikt icoon heeft zijn bestand', () => {
  const gebruikt = new Set<string>();
  for (const { phosphor, gewichten } of Object.values(ICONEN)) {
    for (const gewicht of gewichten) gebruikt.add(`${gewicht}/${phosphor}.svg`);
  }
  const aanwezig = new Set<string>();
  for (const gewicht of GEWICHTEN) {
    for (const naam of readdirSync(`${BRON}/${gewicht}`)) aanwezig.add(`${gewicht}/${naam}`);
  }
  assert.deepEqual([...gebruikt].sort(), [...aanwezig].sort());
});

test('elk icoon met een vet gewicht heeft ook een gewoon gewicht', () => {
  for (const [naam, { gewichten }] of Object.entries(ICONEN)) {
    assert.ok(gewichten.includes('regular'), `${naam} mist regular`);
  }
});
