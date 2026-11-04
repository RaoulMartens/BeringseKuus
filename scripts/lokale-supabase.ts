// De adressen en sleutels van de lokale Supabase (Docker), voor de browsertests en `npm run env:lokaal`.
//
// Ze komen uit `supabase status` en staan dus nergens in de repository. Het zijn de vaste sleutels van de lokale
// ontwikkelomgeving, niet die van het echte project; toch worden ze nooit getoond of gelogd.

import { execFileSync } from 'node:child_process';

export interface LokaleSupabase {
  apiUrl: string;
  publishableKey: string;
  secretKey: string;
  mailpitUrl: string;
}

const LOKAAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

/** Haalt de velden uit de uitvoer van `supabase status -o json`, en weigert alles wat niet lokaal is. */
export function uitStatus(status: unknown): LokaleSupabase {
  const velden = (typeof status === 'object' && status !== null ? status : {}) as Record<string, unknown>;
  const lees = (naam: string): string => {
    const waarde = velden[naam];
    if (typeof waarde !== 'string' || waarde === '') {
      throw new Error(`supabase status mist ${naam}: draai eerst npm run supabase:start`);
    }
    return waarde;
  };
  const uitkomst = {
    apiUrl: lees('API_URL'),
    publishableKey: lees('PUBLISHABLE_KEY'),
    secretKey: lees('SECRET_KEY'),
    mailpitUrl: lees('MAILPIT_URL'),
  };
  for (const adres of [uitkomst.apiUrl, uitkomst.mailpitUrl]) {
    if (!LOKAAL.test(adres)) throw new Error('supabase status wijst niet naar deze computer; gestopt');
  }
  return uitkomst;
}

const draaiStatus = (): string =>
  execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

/**
 * `draai` geeft de uitvoer van `supabase status -o json`. Die geeft exitcode 1 (met toch de volledige JSON) zodra een
 * uitgesloten service niet draait, bijvoorbeeld na `supabase db reset` of `npm run test:db`; dan staat de database er
 * wel. Daarom gaat dit op de uitvoer en niet op de exitcode: zonder JSON is de omgeving er echt niet.
 */
export function leesLokaleSupabase(draai: () => string = draaiStatus): LokaleSupabase {
  let uit: string;
  try {
    uit = draai();
  } catch (fout) {
    const stdout =
      typeof fout === 'object' && fout !== null ? (fout as { stdout?: unknown }).stdout : undefined;
    uit = typeof stdout === 'string' ? stdout : '';
  }
  // Soms staat er een regel tekst voor of na het JSON-blok; neem alleen het blok.
  const begin = uit.indexOf('{');
  const einde = uit.lastIndexOf('}');
  if (begin < 0 || einde < begin) {
    throw new Error('de lokale Supabase draait niet: draai eerst npm run supabase:start');
  }
  return uitStatus(JSON.parse(uit.slice(begin, einde + 1)));
}
