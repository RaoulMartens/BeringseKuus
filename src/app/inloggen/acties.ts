'use server';

import { redirect } from 'next/navigation';

import { normaliseerEmailadres } from '@/lib/inloggen/email';
import { verplicht } from '@/lib/omgeving';
import { maakSupabase } from '@/lib/supabase/server';

export async function stuurInloglink(formulier: FormData): Promise<void> {
  const email = normaliseerEmailadres(formulier.get('email'));
  if (!email) redirect('/inloggen?fout=ongeldig');

  const supabase = await maakSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Alleen leden die het bestuur heeft uitgenodigd kunnen inloggen; zo maakt niemand zelf een account.
      shouldCreateUser: false,
      // Het adres van de site staat vast in de instellingen. Het uit de aanvraag halen (de Host-header) zou
      // iemand een inloglink naar een eigen site laten maken.
      emailRedirectTo: `${verplicht('SITE_URL')}/auth/bevestigen`,
    },
  });
  // Alleen de soort fout in het log, nooit het adres (bouwgids 14.4: logs zonder persoonsgegevens).
  if (error) console.error(`inloglink niet verstuurd: ${error.code ?? error.name}`);

  // Altijd hetzelfde antwoord, ook bij een onbekend adres: zo verraadt de pagina niet wie lid is. Het adres
  // komt niet in de URL (die belandt in logs en de geschiedenis van de browser).
  redirect('/inloggen?verstuurd=1');
}
