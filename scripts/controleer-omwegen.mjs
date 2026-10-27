// Poortcontrole: geen omwegen (bouwgids 14.1).
//
// Een controle uitzetten of een test overslaan om iets groen te krijgen, telt als een fout. Deze controle faalt
// daarom op code die dat doet:
//
//   eslint-disable              een lintregel uitzetten met commentaar
//   ts-ignore en verwanten      een typefout negeren (ook ts-expect-error en ts-nocheck, met een @ ervoor)
//   .only / .skip               een test die alle andere uitzet, of zelf wordt overgeslagen (ook .fixme, .todo)
//
// ESLint (noInlineConfig, ban-ts-comment), Vitest (allowOnly: false) en Playwright (forbidOnly) vangen het meeste
// ook af; deze controle geldt voor alle code, ook de scripts die buiten die gereedschappen vallen.
//
// Gebruik:   node scripts/controleer-omwegen.mjs [--root pad]
// Uitkomst:  "0 problemen" en exitcode 0, of een lijst en exitcode 1.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { lijstBestanden } from './controleer-repo.mjs';

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

// Deze twee bestanden bevatten de patronen zelf.
const EIGEN_BESTANDEN = new Set(['scripts/controleer-omwegen.mjs', 'scripts/controleer-omwegen.test.mjs']);

const OMWEGEN = [
  [/eslint-disable/, 'eslint-disable zet een lintregel uit; los de oorzaak op'],
  [/@ts-(?:ignore|expect-error|nocheck)/, 'een typefout negeren; los de oorzaak op'],
  [
    /\b(?:describe|it|test|suite)(?:\.\w+)*\.(?:only|skip|fixme|todo)\b/,
    'een overgeslagen test, of een test die de andere uitzet (.only, .skip, .fixme, .todo)',
  ],
];

/** Controleert alle code in root. Geeft een lijst problemen terug; leeg = goed. */
export function controleerOmwegen(root) {
  const problemen = [];
  for (const pad of lijstBestanden(root)) {
    if (!CODE.test(pad) || EIGEN_BESTANDEN.has(pad)) continue;
    readFileSync(path.join(root, pad), 'utf8')
      .split(/\r?\n/)
      .forEach((lijn, i) => {
        for (const [regex, melding] of OMWEGEN) {
          if (regex.test(lijn)) problemen.push({ pad, regelnummer: i + 1, melding });
        }
      });
  }
  return problemen;
}

function uitvoeren() {
  const argumenten = process.argv.slice(2);
  const i = argumenten.indexOf('--root');
  const root = path.resolve(i >= 0 && argumenten[i + 1] ? argumenten[i + 1] : '.');
  const problemen = controleerOmwegen(root);
  if (problemen.length === 0) {
    console.log('controleer-omwegen: 0 problemen');
    return 0;
  }
  for (const p of problemen) console.error(`FOUT ${p.pad}:${p.regelnummer}: ${p.melding}`);
  console.error(
    `controleer-omwegen: ${problemen.length} ${problemen.length === 1 ? 'probleem' : 'problemen'}`,
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = uitvoeren();
}
