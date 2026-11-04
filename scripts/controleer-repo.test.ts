// Tests voor scripts/controleer-repo.ts. Draaien met: npm run test
// Elke regel van de controle heeft een test die faalt als de regel niet werkt (bouwgids 14.5).

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  commitsVanPush,
  controleer,
  controleerGeschiedenis,
  controleerPush,
  laadVerbodenWoorden,
  leesPushRegels,
  leesTekst,
  type Opties,
} from './controleer-repo.ts';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'controleer-repo.ts');
const opgeruimd: string[] = [];

// Verzonnen woorden: geen echte personen.
const STANDAARD: Opties = { verbodenWoorden: ['Fictiefnaam'] };

const TABEL_KOP =
  '| Bestand | Soort | Bron | Licentie | Licentiehouder | Toestemming |\n|---|---|---|---|---|---|\n';
const licenties = (...rijen: string[]): string => `# Licenties\n\n${TABEL_KOP}${rijen.join('\n')}\n`;
const rij = (
  bestand: string,
  bron = 'Google Fonts',
  licentie = 'SIL OFL 1.1',
  houder = 'Nunito-ontwerpers',
  toestemming = 'n.v.t.',
): string => `| \`${bestand}\` | lettertype | ${bron} | ${licentie} | ${houder} | ${toestemming} |`;

/** Maakt een tijdelijke repository met de gegeven bestanden. docs/licenties.md staat er standaard in. */
function maakRepo(bestanden: Record<string, string | Buffer> = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), 'controleer-repo-'));
  opgeruimd.push(root);
  const alles: Record<string, string | Buffer> = { 'docs/licenties.md': licenties(), ...bestanden };
  for (const [pad, inhoud] of Object.entries(alles)) {
    const volledig = path.join(root, pad);
    mkdirSync(path.dirname(volledig), { recursive: true });
    writeFileSync(volledig, inhoud);
  }
  return root;
}

const regels = (root: string, opties: Opties = STANDAARD): string[] =>
  controleer(root, opties).map((p) => p.regel);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]);
const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x01]);
const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');
const uitzondering = (pad: string, inhoud: Buffer, extra: Record<string, string> = {}): string =>
  JSON.stringify({
    bestanden: [
      { pad, sha256: sha(inhoud), reden: 'met de hand gecontroleerd', gecontroleerd: '2026-10-27', ...extra },
    ],
  });

function draai(root: string, env: Record<string, string> = {}): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [SCRIPT, '--root', root], {
    encoding: 'utf8',
    env: { ...process.env, VERBODEN_WOORDEN: undefined, NODE_TEST_CONTEXT: undefined, ...env },
  });
}

after(() => {
  for (const root of opgeruimd) rmSync(root, { recursive: true, force: true });
});

describe('lege repository', () => {
  it('geeft 0 problemen', () => {
    assert.deepEqual(controleer(maakRepo(), STANDAARD), []);
  });

  it('faalt als docs/licenties.md ontbreekt', () => {
    const root = maakRepo();
    rmSync(path.join(root, 'docs/licenties.md'));
    assert.deepEqual(regels(root), ['licentie']);
  });

  it('negeert node_modules en build-mappen', () => {
    const root = maakRepo({
      'node_modules/x/a.png': PNG,
      '.next/b.woff2': PNG,
      '.open-next/c.png': PNG,
      'testuitkomsten/d.bin': PNG,
    });
    assert.deepEqual(controleer(root, STANDAARD), []);
  });
});

describe('configuratie: de namenlijst', () => {
  it('faalt zonder namenlijst in plaats van stilzwijgend groen', () => {
    assert.deepEqual(regels(maakRepo(), { verbodenWoorden: [] }), ['configuratie']);
    assert.deepEqual(regels(maakRepo(), { verbodenWoorden: ['', ' '] }), ['configuratie']);
  });

  it('leest de lijst uit VERBODEN_WOORDEN', () => {
    assert.deepEqual(laadVerbodenWoorden(maakRepo(), { VERBODEN_WOORDEN: 'Een, Twee ,' }), ['Een', 'Twee']);
  });

  it('leest de lijst uit .verboden-woorden, zonder lege regels en commentaar', () => {
    const root = maakRepo({ '.verboden-woorden': '# namen\nEen\n\n  Twee  \n' });
    assert.deepEqual(laadVerbodenWoorden(root, {}), ['Een', 'Twee']);
  });

  it('geeft een lege lijst als niets is ingesteld', () => {
    assert.deepEqual(laadVerbodenWoorden(maakRepo(), {}), []);
  });

  it('faalt op de opdrachtregel zonder lijst', () => {
    const r = draai(maakRepo());
    assert.equal(r.status, 1);
    assert.match(String(r.stderr), /FOUT \[configuratie\]/);
  });
});

