'use server';

// De serveractie van het overdragen (UC-002): controleert de invoer met Zod en roept ruil_dienst aan. De database beslist (R4, R5,
// R6, R14, R15, R17, R22); dit zet de uitkomst om in een pagina of een melding. Het slot zoekt de server zelf op bij de
// activiteit (de dienst van dit lid), niet uit het formulier: een lid draagt alleen zijn eigen dienst over.

import { redirect } from 'next/navigation';
import { z } from 'zod';

import type { AfmeldStaat } from '@/lib/afmelden';
import { huidigeGebruiker } from '@/lib/gebruiker';
import { geluktHref, nietGeluktHref, stap2Href, vertaalRuilfout } from '@/lib/ruilen';
import { huidigeAuthGebruiker } from '@/lib/sessie';
import { maakSupabase } from '@/lib/supabase/server';

import { leesDienstVan } from './gegevens';

const FORMULIER = z.object({
  activiteit_id: z.uuid(),
  vervanger_id: z.uuid(),
  // De rol zoals de bevestigingspagina hem toonde: is de dienst intussen een andere geworden, dan gaat er niets weg (B1).
  rol: z.string().min(1).max(40),
  taak: z.literal('afmelden').optional(),
});

/** Een lid draagt zijn dienst over aan een vervanger. Hoort het bij afmelden, dan loopt hij daarna door naar stap 2. */
export async function ruilDienst(_vorige: AfmeldStaat, formulier: FormData): Promise<AfmeldStaat> {
  if (!(await huidigeAuthGebruiker())) redirect('/inloggen');
  const invoer = FORMULIER.safeParse({
    activiteit_id: formulier.get('activiteit_id'),
    vervanger_id: formulier.get('vervanger_id'),
    rol: formulier.get('rol'),
    taak: formulier.get('taak') || undefined,
  });
  if (!invoer.success)
    return { melding: 'Deze overdracht kan niet worden uitgevoerd. Ga terug en kies opnieuw.' };
  const { activiteit_id: activiteitId, vervanger_id: vervangerId } = invoer.data;
  const taak = invoer.data.taak ?? null;

  const gebruiker = await huidigeGebruiker();
  if (!gebruiker) redirect('/mijn');
  const supabase = await maakSupabase();
  const dienst = await leesDienstVan(supabase, activiteitId, gebruiker.lidId);
  // Geen dienst meer, of een andere dan op de bevestigingspagina stond (het bestuur deelde het lid intussen anders in): niets
  // overdragen, en terug naar Start met de actuele bezetting (UC-002 AF-6). Een overdracht kan niet worden teruggedraaid.
  if (!dienst || dienst.rol !== invoer.data.rol) return redirect('/');

  const { error } = await supabase.rpc('ruil_dienst', {
    p_rol_slot_id: dienst.slotId,
    p_vervanger_id: vervangerId,
  });
  if (!error)
    return redirect(taak ? stap2Href(activiteitId, vervangerId) : geluktHref(activiteitId, vervangerId));

  console.error(
    `dienst niet overgedragen: ${error.code === 'BK001' ? error.message : (error.code ?? error.message)}`,
  );
  const uitkomst =
    error.code === 'BK001' ? vertaalRuilfout(error.message, error.details) : vertaalRuilfout('', '{}');
  switch (uitkomst.soort) {
    case 'melding':
      return { melding: uitkomst.tekst };
    case 'inloggen':
      return redirect('/mijn');
    case 'start':
      return redirect('/');
    case 'niet-gelukt':
      return redirect(nietGeluktHref(activiteitId, uitkomst.reden, vervangerId, taak));
  }
}
