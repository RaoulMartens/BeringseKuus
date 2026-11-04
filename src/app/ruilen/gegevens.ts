// Wat de pagina's van het overdragen lezen. Alles via de rechten van de database: een lid ziet alleen gepubliceerde activiteiten
// voor zijn groepen (R15, R22) en alleen bezette plekken (R13). Aan de serverkant, nooit in de browser.

import type { Vervanger } from '@/components/vervangerkeuze/vervangerkeuze';
import type { maakSupabase } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof maakSupabase>>;

export interface Dienst {
  slotId: string;
  rol: string;
}

/** De dienst van dit lid bij de activiteit, of niets. Een lid heeft hooguit één plek per activiteit (geen dubbelboeking, R6). */
export async function leesDienstVan(
  supabase: Supabase,
  activiteitId: string,
  lidId: string,
): Promise<Dienst | null> {
  const { data, error } = await supabase
    .from('rol_slots')
    .select('id, rol_type')
    .eq('activiteit_id', activiteitId)
    .eq('bezetter_id', lidId)
    .maybeSingle();
  if (error) throw new Error(`dienst niet te lezen: ${error.code ?? error.message}`);
  return data ? { slotId: data.id, rol: data.rol_type } : null;
}

/**
 * Wie kan overnemen, en zo niet waarom (beschikbare_vervangers). Voorlichting, geen afdwinging: de database toetst alles bij het
 * bevestigen. Alleen voor wie zelf een ruilbare dienst heeft bij deze activiteit; anders is de lijst leeg.
 */
export async function leesVervangers(supabase: Supabase, activiteitId: string): Promise<Vervanger[]> {
  const { data, error } = await supabase.rpc('beschikbare_vervangers', { p_activiteit_id: activiteitId });
  if (error) throw new Error(`vervangers niet te lezen: ${error.code ?? error.message}`);
  return data.map((rij) => ({
    id: rij.lid_id,
    naam: `${rij.voornaam} ${rij.achternaam}`,
    beschikbaar: rij.beschikbaar,
    // De database geeft null als iemand beschikbaar is; de typen kennen dat niet.
    reden: (rij.reden as string | null) ?? null,
  }));
}

/** De naam van een lid, zoals een lid die mag lezen (voornaam en achternaam); niets als het lid er niet is. */
export async function leesLidNaam(supabase: Supabase, lidId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('leden')
    .select('voornaam, achternaam')
    .eq('id', lidId)
    .maybeSingle();
  if (error) throw new Error(`lid niet te lezen: ${error.code ?? error.message}`);
  return data ? `${data.voornaam} ${data.achternaam}` : null;
}

/** De eindverantwoordelijke met nummer (R10), de enige route naar het nummer van een ander lid; niets als het niet kan. */
export async function leesContact(
  supabase: Supabase,
  activiteitId: string,
): Promise<{ naam: string; telefoon: string } | null> {
  const { data, error } = await supabase.rpc('contact_eindverantwoordelijke', { p_activiteit: activiteitId });
  if (error) throw new Error(`contact niet te lezen: ${error.code ?? error.message}`);
  const regel = data[0];
  return regel?.telefoon ? { naam: `${regel.voornaam} ${regel.achternaam}`, telefoon: regel.telefoon } : null;
}