describe('licentie: afbeeldingen, iconen, lettertypen', () => {
  it('faalt op een afbeelding zonder vermelding', () => {
    assert.deepEqual(regels(maakRepo({ 'public/logo.png': PNG })), ['licentie']);
  });

  it('faalt op een svg-icoon, een lettertype en een csv zonder vermelding', () => {
    const root = maakRepo({ 'src/icoon.svg': '<svg/>', 'public/f.woff2': PNG, 'seed/data.csv': 'a,b\n' });
    assert.equal(regels(root).filter((r) => r === 'licentie').length, 3);
  });

  it('slaagt met een volledige vermelding', () => {
    const root = maakRepo({
      'public/fonts/Nunito.woff2': PNG,
      'docs/licenties.md': licenties(rij('public/fonts/Nunito.woff2')),
    });
    assert.deepEqual(controleer(root, STANDAARD), []);
  });

  it('faalt als een veld in de vermelding een placeholder is', () => {
    const root = maakRepo({
      'public/a.woff2': PNG,
      'docs/licenties.md': licenties(rij('public/a.woff2', 'Google Fonts', 'SIL OFL 1.1', 'tbd')),
    });
    const res = controleer(root, STANDAARD);
    assert.deepEqual(
      res.map((p) => p.regel),
      ['licentie', 'licentie'],
    );
    assert.ok(res.some((p) => p.pad === 'docs/licenties.md' && /Licentiehouder/.test(p.melding)));
  });

  it('faalt als een veld leeg is', () => {
    const root = maakRepo({
      'public/a.woff2': PNG,
      'docs/licenties.md': licenties(rij('public/a.woff2', '')),
    });
    assert.ok(regels(root).includes('licentie'));
  });

  it('accepteert een map als vermelding', () => {
    const root = maakRepo({
      'public/fonts/a.woff2': PNG,
      'public/fonts/b.woff2': PNG,
      'docs/licenties.md': licenties(rij('public/fonts/')),
    });
    assert.deepEqual(controleer(root, STANDAARD), []);
  });

  it('accepteert een patroon als vermelding, maar alleen binnen het patroon', () => {
    const root = maakRepo({
      'public/fonts/a.woff2': PNG,
      'public/b.woff2': PNG,
      'docs/licenties.md': licenties(rij('public/fonts/*.woff2')),
    });
    assert.deepEqual(
      controleer(root, STANDAARD).map((p) => p.pad),
      ['public/b.woff2'],
    );
  });

  it('kijkt niet naar hoofdletters in de extensie: .PNG telt als afbeelding', () => {
    assert.deepEqual(regels(maakRepo({ 'public/FOTO.PNG': PNG })), ['licentie']);
  });

  it('een voorbeeldrij in de tabel telt niet als vermelding', () => {
    assert.deepEqual(
      regels(maakRepo({ 'public/a.png': PNG, 'docs/licenties.md': licenties('| (nog niets) | | | | | |') })),
      ['licentie'],
    );
  });
});

describe('niet-te-controleren: documenten en binaire inhoud', () => {
  it('faalt op een docx zonder beoordeelde uitzondering', () => {
    assert.deepEqual(regels(maakRepo({ 'docs/notities.docx': DOCX })), ['niet-te-controleren']);
  });

  it('accepteert een docx met een uitzondering voor precies deze inhoud', () => {
    const root = maakRepo({
      'docs/notities.docx': DOCX,
      'scripts/uitzonderingen.json': uitzondering('docs/notities.docx', DOCX),
    });
    assert.deepEqual(controleer(root, STANDAARD), []);
  });

  it('faalt zodra de docx na de controle is gewijzigd', () => {
    const anders = Buffer.concat([DOCX, Buffer.from([1])]);
    const root = maakRepo({
      'docs/notities.docx': anders,
      'scripts/uitzonderingen.json': uitzondering('docs/notities.docx', DOCX),
    });
    const res = controleer(root, STANDAARD);
    assert.deepEqual(
      res.map((p) => p.regel),
      ['niet-te-controleren'],
    );
    assert.match(res[0]?.melding ?? '', /gewijzigd/);
  });

  it('faalt op een pdf zonder uitzondering, ook als de licentie klopt', () => {
    const root = maakRepo({ 'docs/p.pdf': PNG, 'docs/licenties.md': licenties(rij('docs/p.pdf')) });
    assert.deepEqual(regels(root), ['niet-te-controleren']);
  });

  it('faalt op onbekende binaire inhoud', () => {
    assert.deepEqual(regels(maakRepo({ 'data/x.bin': Buffer.from([1, 0, 2, 0]) })), ['niet-te-controleren']);
  });

  it('faalt op een onvolledige uitzondering', () => {
    const root = maakRepo({
      'scripts/uitzonderingen.json': JSON.stringify({ bestanden: [{ pad: 'a.docx', sha256: 'x' }] }),
    });
    assert.deepEqual(regels(root), ['configuratie']);
  });

  it('leest UTF-16 met BOM als tekst en vindt daarin een verboden woord', () => {
    const utf16 = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('notitie over Fictiefnaam\n', 'utf16le'),
    ]);
    assert.equal(leesTekst(utf16)?.includes('Fictiefnaam'), true);
    assert.deepEqual(regels(maakRepo({ 'docs/neutraal.txt': utf16 })), ['verboden-woord']);
  });

  it('leest ook UTF-16 big-endian', () => {
    const le = Buffer.from('Fictiefnaam', 'utf16le');
    const be = Buffer.from(le);
    be.swap16();
    assert.equal(leesTekst(Buffer.concat([Buffer.from([0xfe, 0xff]), be])), 'Fictiefnaam');
  });
});

