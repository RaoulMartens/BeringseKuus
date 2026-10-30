// Wie is ingelogd, voor de bovenbalk en Mijn account. De gegevens komen via de rechten van de database (RLS), niet via een
// eigen controle: een lid leest zijn eigen rij in leden_prive en de naam van een lid in leden.

import { maakSupabase } from '@/lib/supabase/server';

export interface Gebruiker {
  voornaam: string;
  achternaam: string;
  email: string;
  /** Heeft beheerrechten (is_admin); of die in deze sessie ook gelden, beslist beheerstatus(). */
  isBeheerder: boolean;
}

/** De ingelogde gebruiker, of null zonder sessie of zonder lid. Een fout van de database is een fout, geen "niet ingelogd". */
export async function huidigeGebruiker(): Promise<Gebruiker | null> {
  const supabase = await maakSupabase();
  // getUser controleert de sessie bij Supabase zelf; alleen de cookie lezen is niet genoeg om te vertrouwen.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  // Een beheerder ziet alle rijen van leden_prive; daarom op het adres van deze gebruiker.
  const { data, error } = await supabase
    .from('leden_prive')
    .select('email, is_admin, leden(voornaam, achternaam)')
    .eq('email', user.email)
    .maybeSingle();
  if (error) throw new Error(`gebruiker niet te lezen: ${error.code ?? error.message}`);
  if (!data?.leden?.voornaam) return null;
  return {
    voornaam: data.leden.voornaam,
    achternaam: data.leden.achternaam,
    email: data.email,
    isBeheerder: data.is_admin,
  };
}
