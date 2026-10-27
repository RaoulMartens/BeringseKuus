import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { maakSupabase } from '@/lib/supabase/server';

import { logUit } from './acties';

export const metadata: Metadata = { title: 'Mijn account – Ledenplatform' };

export default async function MijnAccount() {
  const supabase = await maakSupabase();
  // getUser controleert de sessie bij Supabase zelf; de cookie alleen lezen is niet genoeg om te vertrouwen.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/inloggen');

  return (
    <main>
      <h1>Mijn account</h1>
      <p>
        Je bent ingelogd als <strong>{user.email}</strong>.
      </p>
      <form action={logUit}>
        <button type="submit">Uitloggen</button>
      </form>
    </main>
  );
}
