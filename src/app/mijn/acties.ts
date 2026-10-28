'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { maakSupabase } from '@/lib/supabase/server';

export async function logUit(): Promise<void> {
  const supabase = await maakSupabase();
  // Alleen op dit apparaat: wie op de laptop uitlogt, blijft op de telefoon ingelogd.
  await supabase.auth.signOut({ scope: 'local' });
  // Daarna alle sessiecookies weg, ook als signOut faalt of er nog een stuk (.0, .1) is blijven staan
  // (review PR10-01).
  const winkel = await cookies();
  for (const { name } of winkel.getAll()) {
    if (name.startsWith('sb-')) winkel.delete({ name, path: '/' });
  }
  redirect('/inloggen?uitgelogd=1');
}
