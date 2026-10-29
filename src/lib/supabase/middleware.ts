// Supabase in de middleware (src/middleware.ts), die de sessie ververst vóór de pagina. Eigen fabriek, net als
// server.ts: alle Supabase-clients in de app komen uit deze map en zijn getypeerd met de databasetypen. ESLint
// verbiedt een client elders te maken (review PR14-08, eslint.config.mjs).

import { type CookieMethodsServer, createServerClient } from '@supabase/ssr';

import { cookieOpties } from './cookies';
import type { Database } from './database.types';

export function maakMiddlewareSupabase(url: string, sleutel: string, cookies: CookieMethodsServer) {
  return createServerClient<Database>(url, sleutel, { cookieOptions: cookieOpties, cookies });
}
