'use server';

import { redirect } from 'next/navigation';

import { normaliseerInlogcode } from '@/lib/inloggen/code';
import { normaliseerEmailadres } from '@/lib/inloggen/email';
import { maakSupabase } from '@/lib/supabase/server';

export interface InlogStaat {
  email: string;
  verstuurd: boolean;
  fout: 'adres' | 'vorm' | 'code' | 'te-vaak' | null;
}

function leesAdres(formulier: FormData): string {
  const invoer = formulier.get('email');
  return typeof invoer === 'string' ? invoer.trim() : '';
}

export async function stuurInlogcode(_vorige: InlogStaat, formulier: FormData): Promise<InlogStaat> {
  const invoer = leesAdres(formulier);
  const email = normaliseerEmailadres(invoer);
  if (!email) return { email: invoer, verstuurd: false, fout: 'adres' };

  const supabase = await maakSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Alleen leden die het bestuur heeft uitgenodigd kunnen inloggen; zo maakt niemand zelf een account.
      shouldCreateUser: false,
    },
  });
  // Alleen de soort fout in het log, nooit het adres (bouwgids 14.4: logs zonder persoonsgegevens).
  if (error) console.error(`inlogcode niet verstuurd: ${error.code ?? error.name}`);

  // Altijd hetzelfde antwoord, ook bij een onbekend adres: zo verraadt de pagina niet wie lid is. Het adres
  // komt niet in de URL (die belandt in logs en de geschiedenis van de browser), alleen terug in het eigen formulier.
  return { email, verstuurd: true, fout: null };
}

export async function bevestigInlogcode(_vorige: InlogStaat, formulier: FormData): Promise<InlogStaat> {
  const invoer = leesAdres(formulier);
  const email = normaliseerEmailadres(invoer);
  if (!email) return { email: invoer, verstuurd: true, fout: 'adres' };
  const code = normaliseerInlogcode(formulier.get('code'));
  if (!code) return { email, verstuurd: true, fout: 'vorm' };

  const supabase = await maakSupabase();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) {
    console.error(`inlogcode niet geaccepteerd: ${error.code ?? error.name}`);
    return { email, verstuurd: true, fout: error.status === 429 ? 'te-vaak' : 'code' };
  }
  // Een geldige mailcode geeft alleen een gewone sessie; beheer blijft zijn eigen MFA-controle uitvoeren.
  redirect('/mijn');
}
