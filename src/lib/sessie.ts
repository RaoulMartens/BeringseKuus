// Wie is er ingelogd, één keer per aanvraag. Het kader van een scherm, de pagina zelf en de beheerpoort vragen het alle drie;
// zonder cache is dat drie rondes naar Supabase Auth per pagina (review F1-17). `cache` van React onthoudt het antwoord
// alleen voor de duur van één aanvraag: een tweede lid of een volgende aanvraag krijgt nooit dit antwoord.
//
// Antwoordt Supabase niet, dan gaat het lid naar /storing en niet naar inloggen (zie supabase/sessie-uitkomst.ts).

import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { maakSupabase } from '@/lib/supabase/server';

import { beoordeelSessie } from '@/lib/supabase/sessie-uitkomst';

/** De ingelogde gebruiker, of null zonder sessie. Bij een storing: doorsturen naar /storing. */
export const huidigeAuthGebruiker = cache(async (): Promise<User | null> => {
  const supabase = await maakSupabase();
  // getUser controleert de sessie bij Supabase zelf; alleen de cookie lezen is niet genoeg om te vertrouwen.
  const { data, error } = await supabase.auth.getUser();
  const sessie = beoordeelSessie({ user: data.user, error });
  if (sessie.soort === 'storing') redirect('/storing');
  return sessie.soort === 'ingelogd' ? sessie.gebruiker : null;
});
