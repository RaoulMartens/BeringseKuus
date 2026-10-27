// Poortcontrole voor een publieke repository (bouwgids 14.4 en 14.7, Fase-0-plan punt 1.4).
//
// Alles wat hier staat is voor iedereen leesbaar en blijft in de geschiedenis staan. Deze controle faalt
// daarom op bestanden en tekst die er niet in horen:
//
//   licentie        afbeelding, icoon, lettertype, pdf, media of gegevensbestand zonder volledige
//                   vermelding in docs/licenties.md
//   geheim-bestand  .env-bestanden, .dev.vars, privésleutels
//   verboden-pad    bestanden uit de ontwerpmap die niet in de repository horen
//   archief         zip en andere archieven (daar kan alles in zitten)
//   ledenbestand    een spreadsheet of csv met "leden" in de naam
//   adres           een e-mailadres dat niet van een voorbeelddomein is
//   telefoon        een Nederlands mobiel nummer dat niet duidelijk verzonnen is
//   sleutel         een tekst die op een sleutel lijkt
//   verboden-woord  een woord uit de omgevingsvariabele VERBODEN_WOORDEN (bijvoorbeeld persoonsnamen)
//
// Gebruik:   node scripts/controleer-repo.mjs [--root pad]
// Uitkomst:  "0 problemen" en exitcode 0, of een lijst en exitcode 1.
//
// Waarden die het probleem veroorzaken worden niet in de uitvoer gezet: de uitvoer van een CI-run is bij
// een publieke repository ook openbaar. Alleen het bestand, het regelnummer en de soort staan erin.
//
// Een bewuste uitzondering maak je niet door deze controle aan te passen, maar zo:
//   - een bestand met een licentie: zet het in docs/licenties.md (bestand, bron, licentie,
//     licentiehouder, toestemming);
//   - een voorbeeldadres of -nummer: gebruik een voorbeelddomein (example.com) of een duidelijk
//     verzonnen nummer (06 12 34 56 78).
// Past een regel hier niet meer bij het project, wijzig dan de regel in een aparte wijziging met reden
// (bouwgids 14.1).

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const AFBEELDING = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp', 'tif', 'tiff', 'heic', 'heif']);
const LETTERTYPE = new Set(['woff', 'woff2', 'ttf', 'otf', 'eot']);
const MEDIA = new Set(['pdf', 'mp3', 'mp4', 'mov', 'webm', 'wav']);
const GEGEVENS = new Set(['xlsx', 'xlsm', 'xls', 'ods', 'csv']);
const ARCHIEF = new Set(['zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz']);
const VEREIST_LICENTIE = new Set([...AFBEELDING, ...LETTERTYPE, ...MEDIA, ...GEGEVENS]);

// Binaire bestanden die we niet als tekst lezen. Een svg is wel tekst.
const NIET_LEZEN = new Set([...AFBEELDING].filter((e) => e !== 'svg'));
for (const e of [...LETTERTYPE, ...MEDIA, ...ARCHIEF, ...GEGEVENS, 'docx', 'doc', 'pptx', 'odt']) NIET_LEZEN.add(e);
NIET_LEZEN.delete('csv'); // csv is tekst en juist daar staan adressen en nummers in

