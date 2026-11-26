// Wat de schermen van "Leden" uit de database lezen. Alleen een beheerder met een recente code krijgt antwoord: de functies weigeren de rest
// (geen_admin).

import { leesLeden, leesLid, type LidBeheerGegevens, type Lidregel } from '@/lib/leden';
import type { maakSupabase } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof maakSupabase>>;

/** Alle leden (actief en inactief), met hun groepen en of ze al zijn ingelogd. */
export async function leesLedenlijst(supabase: Supabase): Promise<Lidregel[]> {
  const { data, error } = await supabase.rpc('leden_beheer_lijst');
  if (error) throw new Error(`leden niet te lezen: ${error.code ?? error.message}`);
  return leesLeden(data);
}

/** Eén lid met telefoon, groepen, aanmerkingen en komende diensten; null als het lid er niet is (of geen lid om te beheren). */
export async function leesLidBeheer(supabase: Supabase, lidId: string): Promise<LidBeheerGegevens | null> {
  const { data, error } = await supabase.rpc('lid_beheer_lezen', { p_lid_id: lidId });
  if (error) {
    if (error.code === 'BK001' && error.message === 'lid_onbekend') return null;
    throw new Error(`lid niet te lezen: ${error.code ?? error.message}`);
  }
  return leesLid(data);
}
