// Wat de schermen van "Beheerders" uit de database lezen. Alleen een beheerder met een recente code krijgt antwoord: de
// functies weigeren de rest (geen_admin).

import { leesBeheerders, volledigeNaam, type Beheerder, type Kandidaat } from '@/lib/beheerders';
import type { maakSupabase } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof maakSupabase>>;

/** Wie beheerder is of het wordt, met hoe het met zijn app staat. */
export async function leesBeheerderslijst(supabase: Supabase): Promise<Beheerder[]> {
  const { data, error } = await supabase.rpc('beheerders_lijst');
  if (error) throw new Error(`beheerders niet te lezen: ${error.code ?? error.message}`);
  return leesBeheerders(data);
}

/** Leden die je beheerder kunt maken: actief, met een inlogaccount, nog geen beheerder. */
export async function leesKandidaten(supabase: Supabase): Promise<Kandidaat[]> {
  const { data, error } = await supabase.rpc('beheerder_kandidaten');
  if (error) throw new Error(`kandidaten niet te lezen: ${error.code ?? error.message}`);
  return data.map((rij) => ({ lidId: rij.lid_id, naam: volledigeNaam(rij.voornaam, rij.achternaam) }));
}

/** De naam van één lid, voor een melding of een bevestigingspagina; null als het lid er niet (meer) is. */
export async function leesLidnaam(supabase: Supabase, lidId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('leden')
    .select('voornaam, achternaam')
    .eq('id', lidId)
    .maybeSingle();
  if (error) throw new Error(`lid niet te lezen: ${error.code ?? error.message}`);
  return data ? volledigeNaam(data.voornaam, data.achternaam) : null;
}