const OVERSLAAN_MAPPEN = new Set(['node_modules', '.git', '.next', '.open-next', '.wrangler', 'coverage', 'playwright-report', 'test-results']);
// Deze bestanden bevatten de patronen zelf of lange hashes; scannen geeft alleen ruis.
const NIET_SCANNEN = new Set(['scripts/controleer-repo.mjs', 'scripts/controleer-repo.test.mjs', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);
const MAX_SCAN_BYTES = 2 * 1024 * 1024;

const VERBODEN_PADEN = [
  [/^docs\/visueel\/(?!stijl\.css$|INDEX\.md$)/, 'docs/visueel/ bevat iconen en foto’s met een licentie die openbaar delen niet toestaat; alleen stijl.css en INDEX.md mogen erin'],
  [/^docs\/(communicatie|uitrol|versies|design)\//, 'correspondentie, uitrolpakketten en ontwerpproeven horen in de ontwerpmap, niet in de publieke repository'],
  [/(^|\/)code\.txt$/, 'verouderd designsysteem uit de ontwerpmap'],
  [/(^|\/)prototype[^/]*\.html$/, 'prototype uit de ontwerpmap; bevat iconen en foto’s'],
  [/central-icons?/i, 'de Central-iconen mogen niet openbaar worden gedeeld (licentie Iconists, bouwgids 14.7)'],
  [/(^|\/)(Review-bouwgids-chatgpt|Beoordeling-review-chatgpt|Prompt-ChatGPT-review-bouwgids|Opschoning-repo-kopie)[^/]*$/, 'interne beoordeling met namen; hoort in de ontwerpmap'],
];

const TOEGESTANE_ADRESDOMEINEN = [/(^|\.)example\.(com|org|net)$/i, /\.(example|test|invalid|localhost)$/i, /^users\.noreply\.github\.com$/i, /^noreply\.github\.com$/i];
const TOEGESTANE_ADRESSEN = new Set(['git@github.com']);

// Een duidelijk verzonnen nummer heeft acht cijfers die oplopen (12345678, 23456789), aflopen
// (87654321) of steeds hetzelfde zijn (00000000). Een echt nummer doet dat niet.
function isVerzonnen(cijfers) {
  const acht = cijfers.slice(-8);
  if (/^(\d)\1{7}$/.test(acht)) return true;
  const stappen = [...acht].slice(1).map((c, i) => (Number(c) - Number(acht[i]) + 10) % 10);
  return stappen.every((s) => s === 1) || stappen.every((s) => s === 9);
}

const SLEUTELS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'privésleutel'],
  [/\bre_[A-Za-z0-9_]{20,}/, 'lijkt op een Resend-sleutel'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'lijkt op een JWT (bijvoorbeeld een Supabase-sleutel)'],
  [/\bsb_secret_[A-Za-z0-9_-]{10,}/, 'lijkt op een geheime Supabase-sleutel'],
  [/\bsbp_[a-f0-9]{30,}/, 'lijkt op een Supabase-toegangstoken'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'lijkt op een GitHub-token'],
];

const PLACEHOLDER = /^(|-|\?|tbd|todo|nog niets|n\.?n\.?b\.?|onbekend|\(.*\))$/i;

/**
 * Vindt e-mailadressen in één regel. Zoekt eerst de @-tekens en kijkt dan een eindig stuk naar links en
 * rechts, zodat een regel van een paar megabyte zonder @ (minified code) niet kwadratisch lang duurt.
 */
function vindAdressen(lijn) {
  const adressen = [];
  let i = lijn.indexOf('@');
  while (i !== -1) {
    const links = /[A-Za-z0-9._%+-]{1,64}$/.exec(lijn.slice(Math.max(0, i - 64), i));
    const rechts = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/.exec(lijn.slice(i + 1, i + 1 + 255));
    if (links && rechts) adressen.push(`${links[0]}@${rechts[0]}`);
    i = lijn.indexOf('@', i + 1);
  }
  return adressen;
}

const naarPosix = (p) => p.split(path.sep).join('/');
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const masker = (waarde) => `${waarde.slice(0, 3)}… (${waarde.length} tekens)`;

