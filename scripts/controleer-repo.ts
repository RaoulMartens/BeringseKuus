// Poortcontrole voor een publieke repository (bouwgids 14.4 en 14.7, Fase-0-plan punt 1.4).
//
// Alles wat hier staat is voor iedereen leesbaar en blijft in de geschiedenis staan. Deze controle faalt
// daarom op bestanden en tekst die er niet in horen:
//
//   configuratie      de namenlijst ontbreekt (dan kan de controle niet volledig zijn, dus geen groen)
//   licentie          afbeelding, icoon, lettertype, pdf, media of gegevensbestand zonder volledige
//                     vermelding in docs/licenties.md
//   niet-te-controleren  een document of binair bestand waarvan de inhoud niet te lezen is, zonder
//                     beoordeelde uitzondering in scripts/uitzonderingen.json (pad + sha256)
//   geheim-bestand    .env-bestanden, .dev.vars, privésleutels
//   verboden-pad      bestanden uit de ontwerpmap die niet in de repository horen
//   archief           zip en andere archieven (daar kan alles in zitten)
//   ledenbestand      een spreadsheet of csv met "leden" in de naam
//   adres             een e-mailadres dat niet van een voorbeelddomein is
//   telefoon          een Nederlands mobiel nummer dat niet duidelijk verzonnen is
//   sleutel           een tekst die op een sleutel lijkt
//   verboden-woord    een woord uit de namenlijst (persoonsnamen)
//
// De namenlijst komt uit de omgevingsvariabele VERBODEN_WOORDEN (komma's; in GitHub een geheim) of uit het
// bestand .verboden-woorden in de root (één woord per regel; staat in .gitignore). Zonder lijst faalt de controle.
//
// Gebruik:   node scripts/controleer-repo.ts [--root pad]
// Uitkomst:  "0 problemen" en exitcode 0, of een lijst en exitcode 1.
//
// De uitvoer van een CI-run is bij een publieke repository ook openbaar. Waarden die het probleem veroorzaken
// worden daarom niet afgedrukt, en elk woord uit de namenlijst wordt in alle uitvoer (ook in bestandspaden)
// vervangen door ***.
//
// Een bewuste uitzondering maak je niet door deze controle aan te passen, maar zo:
//   - een bestand met een licentie: zet het in docs/licenties.md (bestand, bron, licentie, licentiehouder,
//     toestemming);
//   - een document dat niet als tekst te lezen is: controleer het met de hand op persoonsgegevens en zet het met
//     zijn sha256 in scripts/uitzonderingen.json; verandert het bestand, dan vervalt de uitzondering;
//   - een voorbeeldadres of -nummer: gebruik een voorbeelddomein (example.com) of een duidelijk verzonnen nummer.
// Past een regel niet meer bij het project, wijzig dan de regel in een aparte wijziging met reden (14.1).

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface Probleem {
  regel: string;
  pad: string;
  melding: string;
  regelnummer?: number;
}

export interface Opties {
  verbodenWoorden: readonly string[];
}

interface Uitzondering {
  pad: string;
  sha256: string;
  reden: string;
  gecontroleerd: string;
}

const AFBEELDING = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
  'ico',
  'bmp',
  'tif',
  'tiff',
  'heic',
  'heif',
]);
const LETTERTYPE = new Set(['woff', 'woff2', 'ttf', 'otf', 'eot']);
const MEDIA = new Set(['pdf', 'mp3', 'mp4', 'mov', 'webm', 'wav']);
const GEGEVENS = new Set(['xlsx', 'xlsm', 'xls', 'ods', 'csv']);
const ARCHIEF = new Set(['zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz']);
const VEREIST_LICENTIE = new Set([...AFBEELDING, ...LETTERTYPE, ...MEDIA, ...GEGEVENS]);

