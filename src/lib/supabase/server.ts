// Supabase aan de serverkant (Server Components, serveracties en route handlers). Er is bewust geen
// Supabase-client in de browser: alle aanroepen gaan via de server, met de sessie in een cookie.
//
// De sessie ververst src/middleware.ts bij elke aanvraag, vóór de pagina. Een Server Component kan zelf geen
// cookies zetten (vandaar de lege catch hieronder); dat hoeft ook niet, want de middleware heeft de sessie al
// ververst.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { verplicht } from '@/lib/omgeving';

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
