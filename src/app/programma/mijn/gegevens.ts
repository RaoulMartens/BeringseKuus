// Wat Mijn diensten leest. Alles via de rechten van de database: de view mijn_diensten geeft alleen de eigen plekken van activiteiten
// die het lid als lid mag zien (R13, R15, R22), ook voor een beheerder. Aan de serverkant, nooit in de browser.

import type { AfgemeldRij, DienstRij } from '@/lib/mijndiensten';
import type { maakSupabase } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof maakSupabase>>;

/** De eigen plekken, komend en geweest; met een seizoen alleen die van dat seizoen. */
export async function leesDiensten(supabase: Supabase, seizoen?: number): Promise<DienstRij[]> {
  const aanvraag = supabase
    .from('mijn_diensten')
    .select('activiteit_id, rol_type, naam, datum, starttijd, locatie, eindigt_om');
  const { data, error } = await (seizoen === undefined ? aanvraag : aanvraag.eq('seizoen', seizoen));
  if (error) throw new Error(`diensten niet te lezen: ${error.code ?? error.message}`);
  return data.flatMap((rij) =>
    rij.activiteit_id && rij.rol_type && rij.naam && rij.datum && rij.eindigt_om
      ? [
          {
            activiteitId: rij.activiteit_id,
            naam: rij.naam,
            datum: rij.datum,
            starttijd: rij.starttijd,
            locatie: rij.locatie,
            rol: rij.rol_type,
            eindigtOm: rij.eindigt_om,
          },
        ]
      : [],
  );
}

/**
 * De komende activiteiten waarvoor dit lid is afgemeld. Een beheerder leest alle afmeldingen: daarom met het eigen lid-id. De activiteit
 * komt uit mijn_activiteiten, dus alleen wat het lid mag zien en wat nog niet is geweest (R9: intrekken kan zolang hij niet is geweest).
 */
export async function leesAfmeldingen(
  supabase: Supabase,
  lidId: string,
  nu: Date,
  seizoen?: number,
): Promise<AfgemeldRij[]> {
  const { data: afmeldingen, error } = await supabase
    .from('afmeldingen')
    .select('activiteit_id')
    .eq('lid_id', lidId);
  if (error) throw new Error(`afmeldingen niet te lezen: ${error.code ?? error.message}`);
  const ids = afmeldingen.map((rij) => rij.activiteit_id);
  if (ids.length === 0) return [];

  const aanvraag = supabase
    .from('mijn_activiteiten')
    .select('id, naam, datum, starttijd, locatie')
    .in('id', ids)
    .eq('status', 'gepubliceerd')
    .gt('eindigt_om', nu.toISOString());
  const { data, error: activiteitFout } = await (seizoen === undefined
    ? aanvraag
    : aanvraag.eq('seizoen', seizoen));
  if (activiteitFout)
    throw new Error(`activiteiten niet te lezen: ${activiteitFout.code ?? activiteitFout.message}`);
  return data.flatMap((rij) =>
    rij.id && rij.naam && rij.datum
      ? [
          {
            activiteitId: rij.id,
            naam: rij.naam,
            datum: rij.datum,
            starttijd: rij.starttijd,
            locatie: rij.locatie,
          },
        ]
      : [],
  );
}
