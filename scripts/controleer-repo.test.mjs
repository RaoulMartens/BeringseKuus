// Tests voor scripts/controleer-repo.mjs. Draaien met: node --test "scripts/**/*.test.mjs"
// Elke regel van de controle heeft een test die faalt als de regel niet werkt (bouwgids 14.5).

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { controleer } from './controleer-repo.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'controleer-repo.mjs');
const opgeruimd = [];

const TABEL_KOP =
  '| Bestand | Soort | Bron | Licentie | Licentiehouder | Toestemming |\n|---|---|---|---|---|---|\n';
const licenties = (...rijen) => `# Licenties\n\n${TABEL_KOP}${rijen.join('\n')}\n`;
const rij = (
  bestand,
  bron = 'Google Fonts',
  licentie = 'SIL OFL 1.1',
  houder = 'Nunito-ontwerpers',
  toestemming = 'n.v.t.',
) => `| \`${bestand}\` | lettertype | ${bron} | ${licentie} | ${houder} | ${toestemming} |`;

/** Maakt een tijdelijke repository met de gegeven bestanden. docs/licenties.md staat er standaard in. */
function maakRepo(bestanden = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'controleer-repo-'));
  opgeruimd.push(root);
  const alles = { 'docs/licenties.md': licenties(), ...bestanden };
  for (const [pad, inhoud] of Object.entries(alles)) {
    const volledig = path.join(root, pad);
    mkdirSync(path.dirname(volledig), { recursive: true });
    writeFileSync(volledig, inhoud);
  }
  return root;
}

const regels = (root, opties) => controleer(root, opties).map((p) => p.regel);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]);

after(() => {
  for (const root of opgeruimd) rmSync(root, { recursive: true, force: true });
});

describe('lege repository', () => {
  it('geeft 0 problemen', () => {
    assert.deepEqual(controleer(maakRepo()), []);
  });

  it('faalt als docs/licenties.md ontbreekt', () => {
    const root = maakRepo();
    rmSync(path.join(root, 'docs/licenties.md'));
    assert.deepEqual(regels(root), ['licentie']);
  });

  it('negeert node_modules en build-mappen', () => {
    const root = maakRepo({ 'node_modules/x/a.png': PNG, '.next/b.woff2': PNG, '.open-next/c.png': PNG });
    assert.deepEqual(controleer(root), []);
  });
});

describe('licentie: afbeeldingen, iconen, lettertypen', () => {
  it('faalt op een afbeelding zonder vermelding', () => {
    const root = maakRepo({ 'public/logo.png': PNG });
    assert.deepEqual(regels(root), ['licentie']);
  });

  it('faalt op een svg-icoon, een lettertype, een pdf en een spreadsheet zonder vermelding', () => {
    const root = maakRepo({
      'src/icoon.svg': '<svg/>',
      'public/f.woff2': PNG,
      'docs/p.pdf': PNG,
      'seed/data.xlsx': PNG,
    });
    assert.equal(regels(root).filter((r) => r === 'licentie').length, 4);
  });

  it('slaagt met een volledige vermelding', () => {
    const root = maakRepo({
      'public/fonts/Nunito.woff2': PNG,
      'docs/licenties.md': licenties(rij('public/fonts/Nunito.woff2')),
    });
    assert.deepEqual(controleer(root), []);
  });

  it('faalt als een veld in de vermelding een placeholder is', () => {
    const root = maakRepo({
      'public/a.woff2': PNG,
      'docs/licenties.md': licenties(rij('public/a.woff2', 'Google Fonts', 'SIL OFL 1.1', 'tbd', 'n.v.t.')),
    });
    const res = controleer(root);
    assert.deepEqual(
      res.map((p) => p.regel),
      ['licentie', 'licentie'],
    );
    assert.ok(res.some((p) => p.pad === 'docs/licenties.md' && /Licentiehouder/.test(p.melding)));
  });

  it('faalt als een veld leeg is', () => {
    const root = maakRepo({
      'public/a.woff2': PNG,
      'docs/licenties.md': licenties(rij('public/a.woff2', '', 'SIL OFL 1.1', 'Nunito-ontwerpers', 'n.v.t.')),
    });
    assert.ok(regels(root).includes('licentie'));
  });

  it('accepteert een map als vermelding', () => {
    const root = maakRepo({
      'public/fonts/a.woff2': PNG,
      'public/fonts/b.woff2': PNG,
      'docs/licenties.md': licenties(rij('public/fonts/')),
    });
    assert.deepEqual(controleer(root), []);
  });

  it('accepteert een patroon als vermelding, maar alleen binnen het patroon', () => {
    const root = maakRepo({
      'public/fonts/a.woff2': PNG,
      'public/b.woff2': PNG,
      'docs/licenties.md': licenties(rij('public/fonts/*.woff2')),
    });
    const res = controleer(root);
    assert.deepEqual(
      res.map((p) => p.pad),
      ['public/b.woff2'],
    );
  });

  it('negeert hoofdletters in de extensie niet: .PNG telt als afbeelding', () => {
    const root = maakRepo({ 'public/FOTO.PNG': PNG });
    assert.deepEqual(regels(root), ['licentie']);
  });

  it('een voorbeeldrij in de tabel telt niet als vermelding', () => {
    const root = maakRepo({
      'public/a.png': PNG,
      'docs/licenties.md': licenties('| (nog niets) | | | | | |'),
    });
    assert.deepEqual(regels(root), ['licentie']);
  });
});

