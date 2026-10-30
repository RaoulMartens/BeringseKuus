// Een verzonnen lid in de lokale database, om lokaal te kunnen inloggen (review F0-16, F1-03, F1-04). Zonder lid stuurt
// /inloggen geen link: aanmelden kan niet (docs/bouw/Inloggen.md). Het script maakt wat het bestuur ook zou maken: een
// inlogaccount, een rij in `leden` en een rij in `leden_prive`. Alleen een inlogaccount is niet genoeg: zonder rij in `leden`
// kent het platform je niet en stuurt /mijn je met een melding terug.
//
// Met --beheerder krijgt het lid `is_admin`. Dat is de eerste stap van de procedure uit docs/bouw/Beheerders.md: daarna
// stel je zelf een app in, controleer je die en bevestig je hem. Het script slaat geen stappen over.
//
// De inlogmail komt in Mailpit, de lokale postbus (het adres staat in `npx supabase status`).
//
// Alleen lokaal: de adressen en sleutel komen uit `supabase status`, en scripts/lokale-supabase.ts weigert alles wat
// niet naar deze computer wijst. Gebruik een verzonnen adres, nooit dat van een echt lid.
//
// Gebruik:   npm run lid:lokaal -- iemand@example.com [--naam "Voornaam Achternaam"] [--beheerder]

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../src/lib/supabase/database.types.ts';

import { leesLokaleSupabase } from './lokale-supabase.ts';

const GEBRUIK =
  'Gebruik: npm run lid:lokaal -- iemand@example.com [--naam "Voornaam Achternaam"] [--beheerder]';

export interface LidWens {
  email: string;
  voornaam: string;
  achternaam: string;
  beheerder: boolean;
}

/** Leest de argumenten; geeft de wens, of de reden waarom het niet kan. */
export function leesArgumenten(argumenten: string[]): LidWens | { fout: string } {
  const [email, ...rest] = argumenten;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { fout: GEBRUIK };

  let naam = 'Test Lid';
  let beheerder = false;
  for (let i = 0; i < rest.length; i += 1) {
    const argument = rest[i];
    if (argument === '--beheerder') {
      beheerder = true;
    } else if (argument === '--naam') {
      const waarde = rest[i + 1]?.trim();
      if (!waarde || waarde.startsWith('--')) return { fout: GEBRUIK };
      naam = waarde;
      i += 1;
    } else {
      return { fout: GEBRUIK };
    }
  }

  // Het eerste woord is de voornaam, de rest de achternaam ("Jan van Dijk" wordt "Jan" en "van Dijk"). Eén woord weigeren
  // we: de database eist een achternaam, en een verzonnen achternaam verbergt de fout.
  const [voornaam, ...achternaam] = naam.split(/\s+/);
  if (!voornaam || achternaam.length === 0) {
    return { fout: `${GEBRUIK}\nGeef een voor- en achternaam, bijvoorbeeld --naam "Test Lid".` };
  }
  return { email, voornaam, achternaam: achternaam.join(' '), beheerder };
}

async function uitvoeren(): Promise<number> {
  const wens = leesArgumenten(process.argv.slice(2));
  if ('fout' in wens) {
    console.error(wens.fout);
    return 1;
  }
  const lokaal = leesLokaleSupabase();
  const beheer = createClient<Database>(lokaal.apiUrl, lokaal.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const account = await beheer.auth.admin.createUser({ email: wens.email, email_confirm: true });
  if (account.error) {
    console.error(`lid:lokaal: ${account.error.message}`);
    return 1;
  }
  const uid = account.data.user.id;

  // Mislukt een van de twee rijen, dan het account weer weghalen: een account zonder lid is precies de halve toestand
  // die dit script moet voorkomen.
  const lid = await beheer
    .from('leden')
    .insert({ auth_user_id: uid, voornaam: wens.voornaam, achternaam: wens.achternaam, type: 'lid' })
    .select('id')
    .single();
  const prive = lid.error
    ? lid
    : await beheer
        .from('leden_prive')
        .insert({ lid_id: lid.data.id, email: wens.email, is_admin: wens.beheerder });
  if (lid.error || prive.error) {
    await beheer.auth.admin.deleteUser(uid);
    console.error(`lid:lokaal: ${(lid.error ?? prive.error)?.message ?? 'onbekende fout'}`);
    return 1;
  }

  console.log(
    `lid:lokaal: ${wens.email} aangemaakt als ${wens.voornaam} ${wens.achternaam}${wens.beheerder ? ' (beheerder: nog zonder app)' : ''}; ` +
      `log in op /inloggen, de mail staat in Mailpit (${lokaal.mailpitUrl})`,
  );
  if (wens.beheerder) {
    console.log(
      'lid:lokaal: beheer werkt pas na het instellen van een app en de bevestiging, zie docs/bouw/Beheerders.md',
    );
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await uitvoeren();
}