// Documenten waarin tekst (en dus persoonsgegevens) kan staan, maar die deze controle niet kan lezen.
const DOCUMENT = new Set([
  'docx',
  'doc',
  'odt',
  'rtf',
  'pptx',
  'ppt',
  'odp',
  'pdf',
  'xlsx',
  'xlsm',
  'xls',
  'ods',
]);

// Binaire media waarvan de inhoud niet als tekst wordt gecontroleerd (de licentie wel).
const MEDIA_ZONDER_TEKST = new Set([
  ...[...AFBEELDING].filter((e) => e !== 'svg'),
  ...LETTERTYPE,
  'mp3',
  'mp4',
  'mov',
  'webm',
  'wav',
]);

const OVERSLAAN_MAPPEN = new Set([
  'node_modules',
  '.git',
  '.next',
  '.open-next',
  '.wrangler',
  'coverage',
  'playwright-report',
  'test-results',
  'testuitkomsten',
]);
// Deze bestanden bevatten de patronen zelf, de namenlijst of lange hashes; scannen geeft alleen ruis.
const NIET_SCANNEN = new Set([
  'scripts/controleer-repo.ts',
  'scripts/controleer-repo.test.ts',
  'package-lock.json',
  '.verboden-woorden',
]);
const MAX_SCAN_BYTES = 2 * 1024 * 1024;
const UITZONDERINGEN_PAD = 'scripts/uitzonderingen.json';

const VERBODEN_PADEN: readonly (readonly [RegExp, string])[] = [
  [
    /^docs\/visueel\/(?!stijl\.css$|INDEX\.md$)/,
    'docs/visueel/ bevat iconen en foto’s met een licentie die openbaar delen niet toestaat; alleen stijl.css en INDEX.md mogen erin',
  ],
  [
    /^docs\/(communicatie|uitrol|versies|design)\//,
    'correspondentie, uitrolpakketten en ontwerpproeven horen in de ontwerpmap, niet in de publieke repository',
  ],
  [/(^|\/)code\.txt$/, 'verouderd designsysteem uit de ontwerpmap'],
  [/(^|\/)prototype[^/]*\.html$/, 'prototype uit de ontwerpmap; bevat iconen en foto’s'],
  [
    /central-icons?/i,
    'de Central-iconen mogen niet openbaar worden gedeeld (licentie Iconists, bouwgids 14.7)',
  ],
  [
    /(^|\/)(Review-bouwgids-chatgpt|Beoordeling-review-chatgpt|Prompt-ChatGPT-review-bouwgids|Opschoning-repo-kopie)[^/]*$/,
    'interne beoordeling met namen; hoort in de ontwerpmap',
  ],
];

const TOEGESTANE_ADRESDOMEINEN = [
  /(^|\.)example\.(com|org|net)$/i,
  /\.(example|test|invalid|localhost)$/i,
  /^users\.noreply\.github\.com$/i,
  /^noreply\.github\.com$/i,
];
const TOEGESTANE_ADRESSEN = new Set(['git@github.com']);

const SLEUTELS: readonly (readonly [RegExp, string])[] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'privésleutel'],
  [/\bre_[A-Za-z0-9_]{20,}/, 'lijkt op een Resend-sleutel'],
  [
    /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    'lijkt op een JWT (bijvoorbeeld een Supabase-sleutel)',
  ],
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, 'lijkt op een geheime Supabase-sleutel'],
  [/\bsbp_[a-f0-9]{30,}/, 'lijkt op een Supabase-toegangstoken'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'lijkt op een GitHub-token'],
];

const PLACEHOLDER = /^(|-|\?|tbd|todo|nog niets|n\.?n\.?b\.?|onbekend|\(.*\))$/i;

const naarPosix = (p: string): string => p.split(path.sep).join('/');
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const masker = (waarde: string): string => `${waarde.slice(0, 3)}… (${waarde.length} tekens)`;
const extensie = (pad: string): string => path.posix.extname(pad).slice(1).toLowerCase();

