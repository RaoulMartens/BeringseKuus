// Wat het antwoord van Supabase op "wie is dit?" betekent. Zuivere logica, los van de aanroep, zodat de grens tussen "niet
// ingelogd" en "Supabase antwoordt niet" met tests vast te leggen is (review F1-05).
//
// Het ontwerp zegt: een storing stuurt je nooit naar Inloggen (wireframes/INDEX.md, scherm `storing`). Een lid dat tijdens
// een storing van de database naar inloggen wordt gestuurd, denkt dat hij is uitgelogd, vraagt een nieuwe link aan en krijgt
// die ook niet. getUser() geeft bij een netwerkfout `user: null`, net als zonder sessie: alleen de fout verschilt.

import { isAuthRetryableFetchError, type AuthError, type User } from '@supabase/supabase-js';

export type Sessie = { soort: 'ingelogd'; gebruiker: User } | { soort: 'geen_sessie' } | { soort: 'storing' };

export function beoordeelSessie(antwoord: { user: User | null; error: AuthError | null }): Sessie {
  // Een netwerkfout of een 5xx van Supabase Auth: niet aan het lid te zien, en niet te herstellen door opnieuw in te loggen.
  if (antwoord.error && isAuthRetryableFetchError(antwoord.error)) return { soort: 'storing' };
  if (antwoord.user) return { soort: 'ingelogd', gebruiker: antwoord.user };
  // Geen gebruiker en geen storing: geen sessie, een verlopen of ingetrokken sessie.
  return { soort: 'geen_sessie' };
}