describe('geheim-bestand', () => {
  it('faalt op .env, .env.local en .env.production', () => {
    assert.deepEqual(regels(maakRepo({ '.env': 'A=1', '.env.local': 'A=1', '.env.production': 'A=1' })), [
      'geheim-bestand',
      'geheim-bestand',
      'geheim-bestand',
    ]);
  });

  it('laat .env.example toe', () => {
    assert.deepEqual(controleer(maakRepo({ '.env.example': 'SUPABASE_URL=' }), STANDAARD), []);
  });

  it('faalt op .dev.vars en laat .dev.vars.example toe', () => {
    assert.deepEqual(regels(maakRepo({ '.dev.vars': 'A=1' })), ['geheim-bestand']);
    assert.deepEqual(controleer(maakRepo({ '.dev.vars.example': 'A=' }), STANDAARD), []);
  });

  it('faalt op een privésleutelbestand', () => {
    assert.deepEqual(regels(maakRepo({ 'sleutel.pem': 'x', 'keys/id_rsa': 'x' })), [
      'geheim-bestand',
      'geheim-bestand',
    ]);
  });
});

describe('verboden-pad en archief', () => {
  it('faalt op docs/visueel/ behalve stijl.css en INDEX.md', () => {
    const root = maakRepo({
      'docs/visueel/stijl.css': 'a{}',
      'docs/visueel/INDEX.md': '# index',
      'docs/visueel/welkom.html': '<p/>',
      'docs/visueel/iconen/a.svg': '<svg/>',
    });
    const verboden = controleer(root, STANDAARD)
      .filter((p) => p.regel === 'verboden-pad')
      .map((p) => p.pad)
      .sort();
    assert.deepEqual(verboden, ['docs/visueel/iconen/a.svg', 'docs/visueel/welkom.html']);
  });

  it('faalt op de mappen met correspondentie en ontwerpproeven', () => {
    const root = maakRepo({
      'docs/communicatie/mail.md': 'x',
      'docs/uitrol/a.txt': 'x',
      'docs/versies/b.txt': 'x',
      'docs/design/c.txt': 'x',
    });
    assert.equal(regels(root).filter((r) => r === 'verboden-pad').length, 4);
  });

  it('faalt op code.txt, een prototype en de Central-iconen', () => {
    const root = maakRepo({
      'code.txt': 'x',
      'docs/prototype-2026.html': 'x',
      'iconen/central-icons-export.svg': '<svg/>',
    });
    assert.equal(regels(root).filter((r) => r === 'verboden-pad').length, 3);
  });

  it('faalt op de interne review en beoordeling', () => {
    assert.deepEqual(regels(maakRepo({ 'docs/bouw/Review-bouwgids-chatgpt.md': 'x' })), ['verboden-pad']);
  });

  it('faalt op een zip en andere archieven', () => {
    assert.deepEqual(regels(maakRepo({ 'a.zip': PNG, 'b.tar': PNG, 'c.7z': PNG })), [
      'archief',
      'archief',
      'archief',
    ]);
  });
});

describe('ledenbestand', () => {
  it('faalt op een spreadsheet met leden in de naam, ook met vermelding en uitzondering', () => {
    const root = maakRepo({
      'data/leden.xlsx': PNG,
      'docs/licenties.md': licenties(rij('data/leden.xlsx')),
      'scripts/uitzonderingen.json': uitzondering('data/leden.xlsx', PNG),
    });
    assert.deepEqual(regels(root), ['ledenbestand']);
  });

  it('faalt op een csv met leden in de naam', () => {
    assert.ok(regels(maakRepo({ 'ledenlijst.csv': 'naam\n' })).includes('ledenbestand'));
  });
});

