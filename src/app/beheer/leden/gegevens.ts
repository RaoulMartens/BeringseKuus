// Wat de schermen van "Leden" uit de database lezen. Alleen een beheerder met een recente code krijgt antwoord: de functies weigeren de rest
// (geen_admin).

import { leesLeden, leesLid, type LidBeheerGegevens, type Lidregel, type Uitnodiging } from '@/lib/leden';
import type { maakSupabase } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof maakSupabase>>;

/** De laatste uitnodiging per lid (wacht, verstuurd of mislukt), op lid-id. */
export async function leesUitnodigingen(supabase: Supabase): Promise<Map<string, Uitnodiging>> {
  const { data, error } = await supabase.rpc('leden_uitnodigingen');
  if (error) throw new Error(`uitnodigingen niet te lezen: ${error.code ?? error.message}`);
  const uit = new Map<string, Uitnodiging>();
  for (const rij of data) {
    if (rij.status === 'wacht' || rij.status === 'verstuurd' || rij.status === 'mislukt') {
      uit.set(rij.lid_id, {
        soort: rij.soort === 'herinnering' ? 'herinnering' : 'uitnodiging',
        status: rij.status,
        verstuurdOp: rij.verstuurd_op,
      });
    }
  }
  return uit;
}

/** Alle leden (actief en inactief), met hun groepen, of ze al zijn ingelogd en hoe het met hun uitnodiging staat. */
export async function leesLedenlijst(supabase: Supabase): Promise<Lidregel[]> {
  const { data, error } = await supabase.rpc('leden_beheer_lijst');
  if (error) throw new Error(`leden niet te lezen: ${error.code ?? error.message}`);
  const uitnodigingen = await leesUitnodigingen(supabase);
  return leesLeden(data).map((lid) => ({ ...lid, uitnodiging: uitnodigingen.get(lid.lidId) ?? null }));
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