/** Bestanden van de repository: wat git bijhoudt of zou bijhouden; zonder git: alles behalve build-mappen. */
export function lijstBestanden(root) {
  if (existsSync(path.join(root, '.git'))) {
    const uit = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    return uit.split('\0').filter(Boolean).filter((p) => existsSync(path.join(root, p)));
  }
  const gevonden = [];
  const loop = (map) => {
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

/** Leest de tabellen in docs/licenties.md. Een vermelding telt alleen als alle velden zijn ingevuld. */
export function leesLicenties(root) {
  const pad = path.join(root, 'docs', 'licenties.md');
  const resultaat = { vermeldingen: [], onvolledig: [], fout: null };
  if (!existsSync(pad)) {
    resultaat.fout = 'docs/licenties.md ontbreekt (bouwgids 14.7)';
    return resultaat;
  }
  const lijnen = readFileSync(pad, 'utf8').split(/\r?\n/);
  let kolom = null;
  lijnen.forEach((lijn, i) => {
    const regelnummer = i + 1;
    if (!lijn.trim().startsWith('|')) {
      kolom = null; // een tabel eindigt bij de eerste regel zonder |
      return;
    }
    const cellen = lijn.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (cellen.every((c) => /^:?-{3,}:?$/.test(c))) return;
    if (!kolom) {
      const kop = cellen.map((c) => c.toLowerCase());
      const zoek = (test) => kop.findIndex(test);
      const k = {
        bestand: zoek((c) => /^(bestand|pad)/.test(c)),
        bron: zoek((c) => c === 'bron'),
        licentie: zoek((c) => c === 'licentie'),
        houder: zoek((c) => c === 'licentiehouder'),
        toestemming: zoek((c) => c.startsWith('toestemming')),
      };
      if (Object.values(k).every((n) => n >= 0)) kolom = k;
      return;
    }
    const waarde = (n) => (cellen[n] ?? '').replace(/`/g, '').trim();
    const bestand = waarde(kolom.bestand);
    if (!bestand || /^\(.*\)$/.test(bestand)) return; // lege of voorbeeldrij
    const ontbreekt = ['bron', 'licentie', 'houder', 'toestemming'].filter((n) => PLACEHOLDER.test(waarde(kolom[n])));
    const namen = { bron: 'Bron', licentie: 'Licentie', houder: 'Licentiehouder', toestemming: 'Toestemming' };
    if (ontbreekt.length > 0) {
      resultaat.onvolledig.push({ regelnummer, melding: `vermelding van "${bestand}" is onvolledig; vul in: ${ontbreekt.map((n) => namen[n]).join(', ')} (schrijf "n.v.t." als het niet van toepassing is)` });
      return;
    }
    resultaat.vermeldingen.push(bestand);
  });
  return resultaat;
}

function vermeldingPast(vermelding, bestand) {
  if (vermelding === bestand) return true;
  if (vermelding.endsWith('/')) return bestand.startsWith(vermelding);
  if (vermelding.includes('*')) {
    const re = escape(vermelding).replace(/\\\*\\\*/g, '.*').replace(/\\\*/g, '[^/]*');
    return new RegExp(`^${re}$`).test(bestand);
  }
  return false;
}

/** Controleert de repository op root. Geeft een lijst problemen terug; leeg = goed. */
export function controleer(root, opties = {}) {
  const verbodenWoorden = (opties.verbodenWoorden ?? []).map((w) => w.trim()).filter(Boolean);
  const woordRegex = verbodenWoorden.map((w) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(w)}(?![\\p{L}\\p{N}])`, 'iu'));
  const problemen = [];
  const meld = (regel, pad, melding, regelnummer) => problemen.push({ regel, pad, melding, regelnummer });

  const licenties = leesLicenties(root);
  if (licenties.fout) meld('licentie', 'docs/licenties.md', licenties.fout);
  for (const o of licenties.onvolledig) meld('licentie', 'docs/licenties.md', o.melding, o.regelnummer);

  for (const pad of lijstBestanden(root)) {
    const naam = path.posix.basename(pad);
    const ext = path.posix.extname(naam).slice(1).toLowerCase();

    if (/^\.env(\..+)?$/.test(naam) && !naam.endsWith('.example')) {
      meld('geheim-bestand', pad, 'een .env-bestand hoort nooit in de repository; zet een .env.example met lege waarden neer en de echte waarden in GitHub Secrets');
    }
    if (/^\.dev\.vars(\..+)?$/.test(naam) && !naam.endsWith('.example')) {
      meld('geheim-bestand', pad, '.dev.vars bevat lokale geheimen van Wrangler en hoort niet in de repository');
    }
    if (/\.(pem|p12|pfx)$/i.test(naam) || /^id_(rsa|ed25519)$/.test(naam)) {
      meld('geheim-bestand', pad, 'lijkt op een privésleutel of certificaat');
    }

    for (const [regex, uitleg] of VERBODEN_PADEN) {
      if (regex.test(pad)) meld('verboden-pad', pad, uitleg);
    }
    if (ARCHIEF.has(ext)) meld('archief', pad, 'een archief kan alles bevatten en is niet te controleren; pak het uit en voeg alleen toe wat mag');
    if (GEGEVENS.has(ext) && /leden/i.test(naam)) {
      meld('ledenbestand', pad, 'een bestand met "leden" in de naam kan echte ledengegevens bevatten; gebruik verzonnen testgegevens met een andere naam');
    }

    if (VEREIST_LICENTIE.has(ext) && !licenties.vermeldingen.some((v) => vermeldingPast(v, pad))) {
      meld('licentie', pad, 'staat niet (volledig) in docs/licenties.md; zet er bron, licentie, licentiehouder en toestemming bij (bouwgids 14.7)');
    }

    woordRegex.forEach((re, n) => {
      if (re.test(pad)) meld('verboden-woord', pad, `de bestandsnaam bevat verboden woord nr ${n + 1} uit VERBODEN_WOORDEN`);
    });

    // De inhoud scannen
    if (NIET_LEZEN.has(ext) || NIET_SCANNEN.has(pad)) continue;
    const volledig = path.join(root, pad);
    if (statSync(volledig).size > MAX_SCAN_BYTES) {
      meld('niet-gescand', pad, 'te groot om te scannen (meer dan 2 MB); controleer met de hand of maak het kleiner');
      continue;
    }
    const buffer = readFileSync(volledig);
    if (buffer.subarray(0, 8000).includes(0)) continue; // binair
    buffer.toString('utf8').split(/\r?\n/).forEach((lijn, i) => {
      const nr = i + 1;
      for (const adres of vindAdressen(lijn)) {
        const domein = adres.slice(adres.indexOf('@') + 1);
        const laatste = domein.split('.').pop() ?? '';
        if (!/^[A-Za-z]{2,}$/.test(laatste)) continue; // react@18.3.1 is geen adres
        if (TOEGESTANE_ADRESSEN.has(adres.toLowerCase())) continue;
        if (TOEGESTANE_ADRESDOMEINEN.some((re) => re.test(domein))) continue;
        meld('adres', pad, `e-mailadres ${masker(adres)}; gebruik een voorbeelddomein zoals example.com`, nr);
      }
      for (const m of lijn.matchAll(/(?<![\d+])(?:\+31|0031|0)[\s-]?6[\s-]?(?:\d[\s-]?){8}(?!\d)/g)) {
        if (isVerzonnen(m[0].replace(/\D/g, ''))) continue;
        meld('telefoon', pad, `mobiel nummer ${masker(m[0].trim())}; gebruik een duidelijk verzonnen nummer zoals 06 12 34 56 78`, nr);
      }
      for (const [regex, soort] of SLEUTELS) {
        const m = regex.exec(lijn);
        if (m) meld('sleutel', pad, `${soort} (${masker(m[0])}); haal hem eruit en trek hem in`, nr);
      }
      woordRegex.forEach((re, n) => {
        if (re.test(lijn)) meld('verboden-woord', pad, `bevat verboden woord nr ${n + 1} uit VERBODEN_WOORDEN`, nr);
      });
    });
  }
  return problemen;
}

function uitvoeren() {
  const argumenten = process.argv.slice(2);
  const i = argumenten.indexOf('--root');
  const root = path.resolve(i >= 0 && argumenten[i + 1] ? argumenten[i + 1] : '.');
  const woorden = (process.env.VERBODEN_WOORDEN ?? '').split(',');
  const problemen = controleer(root, { verbodenWoorden: woorden });
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
