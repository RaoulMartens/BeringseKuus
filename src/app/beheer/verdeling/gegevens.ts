// Wat het verdelingsoverzicht en de keuzelijsten van het formulier lezen (UC-012): de actieve leden en hun plekken bij de activiteiten van
// een seizoen. Alles via de rechten van de database: alleen een beheerder met een code leest alle plekken en leden. Aan de serverkant.

import type { Dienst, VerdelingLid } from '@/lib/verdeling';
import type { maakSupabase } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof maakSupabase>>;

/** Het seizoen van vandaag (public.huidig_seizoen), als beginjaar. */
export async function leesHuidigSeizoen(supabase: Supabase): Promise<number> {
  const { data, error } = await supabase.rpc('huidig_seizoen');
  if (error) throw new Error(`seizoen niet te lezen: ${error.code ?? error.message}`);
  return data;
}

/**
 * De leden die meetellen: actief, type lid, geen beheeraccount (dat telt nergens als lid mee). Een externe helper staat er niet
 * in (BG 9): dit overzicht is voor de leden.
 */
export async function leesVerdelingsleden(supabase: Supabase): Promise<VerdelingLid[]> {
  const { data, error } = await supabase
    .from('leden')
    .select('id, voornaam, achternaam')
    .eq('actief', true)
    .eq('type', 'lid')
    .eq('alleen_beheer', false)
    .order('voornaam')
    .order('achternaam');
  if (error) throw new Error(`leden niet te lezen: ${error.code ?? error.message}`);
  return data;
}

/**
 * De bezette plekken bij concepten en gepubliceerde activiteiten van het seizoen, zonder de bak (geen dienst, R23). Een
 * geannuleerde activiteit telt niet mee (BG 5.4).
 */
export async function leesDiensten(supabase: Supabase, seizoen: number): Promise<Dienst[]> {
  const { data, error } = await supabase
    .from('rol_slots')
    .select('bezetter_id, activiteiten!inner(seizoen, status)')
    .not('bezetter_id', 'is', null)
    .neq('rol_type', 'bak')
    .eq('activiteiten.seizoen', seizoen)
    .in('activiteiten.status', ['concept', 'gepubliceerd'])
    .limit(5000);
  if (error) throw new Error(`diensten niet te lezen: ${error.code ?? error.message}`);
  return data.flatMap((slot): Dienst[] => (slot.bezetter_id ? [{ lidId: slot.bezetter_id }] : []));
}
