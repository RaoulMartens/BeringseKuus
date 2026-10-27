'use server';

import { redirect } from 'next/navigation';

import { maakSupabase } from '@/lib/supabase/server';

export async function bevestigInloggen(formulier: FormData): Promise<void> {
  const sleutel = formulier.get('token_hash');
  if (typeof sleutel !== 'string' || sleutel === '') redirect('/inloggen?fout=link');

  const supabase = await maakSupabase();
  const { error } = await supabase.auth.verifyOtp({ type: 'email', token_hash: sleutel });
  if (error) {
    console.error(`inloglink niet geaccepteerd: ${error.code ?? error.name}`);
    redirect('/inloggen?fout=link');
  }
  // Waarheen na het inloggen staat vast: een adres uit de link volgen zou een open doorverwijzing zijn.
  redirect('/mijn');
}
