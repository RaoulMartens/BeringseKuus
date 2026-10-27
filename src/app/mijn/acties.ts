'use server';

import { redirect } from 'next/navigation';

import { maakSupabase } from '@/lib/supabase/server';

export async function logUit(): Promise<void> {
  const supabase = await maakSupabase();
  // Alleen op dit apparaat: wie op de laptop uitlogt, blijft op de telefoon ingelogd.
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/inloggen?uitgelogd=1');
}
