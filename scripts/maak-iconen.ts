// Maakt src/components/icoon/data.ts uit de iconen in src/iconen/phosphor (Phosphor Icons, MIT-licentie). Dat bestand is
// gegenereerd en staat in de repository; maak-iconen.test.ts eist dat het gelijk is aan wat dit script maakt, zodat een
// icoon niet per ongeluk met de hand verandert.
//
// Er is bewust geen pakket en geen SVG-loader: de iconen zijn kleine bestanden die één <path> bevatten. Een bestand dat
// iets anders bevat (een script, een afbeelding, een stijl) wordt geweigerd; dat is de controle op iets dat er niet hoort.
//
//   node scripts/maak-iconen.ts          schrijft het bestand
//
// Een icoon toevoegen: zet de SVG in src/iconen/phosphor/regular (en eventueel bold) onder de Phosphor-naam, noem hem in
// ICONEN en draai dit script. Het bestand komt van github.com/phosphor-icons/core (map assets), commit in LEESMIJ.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GEWICHTEN = ['regular', 'bold'] as const;
export type Gewicht = (typeof GEWICHTEN)[number];

/** De naam in de app (Nederlands, wat het icoon betekent) naar de naam in Phosphor, en welke gewichten er zijn. */
export const ICONEN: Record<string, { phosphor: string; gewichten: readonly Gewicht[] }> = {
  'pijl-links': { phosphor: 'arrow-left', gewichten: ['regular'] },
  'pijl-rechts': { phosphor: 'arrow-right', gewichten: ['regular'] },
  kruis: { phosphor: 'x', gewichten: ['regular', 'bold'] },
  'chevron-omlaag': { phosphor: 'caret-down', gewichten: ['regular'] },
  'chevron-rechts': { phosphor: 'caret-right', gewichten: ['regular'] },
  plus: { phosphor: 'plus', gewichten: ['regular', 'bold'] },
  vinkje: { phosphor: 'check', gewichten: ['regular', 'bold'] },
  download: { phosphor: 'download-simple', gewichten: ['regular', 'bold'] },
  locatie: { phosphor: 'map-pin', gewichten: ['regular'] },
  kopie: { phosphor: 'copy', gewichten: ['regular'] },
  telefoon: { phosphor: 'phone', gewichten: ['regular'] },
  kalender: { phosphor: 'calendar', gewichten: ['regular'] },
  klok: { phosphor: 'clock', gewichten: ['regular'] },
  // Vorig seizoen kopiëren (bulk). Phosphor heeft geen "kalender herhalen"; kalender met een plus leest als "nieuwe
  // dagen erbij". Te beoordelen naast het ontwerp, en met één regel hier te wisselen.
  'kalender-herhalen': { phosphor: 'calendar-plus', gewichten: ['regular'] },
  wisselen: { phosphor: 'arrows-left-right', gewichten: ['regular'] },
  verzenden: { phosphor: 'paper-plane-tilt', gewichten: ['regular'] },
  opslaan: { phosphor: 'floppy-disk', gewichten: ['regular'] },
  prullenbak: { phosphor: 'trash', gewichten: ['regular'] },
  'rol-werker': { phosphor: 'hammer', gewichten: ['regular'] },
  'rol-drankhaler': { phosphor: 'beer-stein', gewichten: ['regular'] },
  'rol-fotograaf': { phosphor: 'camera', gewichten: ['regular'] },
  'rol-bob': { phosphor: 'steering-wheel', gewichten: ['regular'] },
  'rol-eindverantwoordelijke': { phosphor: 'shield', gewichten: ['regular'] },
  groep: { phosphor: 'users-three', gewichten: ['regular'] },
  link: { phosphor: 'link', gewichten: ['regular'] },
  concept: { phosphor: 'circle-dashed', gewichten: ['regular'] },
  info: { phosphor: 'info', gewichten: ['regular'] },
  waarschuwing: { phosphor: 'warning', gewichten: ['regular'] },
  fout: { phosphor: 'x-circle', gewichten: ['regular', 'bold'] },
  succes: { phosphor: 'check-circle', gewichten: ['regular', 'bold'] },
  bus: { phosphor: 'bus', gewichten: ['regular'] },
  cirkel: { phosphor: 'circle', gewichten: ['regular'] },
  xlsx: { phosphor: 'file-xls', gewichten: ['regular'] },
};

const HIER = dirname(fileURLToPath(import.meta.url));
export const BRON = join(HIER, '../src/iconen/phosphor');
export const DOEL = join(HIER, '../src/components/icoon/data.ts');

const KOP = /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 256 256" fill="currentColor">/;
const PAD = /<path d="([^"]*)"\/>/g;
const PADGEGEVENS = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\- ]+$/;

/** De paden van één Phosphor-SVG. Weigert alles wat geen eenvoudig bestand met alleen <path>-elementen is. */
export function leesSvg(tekst: string, naam: string): string[] {
  const inhoud = tekst.trim();
  if (!KOP.test(inhoud) || !inhoud.endsWith('</svg>'))
    throw new Error(`${naam}: niet de verwachte Phosphor-kop`);
  const binnen = inhoud.replace(KOP, '').slice(0, -'</svg>'.length);
  const paden = [...binnen.matchAll(PAD)].map((m) => m[1] ?? '');
  // Wat er na het weghalen van alle paden overblijft, is iets anders (een script, een tekst, een groep).
  if (binnen.replace(PAD, '') !== '') throw new Error(`${naam}: bevat meer dan <path>-elementen`);
  if (paden.length === 0) throw new Error(`${naam}: geen pad`);
  for (const d of paden) if (!PADGEGEVENS.test(d)) throw new Error(`${naam}: ongeldige padgegevens`);
  return paden;
}

/** De broncode van data.ts. */
export function maakData(lees: (gewicht: Gewicht, phosphor: string) => string): string {
  const regels: string[] = [];
  for (const [naam, { phosphor, gewichten }] of Object.entries(ICONEN)) {
    const delen = gewichten.map((gewicht) => {
      const paden = leesSvg(lees(gewicht, phosphor), `${gewicht}/${phosphor}`);
      return `${gewicht}: [${paden.map((d) => `'${d}'`).join(', ')}]`;
    });
    regels.push(`  '${naam}': { ${delen.join(', ')} },`);
  }
  return `// Gegenereerd door scripts/maak-iconen.ts uit src/iconen/phosphor (Phosphor Icons, MIT). Niet met de hand wijzigen.
export const ICOON_DATA = {
${regels.join('\n')}
} as const;

export type IcoonNaam = keyof typeof ICOON_DATA;
`;
}

export function leesBestand(gewicht: Gewicht, phosphor: string): string {
  return readFileSync(join(BRON, gewicht, `${phosphor}.svg`), 'utf8');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(DOEL, maakData(leesBestand));
  console.log(
    `maak-iconen: ${Object.keys(ICONEN).length} iconen geschreven naar src/components/icoon/data.ts`,
  );
}
