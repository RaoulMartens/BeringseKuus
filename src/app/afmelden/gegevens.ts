// Wat de afmeldpagina's lezen. Alles via de rechten van de database: een lid ziet alleen gepubliceerde activiteiten voor zijn
// groepen (R15, R22), alleen bezette plekken (R13) en alleen zijn eigen afmelding. Aan de serverkant, nooit in de browser.

import { isActiviteitStatus, type ActiviteitStatus } from '@/lib/programma';
import type { maakSupabase } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof maakSupabase>>;

export interface AfmeldActiviteit {
  id: string;
  naam: string;
  datum: string;
  verzameltijd: string | null;
  locatie: string | null;
  afmeldDeadline: string | null;
  eindigtOm: string;
  status: ActiviteitStatus;
}

/** De activiteit zoals het afmeldscherm hem nodig heeft; leeg als hij er niet is of het lid hem niet mag zien. */
export async function leesAfmeldActiviteit(supabase: Supabase, id: string): Promise<AfmeldActiviteit | null> {
  const { data, error } = await supabase
    .from('mijn_activiteiten')
    .select('id, naam, datum, verzameltijd, locatie, afmeld_deadline, eindigt_om, status')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`activiteit niet te lezen: ${error.code ?? error.message}`);
  if (!data?.id || !data.naam || !data.datum || !data.eindigt_om || !isActiviteitStatus(data.status))
    return null;
  return {
    id: data.id,
    naam: data.naam,
    datum: data.datum,
    verzameltijd: data.verzameltijd,
    locatie: data.locatie,
    afmeldDeadline: data.afmeld_deadline,
    eindigtOm: data.eindigt_om,
    status: data.status,
  };
}

/** De rollen waarin dit lid bij de activiteit staat ("werker", "bob"); leeg als hij geen dienst heeft. */
export async function leesEigenRollen(
  supabase: Supabase,
  activiteitId: string,
  lidId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('rol_slots')
    .select('rol_type')
    .eq('activiteit_id', activiteitId)
    .eq('bezetter_id', lidId);
  if (error) throw new Error(`eigen plekken niet te lezen: ${error.code ?? error.message}`);
  return data.map((rij) => rij.rol_type);
}

/** De eigen afmelding bij de activiteit, of niets als het lid op aanwezig staat. Een beheerder leest alle afmeldingen: daarom met het lid-id. */
export async function leesEigenAfmelding(
  supabase: Supabase,
  activiteitId: string,
  lidId: string,
): Promise<{ toelichting: string | null; aangemaakt: string } | null> {
  const { data, error } = await supabase
    .from('afmeldingen')
    .select('toelichting, aangemaakt')
    .eq('activiteit_id', activiteitId)
    .eq('lid_id', lidId)
    .maybeSingle();
  if (error) throw new Error(`afmelding niet te lezen: ${error.code ?? error.message}`);
  return data;
}