describe('adres', () => {
  it('faalt op een echt e-mailadres, met regelnummer', () => {
    const res = controleer(maakRepo({ 'docs/a.md': 'Mail naar iemand@vereniging.nl graag' }), STANDAARD);
    assert.deepEqual(
      res.map((p) => p.regel),
      ['adres'],
    );
    assert.equal(res[0]?.regelnummer, 1);
  });

  it('laat voorbeelddomeinen, git@github.com en pakketnamen met versie toe', () => {
    const root = maakRepo({
      'docs/a.md':
        'mark@example.com, x@test.example, git@github.com:org/repo.git, react@18.3.1, eslint@9.0.0-rc.1, 12345+a@users.noreply.github.com',
    });
    assert.deepEqual(controleer(root, STANDAARD), []);
  });

  it('laat het adres uit de Co-Authored-By-regel van Claude Code toe, maar geen ander noreply-adres', () => {
    const goed = maakRepo({ 'docs/a.md': 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>' });
    assert.deepEqual(controleer(goed, STANDAARD), []);
    const fout = maakRepo({ 'docs/a.md': 'Co-Authored-By: Iemand <noreply@bedrijf.nl>' });
    assert.equal(controleer(fout, STANDAARD).length, 1);
  });

  it('zet het adres zelf niet in de melding', () => {
    assert.ok(
      !JSON.stringify(controleer(maakRepo({ 'docs/a.md': 'iemand@vereniging.nl' }), STANDAARD)).includes(
        'vereniging.nl',
      ),
    );
  });

  it('blijft snel op een regel van bijna 2 MB zonder @ (minified code)', { timeout: 20000 }, () => {
    assert.deepEqual(controleer(maakRepo({ 'public/app.js': 'a'.repeat(1.9 * 1024 * 1024) }), STANDAARD), []);
  });

  it('vindt een adres midden in een lange regel', () => {
    assert.deepEqual(
      regels(maakRepo({ 'public/app.js': `${'x '.repeat(50000)}iemand@vereniging.nl${' y'.repeat(50000)}` })),
      ['adres'],
    );
  });

  it('scant ook een csv', () => {
    assert.ok(regels(maakRepo({ 'seed/gegevens.csv': 'naam,mail\nAn,an@thuis.nl\n' })).includes('adres'));
  });
});

describe('telefoon', () => {
  it('faalt op een echt mobiel nummer in verschillende notaties', () => {
    for (const nummer of ['06 55 12 90 34', '0655129034', '06-55129034', '+31 6 55129034', '+31655129034']) {
      assert.deepEqual(regels(maakRepo({ 'docs/a.md': `Bel ${nummer}.` })), ['telefoon'], nummer);
    }
  });

  it('laat een duidelijk verzonnen nummer toe', () => {
    for (const nummer of [
      '06 12 34 56 78',
      '0612345678',
      '06 23 45 67 89',
      '06 34 56 78 90',
      '06 87 65 43 21',
      '06 00 00 00 00',
    ]) {
      assert.deepEqual(controleer(maakRepo({ 'docs/a.md': `Bel ${nummer}.` }), STANDAARD), [], nummer);
    }
  });

  it('faalt op een nummer dat bijna op een reeks lijkt', () => {
    assert.deepEqual(regels(maakRepo({ 'docs/a.md': '06 12 34 56 79' })), ['telefoon']);
  });

  it('negeert een lang getal dat toevallig met 06 begint', () => {
    assert.deepEqual(controleer(maakRepo({ 'docs/a.md': 'id 0655129034567' }), STANDAARD), []);
  });

  it('zet het nummer zelf niet in de melding', () => {
    assert.ok(
      !JSON.stringify(controleer(maakRepo({ 'docs/a.md': '06 55 12 90 34' }), STANDAARD)).includes('12 90'),
    );
  });
});

describe('sleutel', () => {
  it('faalt op een JWT, een Resend-sleutel, een privésleutel en een GitHub-token', () => {
    const root = maakRepo({
      'a.ts': 'const k = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghij1234567";',
      'b.ts': 'const k = "re_123456789012345678901234";',
      'c.txt': '-----BEGIN PRIVATE KEY-----\nxxx',
      'd.ts': 'const t = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";',
    });
    assert.deepEqual(regels(root), ['sleutel', 'sleutel', 'sleutel', 'sleutel']);
  });

  it('zet de sleutel zelf niet in de melding', () => {
    assert.ok(
      !JSON.stringify(
        controleer(maakRepo({ 'b.ts': 'const k = "re_123456789012345678901234";' }), STANDAARD),
      ).includes('123456789012345678901234'),
    );
  });

  it('laat gewone tekst en een korte "re_" toe', () => {
    assert.deepEqual(controleer(maakRepo({ 'a.ts': 'const re_x = 1; // regex' }), STANDAARD), []);
  });
});

describe('verboden-woord', () => {
  const woorden: Opties = { verbodenWoorden: ['Janssen'] };

  it('faalt op een woord uit de lijst, hoofdletterongevoelig, per regel', () => {
    const res = controleer(maakRepo({ 'docs/a.md': 'eerste regel\nPiet JANSSEN was er' }), woorden);
    assert.deepEqual(
      res.map((p) => [p.regel, p.regelnummer]),
      [['verboden-woord', 2]],
    );
  });

  it('matcht hele woorden: Janssens is geen Janssen', () => {
    assert.deepEqual(controleer(maakRepo({ 'docs/a.md': 'de Janssens' }), woorden), []);
  });

  it('controleert ook de bestandsnaam en verbergt de naam in het pad', () => {
    const res = controleer(maakRepo({ 'docs/notitie-janssen.md': 'x' }), woorden);
    assert.deepEqual(
      res.map((p) => p.regel),
      ['verboden-woord'],
    );
    assert.equal(res[0]?.pad, 'docs/notitie-***.md');
  });

  it('verbergt de naam in een licentievermelding', () => {
    const root = maakRepo({
      'docs/licenties.md': licenties(rij('public/janssen.png', 'tbd')),
      'public/janssen.png': PNG,
    });
    assert.ok(!JSON.stringify(controleer(root, woorden)).toLowerCase().includes('janssen'));
  });

  it('drukt de naam nergens af: volledige stdout en stderr van de opdrachtregel', () => {
    const root = maakRepo({
      'docs/Janssen-overleg.md': 'Piet Janssen',
      'docs/licenties.md': licenties(rij('docs/janssen.woff2', '')),
    });
    const r = draai(root, { VERBODEN_WOORDEN: 'Janssen' });
    assert.equal(r.status, 1);
    const uitvoer = `${String(r.stdout)}${String(r.stderr)}`;
    assert.match(uitvoer, /verboden-woord/);
    assert.ok(!uitvoer.toLowerCase().includes('janssen'), uitvoer);
  });

  it('leest VERBODEN_WOORDEN uit de omgeving', () => {
    const r = draai(maakRepo({ 'docs/a.md': 'Piet Janssen' }), { VERBODEN_WOORDEN: 'Janssen, Pietersen' });
    assert.equal(r.status, 1);
    assert.match(String(r.stderr), /verboden-woord/);
  });
});

describe('te groot', () => {
  it('meldt een tekstbestand boven 2 MB in plaats van het stilzwijgend over te slaan', () => {
    assert.deepEqual(regels(maakRepo({ 'seed/groot.json': 'a'.repeat(2 * 1024 * 1024 + 1) })), [
      'niet-gescand',
    ]);
  });
});

describe('met git', () => {
  const gitRepo = (): string => {
    const root = maakRepo({
      '.gitignore': '.env*\n!.env.example\n.verboden-woorden\n',
      '.env.local': 'A=1',
      '.verboden-woorden': 'Fictiefnaam\n',
    });
    execFileSync('git', ['init', '-q'], { cwd: root });
    return root;
  };

  it('negeert een .env.local en de namenlijst die git negeert', () => {
    assert.deepEqual(controleer(gitRepo(), STANDAARD), []);
  });

  it('faalt zodra een .env-bestand toch wordt bijgehouden', () => {
    const root = gitRepo();
    execFileSync('git', ['add', '-f', '.env.local'], { cwd: root });
    assert.deepEqual(regels(root), ['geheim-bestand']);
  });

  it('ziet een nieuw, nog niet toegevoegd bestand', () => {
    const root = gitRepo();
    writeFileSync(path.join(root, 'logo.png'), PNG);
    assert.deepEqual(regels(root), ['licentie']);
  });

  it('faalt zodra de namenlijst zelf wordt bijgehouden, ook al staat hij in .gitignore (CR-03)', () => {
    const root = gitRepo();
    assert.deepEqual(regels(root), []);
    execFileSync('git', ['add', '-f', '.verboden-woorden'], { cwd: root });
    assert.deepEqual(regels(root), ['namenlijst-in-git']);
    const r = controleer(root, STANDAARD)[0];
    assert.ok(r && !r.melding.includes('Fictiefnaam'), 'de melding noemt geen woord uit de lijst');
  });

  it('faalt in een uitgepakte commit als de namenlijst erin staat (CR-03)', () => {
    const root = maakRepo({ '.verboden-woorden': 'Fictiefnaam\n' });
    assert.deepEqual(regels(root), []);
    assert.deepEqual(
      controleer(root, { ...STANDAARD, snapshot: true }).map((p) => p.regel),
      ['namenlijst-in-git'],
    );
  });
});

describe('de geschiedenis van een push (CR-02)', () => {
  const git = (root: string, ...argumenten: string[]): string =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Proef',
        '-c',
        'user.email=proef@example.com',
        '-c',
        'commit.gpgsign=false',
        ...argumenten,
      ],
      { cwd: root, encoding: 'utf8' },
    ).trim();
  const NUL = '0'.repeat(40);

  /** Een repository waar een verboden woord in de ene commit komt en in de volgende weer weg is. */
  const repoMetTussencommit = (): { root: string; eerste: string; tweede: string; derde: string } => {
    const root = maakRepo({ 'README.md': 'begin\n' });
    git(root, 'init', '-q');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'begin');
    const eerste = git(root, 'rev-parse', 'HEAD');
    writeFileSync(path.join(root, 'notitie.md'), 'Fictiefnaam is lid\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'te veel');
    const tweede = git(root, 'rev-parse', 'HEAD');
    git(root, 'rm', '-q', 'notitie.md');
    git(root, 'commit', '-q', '-m', 'weer weg');
    return { root, eerste, tweede, derde: git(root, 'rev-parse', 'HEAD') };
  };

  it('leest de regels die git de hook geeft, en slaat het wegduwen van een ref over', () => {
    const sha = 'a'.repeat(40);
    assert.deepEqual(leesPushRegels(`refs/heads/x ${sha} refs/heads/x ${NUL}\n`), [
      { lokaleSha: sha, remoteSha: NUL },
    ]);
    assert.deepEqual(leesPushRegels(`(delete) ${NUL} refs/heads/x ${sha}\n`), []);
    assert.deepEqual(leesPushRegels(''), []);
    assert.deepEqual(leesPushRegels('onzin'), []);
  });

  it('ziet een commit waarin iets stond dat in de volgende weer weg is: de werkmap is schoon, de push niet', () => {
    const { root, tweede, derde } = repoMetTussencommit();
    // De bestaande controle ziet alleen de werkmap en vindt niets.
    assert.deepEqual(controleer(root, STANDAARD), []);
    // Een nieuwe branch: alle commits die op geen remote staan.
    const commits = commitsVanPush(root, [{ lokaleSha: derde, remoteSha: NUL }]);
    assert.equal(commits.length, 3);
    const problemen = controleerGeschiedenis(root, commits, STANDAARD);
    assert.deepEqual(
      problemen.map((p) => p.regel),
      ['verboden-woord'],
    );
    assert.match(problemen[0]?.pad ?? '', new RegExp(`notitie\\.md \\(commit ${tweede.slice(0, 7)}\\)`));
    assert.ok(!(problemen[0]?.melding ?? '').includes('Fictiefnaam'));
  });

  it('kijkt bij een bestaande branch alleen naar wat de push toevoegt', () => {
    const { root, eerste, tweede, derde } = repoMetTussencommit();
    // De remote heeft al de tweede commit: alleen de derde is nieuw, en die is schoon.
    const nieuw = commitsVanPush(root, [{ lokaleSha: derde, remoteSha: tweede }]);
    assert.deepEqual(nieuw, [derde]);
    assert.deepEqual(controleerGeschiedenis(root, nieuw, STANDAARD), []);
    // De remote heeft alleen de eerste: de tweede (met het woord) en de derde zijn nieuw.
    assert.equal(commitsVanPush(root, [{ lokaleSha: derde, remoteSha: eerste }]).length, 2);
  });

  it('draait als hook: stdin van git, exitcode 1 met de commit erbij, en 0 zonder probleem', () => {
    const { root, derde, tweede } = repoMetTussencommit();
    const draaiPush = (invoer: string) =>
      spawnSync('node', [SCRIPT, '--push', '--root', root], {
        input: invoer,
        encoding: 'utf8',
        env: { ...process.env, VERBODEN_WOORDEN: 'Fictiefnaam' },
      });
    const fout = draaiPush(`refs/heads/proef ${derde} refs/heads/proef ${NUL}\n`);
    assert.equal(fout.status, 1);
    assert.match(String(fout.stderr), /FOUT \[verboden-woord\] notitie\.md \(commit [0-9a-f]{7}\):1/);
    assert.ok(String(fout.stderr).includes(`(commit ${tweede.slice(0, 7)})`));
    assert.ok(!String(fout.stderr).includes('Fictiefnaam'));
    const goed = draaiPush(`refs/heads/proef ${derde} refs/heads/proef ${tweede}\n`);
    assert.equal(goed.status, 0, String(goed.stderr));
  });
});

