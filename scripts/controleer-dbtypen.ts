// Poortcontrole: de databasetypen zijn bij (bouwgids 14.2, review F0-02).
//
// src/lib/supabase/database.types.ts komt uit `supabase gen types` op de lokale database, die net uit de migraties
// is opgebouwd (npm run test:db gaat in de poort vóór deze stap). Wijzigt een migratie een tabel of functie, dan
// moeten de typen mee: anders typt de code tegen een database die niet meer bestaat, en leest hij antwoorden met de
// hand (`as {…}`), wat 14.2 verbiedt. Deze controle maakt de typen opnieuw en vergelijkt ze met het bestand.
//
// Gebruik:   node scripts/controleer-dbtypen.ts            controleren (de poort)
//            node scripts/controleer-dbtypen.ts --schrijf  het bestand bijwerken (npm run types:db)
// Uitkomst:  "0 problemen" en exitcode 0, of een melding en exitcode 1.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { format, resolveConfig } from 'prettier';

export const BESTAND = 'src/lib/supabase/database.types.ts';

const KOP =
  '// Gegenereerd met `npm run types:db` uit de lokale database (de migraties). Niet met de hand wijzigen: de poort\n' +
  '// maakt dit bestand opnieuw en keurt een verschil af (scripts/controleer-dbtypen.ts).\n\n';

/** De typen zoals ze in het bestand horen: met de kop, en opgemaakt door Prettier (anders faalt format:check). */
export async function maakBestand(root: string, gegenereerd: string): Promise<string> {
  const pad = path.join(root, BESTAND);
  const opties = (await resolveConfig(pad)) ?? {};
  return format(KOP + gegenereerd, { ...opties, filepath: pad });
}

/** Vergelijkt het bestand met wat het hoort te zijn. Leeg = goed. */
export function vergelijk(verwacht: string, bestaand: string | undefined): string[] {
  if (bestaand === undefined) return [`${BESTAND} ontbreekt; draai npm run types:db`];
  return bestaand === verwacht
    ? []
    : [`${BESTAND} is niet bij met de migraties; draai npm run types:db en neem het bestand mee`];
}

function genereer(root: string): string {
  // Alleen het schema public: daar komen de tabellen en functies van de app. De lokale database moet draaien.
  return execFileSync('npx', ['supabase', 'gen', 'types', 'typescript', '--local', '--schema', 'public'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

async function uitvoeren(): Promise<number> {
  const root = path.resolve('.');
  const verwacht = await maakBestand(root, genereer(root));
  if (process.argv.includes('--schrijf')) {
    writeFileSync(path.join(root, BESTAND), verwacht);
    console.log(`controleer-dbtypen: ${BESTAND} bijgewerkt`);
    return 0;
  }
  let bestaand: string | undefined;
  try {
    bestaand = readFileSync(path.join(root, BESTAND), 'utf8');
  } catch {
    bestaand = undefined;
  }
  const problemen = vergelijk(verwacht, bestaand);
  if (problemen.length === 0) {
    console.log('controleer-dbtypen: 0 problemen');
    return 0;
  }
  for (const p of problemen) console.error(`FOUT ${p}`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await uitvoeren();
}
