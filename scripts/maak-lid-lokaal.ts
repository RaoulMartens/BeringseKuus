// Een verzonnen lid in de lokale database, om lokaal te kunnen inloggen (review F0-16). Zonder lid stuurt
// /inloggen geen link: aanmelden kan niet (docs/bouw/Inloggen.md). De inlogmail komt in Mailpit, de lokale postbus
// (het adres staat in `npx supabase status`).
//
// Alleen lokaal: de adressen en sleutel komen uit `supabase status`, en scripts/lokale-supabase.ts weigert alles wat
// niet naar deze computer wijst. Gebruik een verzonnen adres, nooit dat van een echt lid.
//
// Gebruik:   npm run lid:lokaal -- iemand@example.com

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createClient } from '@supabase/supabase-js';

import { leesLokaleSupabase } from './lokale-supabase.ts';

async function uitvoeren(): Promise<number> {
  const email = process.argv[2] ?? '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Gebruik: npm run lid:lokaal -- iemand@example.com');
    return 1;
  }
  const lokaal = leesLokaleSupabase();
  const beheer = createClient(lokaal.apiUrl, lokaal.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await beheer.auth.admin.createUser({ email, email_confirm: true });
  if (error) {
    console.error(`lid:lokaal: ${error.message}`);
    return 1;
  }
  console.log(
    `lid:lokaal: ${email} aangemaakt; log in op /inloggen, de mail staat in Mailpit (${lokaal.mailpitUrl})`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await uitvoeren();
}