describe('geheim-bestand', () => {
  it('faalt op .env, .env.local en .env.production', () => {
    const root = maakRepo({ '.env': 'A=1', '.env.local': 'A=1', '.env.production': 'A=1' });
    assert.deepEqual(regels(root), ['geheim-bestand', 'geheim-bestand', 'geheim-bestand']);
  });

  it('laat .env.example toe', () => {
    assert.deepEqual(controleer(maakRepo({ '.env.example': 'SUPABASE_URL=' })), []);
  });

  it('faalt op .dev.vars en laat .dev.vars.example toe', () => {
    assert.deepEqual(regels(maakRepo({ '.dev.vars': 'A=1' })), ['geheim-bestand']);
    assert.deepEqual(controleer(maakRepo({ '.dev.vars.example': 'A=' })), []);
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
    const res = controleer(root);
    const verboden = res
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
    const res = controleer(root);
    assert.equal(res.filter((p) => p.regel === 'verboden-pad').length, 3);
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
  it('faalt op een spreadsheet met leden in de naam, ook met vermelding', () => {
    const root = maakRepo({
      'data/leden.xlsx': PNG,
      'docs/licenties.md': licenties(rij('data/leden.xlsx')),
    });
    assert.deepEqual(regels(root), ['ledenbestand']);
  });

  it('faalt op een csv met leden in de naam', () => {
    assert.ok(regels(maakRepo({ 'ledenlijst.csv': 'naam\n' })).includes('ledenbestand'));
  });
});

describe('adres', () => {
  it('faalt op een echt e-mailadres', () => {
    const root = maakRepo({ 'docs/a.md': 'Mail naar iemand@vereniging.nl graag' });
    const res = controleer(root);
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
    assert.deepEqual(controleer(root), []);
  });

  it('zet het adres zelf niet in de melding', () => {
    const root = maakRepo({ 'docs/a.md': 'iemand@vereniging.nl' });
    assert.ok(!JSON.stringify(controleer(root)).includes('vereniging.nl'));
  });

  it('blijft snel op een regel van bijna 2 MB zonder @ (minified code)', { timeout: 20000 }, () => {
    const root = maakRepo({ 'public/app.js': 'a'.repeat(1.9 * 1024 * 1024) });
    assert.deepEqual(controleer(root), []);
  });

  it('vindt een adres midden in een lange regel', () => {
    const root = maakRepo({
      'public/app.js': `${'x '.repeat(50000)}iemand@vereniging.nl${' y'.repeat(50000)}`,
    });
    assert.deepEqual(regels(root), ['adres']);
  });

  it('scant ook een csv', () => {
    assert.ok(regels(maakRepo({ 'seed/gegevens.csv': 'naam,mail\nAn,an@thuis.nl\n' })).includes('adres'));
  });
});

describe('telefoon', () => {
  it('faalt op een echt mobiel nummer in verschillende notaties', () => {
    for (const nummer of ['06 55 12 90 34', '0655129034', '06-55129034', '+31 6 55129034', '+31655129034']) {
      const root = maakRepo({ 'docs/a.md': `Bel ${nummer}.` });
      assert.deepEqual(regels(root), ['telefoon'], nummer);
    }
  });

  it('laat een duidelijk verzonnen nummer toe', () => {
    const verzonnen = [
      '06 12 34 56 78',
      '0612345678',
      '06 23 45 67 89',
      '06 34 56 78 90',
      '06 87 65 43 21',
      '06 00 00 00 00',
    ];
    for (const nummer of verzonnen) {
      assert.deepEqual(controleer(maakRepo({ 'docs/a.md': `Bel ${nummer}.` })), [], nummer);
    }
  });

  it('faalt op een nummer dat bijna op een reeks lijkt', () => {
    assert.deepEqual(regels(maakRepo({ 'docs/a.md': '06 12 34 56 79' })), ['telefoon']);
  });

  it('negeert een lang getal dat toevallig met 06 begint', () => {
    assert.deepEqual(controleer(maakRepo({ 'docs/a.md': 'id 0655129034567' })), []);
  });

  it('zet het nummer zelf niet in de melding', () => {
    const root = maakRepo({ 'docs/a.md': '06 55 12 90 34' });
    assert.ok(!JSON.stringify(controleer(root)).includes('12 90'));
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
    const root = maakRepo({ 'b.ts': 'const k = "re_123456789012345678901234";' });
    assert.ok(!JSON.stringify(controleer(root)).includes('123456789012345678901234'));
  });

  it('laat gewone tekst en een korte "re_" toe', () => {
    assert.deepEqual(controleer(maakRepo({ 'a.ts': 'const re_x = 1; // regex' })), []);
  });
});

describe('verboden-woord', () => {
  it('faalt op een woord uit de lijst, hoofdletterongevoelig, per regel', () => {
    const root = maakRepo({ 'docs/a.md': 'eerste regel\nPiet JANSSEN was er' });
    const res = controleer(root, { verbodenWoorden: ['Janssen'] });
    assert.deepEqual(
      res.map((p) => [p.regel, p.regelnummer]),
      [['verboden-woord', 2]],
    );
  });

  it('zet het woord zelf niet in de melding', () => {
    const root = maakRepo({ 'docs/a.md': 'Piet Janssen' });
    assert.ok(!JSON.stringify(controleer(root, { verbodenWoorden: ['Janssen'] })).includes('Janssen'));
  });

  it('matcht hele woorden: Janssens is geen Janssen', () => {
    const root = maakRepo({ 'docs/a.md': 'de Janssens' });
    assert.deepEqual(controleer(root, { verbodenWoorden: ['Janssen'] }), []);
  });

  it('controleert ook de bestandsnaam', () => {
    const root = maakRepo({ 'docs/notitie-janssen.md': 'x' });
    assert.deepEqual(regels(root, { verbodenWoorden: ['Janssen'] }), ['verboden-woord']);
  });

  it('doet niets met een lege lijst of lege woorden', () => {
    const root = maakRepo({ 'docs/a.md': 'Janssen' });
    assert.deepEqual(controleer(root, { verbodenWoorden: ['', ' '] }), []);
  });
});

describe('te groot', () => {
  it('meldt een tekstbestand boven 2 MB in plaats van het stilzwijgend over te slaan', () => {
    const root = maakRepo({ 'seed/groot.json': 'a'.repeat(2 * 1024 * 1024 + 1) });
    assert.deepEqual(regels(root), ['niet-gescand']);
  });
});

describe('met git', () => {
  const gitRepo = () => {
    const root = maakRepo({ '.gitignore': '.env*\n!.env.example\n', '.env.local': 'A=1' });
    execFileSync('git', ['init', '-q'], { cwd: root });
    return root;
  };

  it('negeert een .env.local die git negeert', () => {
    assert.deepEqual(controleer(gitRepo()), []);
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
});

describe('de opdrachtregel', () => {
  it('geeft 0 problemen en exitcode 0 op een goede repository', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--root', maakRepo()], { encoding: 'utf8' });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /0 problemen/);
  });

  it('geeft exitcode 1 en bestand, regelnummer en soort bij een probleem', () => {
    const root = maakRepo({ 'docs/a.md': 'x\niemand@vereniging.nl' });
    const r = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /FOUT \[adres\] docs\/a\.md:2/);
    assert.match(r.stderr, /1 probleem/);
    assert.ok(!r.stderr.includes('vereniging.nl'));
  });

  it('leest VERBODEN_WOORDEN uit de omgeving', () => {
    const root = maakRepo({ 'docs/a.md': 'Piet Janssen' });
    const r = spawnSync(process.execPath, [SCRIPT, '--root', root], {
      encoding: 'utf8',
      env: { ...process.env, VERBODEN_WOORDEN: 'Janssen, Pietersen' },
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /verboden-woord/);
    assert.ok(!r.stderr.includes('Janssen'));
  });
});