/** Een duidelijk verzonnen nummer heeft acht cijfers die oplopen (12345678), aflopen of gelijk zijn. */
function isVerzonnen(cijfers: string): boolean {
  const acht = cijfers.slice(-8);
  if (/^(\d)\1{7}$/.test(acht)) return true;
  const stappen = [...acht].slice(1).map((c, i) => (Number(c) - Number(acht[i]) + 10) % 10);
  return stappen.every((s) => s === 1) || stappen.every((s) => s === 9);
}

/**
 * Vindt e-mailadressen in één regel. Zoekt eerst de @-tekens en kijkt dan een eindig stuk naar links en
 * rechts, zodat een regel van een paar megabyte zonder @ (minified code) niet kwadratisch lang duurt.
 */
function vindAdressen(lijn: string): string[] {
  const adressen: string[] = [];
  let i = lijn.indexOf('@');
  while (i !== -1) {
    const links = /[A-Za-z0-9._%+-]{1,64}$/.exec(lijn.slice(Math.max(0, i - 64), i));
    const rechts = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/.exec(lijn.slice(i + 1, i + 1 + 255));
    if (links && rechts) adressen.push(`${links[0]}@${rechts[0]}`);
    i = lijn.indexOf('@', i + 1);
  }
  return adressen;
}

/** Leest tekst als UTF-8 of (met BOM) UTF-16. Geeft null terug voor binaire inhoud. */
export function leesTekst(buffer: Buffer): string | null {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const omgedraaid = Buffer.from(buffer.subarray(2));
    omgedraaid.swap16();
    return omgedraaid.toString('utf16le');
  }
  if (buffer.subarray(0, 8000).includes(0)) return null;
  return buffer.toString('utf8');
}

/** De namenlijst uit VERBODEN_WOORDEN of .verboden-woorden. Lege lijst = niet ingesteld. */
export function laadVerbodenWoorden(
  root: string,
  omgeving: Record<string, string | undefined> = process.env,
): string[] {
  const uitOmgeving = (omgeving.VERBODEN_WOORDEN ?? '')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);
  if (uitOmgeving.length > 0) return uitOmgeving;
  const bestand = path.join(root, '.verboden-woorden');
  if (!existsSync(bestand)) return [];
  return readFileSync(bestand, 'utf8')
    .split(/\r?\n/)
    .map((w) => w.trim())
    .filter((w) => w !== '' && !w.startsWith('#'));
}

/** Bestanden van de repository: wat git bijhoudt of zou bijhouden; zonder git: alles behalve build-mappen. */
export function lijstBestanden(root: string): string[] {
  if (existsSync(path.join(root, '.git'))) {
    const uit = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    return uit
      .split('\0')
      .filter(Boolean)
      .filter((p) => existsSync(path.join(root, p)));
  }
  const gevonden: string[] = [];
  const loop = (map: string): void => {
    for (const item of readdirSync(map, { withFileTypes: true })) {
      if (item.isDirectory()) {
        if (!OVERSLAAN_MAPPEN.has(item.name)) loop(path.join(map, item.name));
      } else if (item.isFile()) {
        gevonden.push(naarPosix(path.relative(root, path.join(map, item.name))));
      }
    }
  };
  loop(root);
  return gevonden;
}

interface Licenties {
  vermeldingen: string[];
  onvolledig: { regelnummer: number; melding: string }[];
  fout: string | null;
}

