// Supabase aan de serverkant (Server Components, serveracties en route handlers). Er is bewust geen
// Supabase-client in de browser: alle aanroepen gaan via de server, met de sessie in een cookie.
//
// Nog niet: de sessie verversen bij elke aanvraag via een proxy (middleware). Of dat op Cloudflare Workers werkt,
// bewijst fase 0 proefroute 2. Tot dan ververst de sessie bij een serveractie of de callback; een Server Component kan
// zelf geen cookies zetten (vandaar de lege catch hieronder).

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function verplicht(naam: string): string {
  const waarde = process.env[naam];
  if (!waarde) throw new Error(`De omgevingsvariabele ${naam} ontbreekt (zie .env.example).`);
  return waarde;
}

export async function maakSupabase() {
  const winkel = await cookies();
  return createServerClient(verplicht('SUPABASE_URL'), verplicht('SUPABASE_PUBLISHABLE_KEY'), {
    cookies: {
      getAll() {
        return winkel.getAll();
      },
      setAll(teZetten) {
        try {
          for (const { name, value, options } of teZetten) winkel.set(name, value, options);
        } catch {
          // In een Server Component kunnen geen cookies worden gezet; zie de uitleg bovenaan.
        }
      },
    },
  });
}