describe('de opdrachtregel', () => {
  it('geeft 0 problemen en exitcode 0 op een goede repository, met de lijst uit .verboden-woorden', () => {
    const r = draai(maakRepo({ '.verboden-woorden': 'Fictiefnaam\n' }));
    assert.equal(r.status, 0);
    assert.match(String(r.stdout), /0 problemen/);
  });

  it('geeft exitcode 1 en bestand, regelnummer en soort bij een probleem, zonder de waarde', () => {
    const r = draai(maakRepo({ 'docs/a.md': 'x\niemand@vereniging.nl' }), {
      VERBODEN_WOORDEN: 'Fictiefnaam',
    });
    assert.equal(r.status, 1);
    assert.match(String(r.stderr), /FOUT \[adres\] docs\/a\.md:2/);
    assert.match(String(r.stderr), /1 probleem/);
    assert.ok(!String(r.stderr).includes('vereniging.nl'));
  });
});

describe('de push-controle: omwegen en de hook zelf (review van de fix-PR)', () => {
  const gitIn = (root: string, ...argumenten: string[]): string =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Proef',
        '-c',
        'user.email=proef@example.com',
        '-c',
        'commit.gpgsign=false',
        ...argumenten,
      ],
      { cwd: root, encoding: 'utf8' },
    ).trim();
  const NUL = '0'.repeat(40);
  const nieuweRepo = (bestanden: Record<string, string>): string => {
    const root = maakRepo({ 'README.md': 'begin\n', ...bestanden });
    gitIn(root, 'init', '-q');
    return root;
  };
  const commit = (root: string, bericht: string): string => {
    gitIn(root, 'add', '-A', '-f');
    gitIn(root, 'commit', '-q', '--allow-empty', '-m', bericht);
    return gitIn(root, 'rev-parse', 'HEAD');
  };
  const push = (root: string, tip: string, remote = NUL, max?: number) =>
    controleerPush(root, `refs/heads/x ${tip} refs/heads/x ${remote}\n`, STANDAARD, max);

  it('ziet een bestand dat zichzelf verbergt met export-ignore in zijn eigen .gitattributes (FX-01)', () => {
    const root = nieuweRepo({});
    writeFileSync(path.join(root, '.gitattributes'), 'geheim.txt export-ignore\n');
    writeFileSync(path.join(root, 'geheim.txt'), 'Fictiefnaam\n');
    commit(root, 'met uitzondering');
    gitIn(root, 'rm', '-q', 'geheim.txt');
    const tip = commit(root, 'weer weg');
    const uit = push(root, tip);
    assert.equal(uit.fout, undefined);
    assert.deepEqual(
      uit.problemen.map((p) => p.regel),
      ['verboden-woord'],
    );
    assert.match(uit.problemen[0]?.pad ?? '', /^geheim\.txt \(commit /);
  });

  it('ziet een bestand in een map die de gewone controle overslaat, zoals coverage/ en node_modules/ (FX-02)', () => {
    const root = nieuweRepo({});
    mkdirSync(path.join(root, 'coverage'), { recursive: true });
    mkdirSync(path.join(root, 'node_modules', 'a'), { recursive: true });
    writeFileSync(path.join(root, 'coverage', 'x.txt'), 'Fictiefnaam\n');
    writeFileSync(path.join(root, 'node_modules', 'a', 'x.txt'), 'Fictiefnaam\n');
    commit(root, 'in genegeerde mappen');
    gitIn(root, 'rm', '-rq', 'coverage', 'node_modules');
    const uit = push(root, commit(root, 'weer weg'));
    assert.deepEqual(uit.problemen.map((p) => p.pad.replace(/ \(commit .*/, '')).sort(), [
      'coverage/x.txt',
      'node_modules/a/x.txt',
    ]);
  });

  it('controleert ook het commitbericht (FX-04)', () => {
    const root = nieuweRepo({});
    const tip = commit(root, 'Fictiefnaam heeft meegedaan');
    const uit = push(root, tip);
    assert.deepEqual(
      uit.problemen.map((p) => p.regel),
      ['verboden-woord'],
    );
    assert.match(uit.problemen[0]?.pad ?? '', /^commitbericht \(commit /);
    assert.ok(!(uit.problemen[0]?.melding ?? '').includes('Fictiefnaam'));
  });

  it('valt terug op "alles wat op geen remote staat" als de remote-sha lokaal onbekend is, zonder stacktrace (FX-03)', () => {
    const root = nieuweRepo({});
    const tip = commit(root, 'begin');
    const uit = push(root, tip, 'f'.repeat(40));
    assert.equal(uit.fout, undefined);
    assert.equal(uit.commits, 1);
  });

  it('faalt dicht op invoer die niet van git lijkt, en op te veel commits (FX-03, FX-06)', () => {
    const root = nieuweRepo({});
    const tip = commit(root, 'begin');
    assert.match(controleerPush(root, 'iets anders\n', STANDAARD).fout ?? '', /niet te lezen/);
    // Leeg (geen regels) is een push zonder nieuwe commits: schoon.
    assert.deepEqual(controleerPush(root, '', STANDAARD), { problemen: [], commits: 0 });
    // Een ref wegduwen voegt niets toe en is geen fout.
    assert.deepEqual(controleerPush(root, `(delete) ${NUL} refs/heads/x ${tip}\n`, STANDAARD), {
      problemen: [],
      commits: 0,
    });
    commit(root, 'twee');
    const derde = commit(root, 'drie');
    assert.match(push(root, derde, NUL, 2).fout ?? '', /3 nieuwe commits in één push; meer dan 2/);
  });

  /** Een werkrepo met de echte hook en het echte script, en een kale remote waar naartoe wordt gepusht. */
  const hookOmgeving = (): { werk: string; remote: string } => {
    const werk = maakRepo({
      'package.json': JSON.stringify({
        scripts: { 'controle:repo': 'node -e 0', 'controle:omwegen': 'node -e 0' },
      }),
    });
    const remote = mkdtempSync(path.join(tmpdir(), 'controleer-repo-remote-'));
    opgeruimd.push(remote);
    execFileSync('git', ['init', '-q', '--bare'], { cwd: remote });
    mkdirSync(path.join(werk, 'scripts'), { recursive: true });
    mkdirSync(path.join(werk, '.githooks'), { recursive: true });
    writeFileSync(path.join(werk, 'scripts', 'controleer-repo.ts'), readFileSync(SCRIPT));
    const hook = path.join(path.dirname(SCRIPT), '..', '.githooks', 'pre-push');
    writeFileSync(path.join(werk, '.githooks', 'pre-push'), readFileSync(hook), { mode: 0o755 });
    gitIn(werk, 'init', '-q');
    gitIn(werk, 'config', 'core.hooksPath', '.githooks');
    gitIn(werk, 'remote', 'add', 'oorsprong', remote);
    return { werk, remote };
  };
  const duw = (werk: string, vanNaar: string) =>
    spawnSync('git', ['push', '-q', 'oorsprong', vanNaar], {
      cwd: werk,
      encoding: 'utf8',
      env: { ...process.env, VERBODEN_WOORDEN: 'Fictiefnaam', NODE_TEST_CONTEXT: undefined },
    });
  const branchesOpRemote = (remote: string): string =>
    execFileSync('git', ['for-each-ref', '--format=%(refname)'], { cwd: remote, encoding: 'utf8' }).trim();

  it('de echte hook: een tussencommit met een verboden woord stopt de push, een schone push gaat door (FX-05)', () => {
    const { werk, remote } = hookOmgeving();
    writeFileSync(path.join(werk, 'notitie.md'), 'Fictiefnaam\n');
    commit(werk, 'te veel');
    gitIn(werk, 'rm', '-q', 'notitie.md');
    commit(werk, 'weer weg');
    // De werkmap is schoon, maar de eerste commit is dat niet: de push moet stoppen en de remote leeg blijven.
    const geweigerd = duw(werk, 'HEAD:refs/heads/proef');
    assert.notEqual(geweigerd.status, 0);
    assert.match(String(geweigerd.stderr), /commit [0-9a-f]{7}/);
    assert.equal(branchesOpRemote(remote), '');

    // Een geschiedenis zonder dat woord gaat met dezelfde hook gewoon door.
    gitIn(werk, 'checkout', '-q', '--orphan', 'schoon');
    gitIn(werk, 'rm', '-rfq', '--cached', '.');
    writeFileSync(path.join(werk, 'README.md'), 'begin\n');
    commit(werk, 'schoon begin');
    const goed = duw(werk, 'schoon:refs/heads/schoon');
    assert.equal(goed.status, 0, String(goed.stderr));
    assert.equal(branchesOpRemote(remote), 'refs/heads/schoon');
  });
});
