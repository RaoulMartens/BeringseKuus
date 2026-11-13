// Wie is ingelogd, voor de bovenbalk en Mijn account. De gegevens komen via de rechten van de database (RLS), niet via een
// eigen controle: een lid leest zijn eigen rij in leden_prive en de naam van een lid in leden.

import { cache } from 'react';

import { huidigeAuthGebruiker } from '@/lib/sessie';
import { maakSupabase } from '@/lib/supabase/server';

export interface Gebruiker {
  /** Het id van het lid, om de eigen plek en de eigen afmelding te herkennen. */
  lidId: string;
  voornaam: string;
  achternaam: string;
  email: string;
  /** Heeft beheerrechten (is_admin); of die in deze sessie ook gelden, beslist beheerstatus(). */
  isBeheerder: boolean;
  /** Een account dat er alleen is om te beheren (leden.alleen_beheer): hij telt niet mee als lid en heet op Mijn account gewoon "Beheerder". */
  alleenBeheer: boolean;
}

/**
 * De ingelogde gebruiker, of null zonder sessie of zonder lid. Een fout van de database is een fout, geen "niet ingelogd".
 * Eén keer per aanvraag (zie sessie.ts).
 */
export const huidigeGebruiker = cache(async (): Promise<Gebruiker | null> => {
  const user = await huidigeAuthGebruiker();
  if (!user?.email) return null;

  const supabase = await maakSupabase();
  // Een beheerder ziet alle rijen van leden_prive; daarom op het adres van deze gebruiker.
  const { data, error } = await supabase
    .from('leden_prive')
    .select('lid_id, email, is_admin, leden(voornaam, achternaam, alleen_beheer)')
    .eq('email', user.email)
    .maybeSingle();
  if (error) throw new Error(`gebruiker niet te lezen: ${error.code ?? error.message}`);
  if (!data?.leden?.voornaam) return null;
  return {
    lidId: data.lid_id,
    voornaam: data.leden.voornaam,
    achternaam: data.leden.achternaam,
    email: data.email,
    isBeheerder: data.is_admin,
    alleenBeheer: data.leden.alleen_beheer,
  };
});