/** Leest de tabellen in docs/licenties.md. Een vermelding telt alleen als alle velden zijn ingevuld. */
export function leesLicenties(root: string): Licenties {
  const pad = path.join(root, 'docs', 'licenties.md');
  const resultaat: Licenties = { vermeldingen: [], onvolledig: [], fout: null };
  if (!existsSync(pad)) {
    resultaat.fout = 'docs/licenties.md ontbreekt (bouwgids 14.7)';
    return resultaat;
  }
  type Kolommen = Record<'bestand' | 'bron' | 'licentie' | 'houder' | 'toestemming', number>;
  let kolom: Kolommen | null = null;
  readFileSync(pad, 'utf8')
    .split(/\r?\n/)
    .forEach((lijn, i) => {
      if (!lijn.trim().startsWith('|')) {
        kolom = null; // een tabel eindigt bij de eerste regel zonder |
        return;
      }
      const cellen = lijn
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim());
      if (cellen.every((c) => /^:?-{3,}:?$/.test(c))) return;
      if (!kolom) {
        const kop = cellen.map((c) => c.toLowerCase());
        const k: Kolommen = {
          bestand: kop.findIndex((c) => /^(bestand|pad)/.test(c)),
          bron: kop.indexOf('bron'),
          licentie: kop.indexOf('licentie'),
          houder: kop.indexOf('licentiehouder'),
          toestemming: kop.findIndex((c) => c.startsWith('toestemming')),
        };
        if (Object.values(k).every((n) => n >= 0)) kolom = k;
        return;
      }
      const k: Kolommen = kolom;
      const waarde = (n: number): string => (cellen[n] ?? '').replace(/`/g, '').trim();
      const bestand = waarde(k.bestand);
      if (!bestand || /^\(.*\)$/.test(bestand)) return; // lege of voorbeeldrij
      const namen = {
        bron: 'Bron',
        licentie: 'Licentie',
        houder: 'Licentiehouder',
        toestemming: 'Toestemming',
      } as const;
      const ontbreekt = (Object.keys(namen) as (keyof typeof namen)[]).filter((n) =>
        PLACEHOLDER.test(waarde(k[n])),
      );
      if (ontbreekt.length > 0) {
        resultaat.onvolledig.push({
          regelnummer: i + 1,
          melding: `vermelding van "${bestand}" is onvolledig; vul in: ${ontbreekt.map((n) => namen[n]).join(', ')} (schrijf "n.v.t." als het niet van toepassing is)`,
        });
        return;
      }
      resultaat.vermeldingen.push(bestand);
    });
  return resultaat;
}

function vermeldingPast(vermelding: string, bestand: string): boolean {
  if (vermelding === bestand) return true;
  if (vermelding.endsWith('/')) return bestand.startsWith(vermelding);
  if (vermelding.includes('*')) {
    const re = escape(vermelding)
      .replace(/\\\*\\\*/g, '.*')
      .replace(/\\\*/g, '[^/]*');
    return new RegExp(`^${re}$`).test(bestand);
  }
  return false;
}

function leesUitzonderingen(root: string, meld: (p: Probleem) => void): Uitzondering[] {
  const pad = path.join(root, UITZONDERINGEN_PAD);
  if (!existsSync(pad)) return [];
  try {
    const inhoud: unknown = JSON.parse(readFileSync(pad, 'utf8'));
    const lijst = (inhoud as { bestanden?: unknown }).bestanden;
    if (!Array.isArray(lijst)) throw new Error('verwacht { "bestanden": [...] }');
    return lijst.filter((u): u is Uitzondering => {
      const v = u as Partial<Uitzondering>;
      const compleet = [v.pad, v.sha256, v.reden, v.gecontroleerd].every(
        (x) => typeof x === 'string' && x.trim() !== '',
      );
      if (!compleet)
        meld({
          regel: 'configuratie',
          pad: UITZONDERINGEN_PAD,
          melding: 'uitzondering zonder pad, sha256, reden of datum van controle',
        });
      return compleet;
    });
  } catch (fout) {
    meld({
      regel: 'configuratie',
      pad: UITZONDERINGEN_PAD,
      melding: `niet te lezen: ${fout instanceof Error ? fout.message : 'onbekende fout'}`,
    });
    return [];
  }
}

const sha256 = (bestand: string): string => createHash('sha256').update(readFileSync(bestand)).digest('hex');

/** Controleert de repository op root. Geeft een lijst problemen terug; leeg = goed. */
export function controleer(root: string, opties: Opties): Probleem[] {
  const verbodenWoorden = opties.verbodenWoorden.map((w) => w.trim()).filter(Boolean);
  const woordRegex = verbodenWoorden.map(
    (w) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(w)}(?![\\p{L}\\p{N}])`, 'iu'),
  );
  const verberg = (tekst: string): string =>
    verbodenWoorden.reduce(
      (t, w) => t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(w)}(?![\\p{L}\\p{N}])`, 'giu'), '***'),
      tekst,
    );
  const problemen: Probleem[] = [];
  const meld = (p: Probleem): void => {
    problemen.push({ ...p, pad: verberg(p.pad), melding: verberg(p.melding) });
  };

  if (verbodenWoorden.length === 0) {
    meld({
      regel: 'configuratie',
      pad: '.verboden-woorden',
      melding:
        'de namenlijst ontbreekt (VERBODEN_WOORDEN of het bestand .verboden-woorden); zonder lijst is deze controle niet volledig. Zie de README',
    });
  }

  const licenties = leesLicenties(root);
  if (licenties.fout) meld({ regel: 'licentie', pad: 'docs/licenties.md', melding: licenties.fout });
  for (const o of licenties.onvolledig)
    meld({ regel: 'licentie', pad: 'docs/licenties.md', melding: o.melding, regelnummer: o.regelnummer });
  const uitzonderingen = leesUitzonderingen(root, meld);

  for (const pad of lijstBestanden(root)) {
    const naam = path.posix.basename(pad);
    const ext = extensie(pad);
    const volledig = path.join(root, pad);

    if (/^\.env(\..+)?$/.test(naam) && !naam.endsWith('.example')) {
      meld({
        regel: 'geheim-bestand',
        pad,
        melding:
          'een .env-bestand hoort nooit in de repository; zet een .env.example met lege waarden neer en de echte waarden in GitHub Secrets',
      });
    }
    if (/^\.dev\.vars(\..+)?$/.test(naam) && !naam.endsWith('.example')) {
      meld({
        regel: 'geheim-bestand',
        pad,
        melding: '.dev.vars bevat lokale geheimen van Wrangler en hoort niet in de repository',
      });
    }
    if (/\.(pem|p12|pfx)$/i.test(naam) || /^id_(rsa|ed25519)$/.test(naam)) {
      meld({ regel: 'geheim-bestand', pad, melding: 'lijkt op een privésleutel of certificaat' });
    }
    for (const [regex, uitleg] of VERBODEN_PADEN) {
      if (regex.test(pad)) meld({ regel: 'verboden-pad', pad, melding: uitleg });
    }
    if (ARCHIEF.has(ext))
      meld({
        regel: 'archief',
        pad,
        melding:
          'een archief kan alles bevatten en is niet te controleren; pak het uit en voeg alleen toe wat mag',
      });
    if (GEGEVENS.has(ext) && /leden/i.test(naam)) {
      meld({
        regel: 'ledenbestand',
        pad,
        melding:
          'een bestand met "leden" in de naam kan echte ledengegevens bevatten; gebruik verzonnen testgegevens met een andere naam',
      });
    }
    if (VEREIST_LICENTIE.has(ext) && !licenties.vermeldingen.some((v) => vermeldingPast(v, pad))) {
      meld({
        regel: 'licentie',
        pad,
        melding:
          'staat niet (volledig) in docs/licenties.md; zet er bron, licentie, licentiehouder en toestemming bij (bouwgids 14.7)',
      });
    }
    woordRegex.forEach((re, n) => {
      if (re.test(pad))
        meld({ regel: 'verboden-woord', pad, melding: `de bestandsnaam bevat verboden woord nr ${n + 1}` });
    });

    if (NIET_SCANNEN.has(pad) || MEDIA_ZONDER_TEKST.has(ext) || ARCHIEF.has(ext)) continue;

    // Documenten en andere binaire inhoud: alleen met een beoordeelde uitzondering voor precies deze inhoud.
    const uitzondering = uitzonderingen.find((u) => u.pad === pad);
    if (DOCUMENT.has(ext)) {
      if (!uitzondering || uitzondering.sha256 !== sha256(volledig)) {
        meld({
          regel: 'niet-te-controleren',
          pad,
          melding: uitzondering
            ? 'is gewijzigd sinds de controle; controleer opnieuw op persoonsgegevens en werk de sha256 bij in scripts/uitzonderingen.json'
            : 'een document dat deze controle niet kan lezen; controleer het met de hand op persoonsgegevens en zet het met zijn sha256 in scripts/uitzonderingen.json',
        });
      }
      continue;
    }
    if (statSync(volledig).size > MAX_SCAN_BYTES) {
      meld({
        regel: 'niet-gescand',
        pad,
        melding: 'te groot om te scannen (meer dan 2 MB); controleer met de hand of maak het kleiner',
      });
      continue;
    }
    const tekst = leesTekst(readFileSync(volledig));
    if (tekst === null) {
      if (!uitzondering || uitzondering.sha256 !== sha256(volledig)) {
        meld({
          regel: 'niet-te-controleren',
          pad,
          melding:
            'binaire inhoud die deze controle niet kan lezen; alleen toegestaan met een beoordeelde uitzondering in scripts/uitzonderingen.json',
        });
      }
      continue;
    }
    tekst.split(/\r?\n/).forEach((lijn, i) => {
      const regelnummer = i + 1;
      for (const adres of vindAdressen(lijn)) {
        const domein = adres.slice(adres.indexOf('@') + 1);
        const laatste = domein.split('.').pop() ?? '';
        if (!/^[A-Za-z]{2,}$/.test(laatste)) continue; // react@18.3.1 is geen adres
        if (TOEGESTANE_ADRESSEN.has(adres.toLowerCase())) continue;
        if (TOEGESTANE_ADRESDOMEINEN.some((re) => re.test(domein))) continue;
        meld({
          regel: 'adres',
          pad,
          melding: `e-mailadres ${masker(adres)}; gebruik een voorbeelddomein zoals example.com`,
          regelnummer,
        });
      }
      for (const m of lijn.matchAll(/(?<![\d+])(?:\+31|0031|0)[\s-]?6[\s-]?(?:\d[\s-]?){8}(?!\d)/g)) {
        if (isVerzonnen(m[0].replace(/\D/g, ''))) continue;
        meld({
          regel: 'telefoon',
          pad,
          melding: `mobiel nummer ${masker(m[0].trim())}; gebruik een duidelijk verzonnen nummer zoals 06 12 34 56 78`,
          regelnummer,
        });
      }
      for (const [regex, soort] of SLEUTELS) {
        const m = regex.exec(lijn);
        if (m)
          meld({
            regel: 'sleutel',
            pad,
            melding: `${soort} (${masker(m[0])}); haal hem eruit en trek hem in`,
            regelnummer,
          });
      }
      woordRegex.forEach((re, n) => {
        if (re.test(lijn))
          meld({ regel: 'verboden-woord', pad, melding: `bevat verboden woord nr ${n + 1}`, regelnummer });
      });
    });
  }
  return problemen;
}

function uitvoeren(): number {
  const argumenten = process.argv.slice(2);
  const i = argumenten.indexOf('--root');
  const root = path.resolve((i >= 0 ? argumenten[i + 1] : undefined) ?? '.');
  const problemen = controleer(root, { verbodenWoorden: laadVerbodenWoorden(root) });
  if (problemen.length === 0) {
    console.log('controleer-repo: 0 problemen');
    return 0;
  }
  for (const p of problemen) {
    const plek = p.regelnummer ? `${p.pad}:${p.regelnummer}` : p.pad;
    console.error(`FOUT [${p.regel}] ${plek}: ${p.melding}`);
  }
  console.error(`controleer-repo: ${problemen.length} ${problemen.length === 1 ? 'probleem' : 'problemen'}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = uitvoeren();
}
