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

export function leesLokaleSupabase(): LokaleSupabase {
  const uit = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  // Soms staat er een regel tekst voor of na het JSON-blok; neem alleen het blok.
  const blok = uit.slice(uit.indexOf('{'), uit.lastIndexOf('}') + 1);
  return uitStatus(JSON.parse(blok));
}
