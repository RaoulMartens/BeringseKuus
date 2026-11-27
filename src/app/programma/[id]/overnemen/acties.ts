'use server';

// Een dienst overnemen (bestuur): de knop op de bevestigingspagina komt hier uit. De database beslist (dienst_overnemen); dit zet de uitkomst om in een
// melding of de terugkeer naar het activiteitscherm.

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { huidigeGebruiker } from '@/lib/gebruiker';
import { vertaalOvernemenfout } from '@/lib/overnemen';
import { huidigeAuthGebruiker } from '@/lib/sessie';
import { maakSupabase } from '@/lib/supabase/server';

export interface OvernemenStaat {
  melding: string | null;
}

const FORMULIER = z.object({ activiteit_id: z.uuid(), lid_id: z.uuid(), rol: z.string().min(1).max(40) });

export async function neemDienstOver(_vorige: OvernemenStaat, formulier: FormData): Promise<OvernemenStaat> {
  if (!(await huidigeAuthGebruiker())) redirect('/inloggen');
  if (!(await huidigeGebruiker())) redirect('/mijn');
  const invoer = FORMULIER.safeParse({
    activiteit_id: formulier.get('activiteit_id'),
    lid_id: formulier.get('lid_id'),
    rol: formulier.get('rol'),
  });
  if (!invoer.success) return { melding: vertaalOvernemenfout('') };

  const { data, error } = await (
    await maakSupabase()
  ).rpc('dienst_overnemen', {
    p_activiteit_id: invoer.data.activiteit_id,
    p_lid_id: invoer.data.lid_id,
    p_rol: invoer.data.rol,
  });
  if (error) {
    console.error(`dienst niet overgenomen: ${error.code ?? error.message}`);
    if (error.code !== 'BK001') return { melding: vertaalOvernemenfout('') };
    if (error.message === 'geen_admin') redirect('/');
    let reden: string | undefined;
    try {
      const detail = error.details ? (JSON.parse(error.details) as { reden?: string }) : undefined;
      reden = detail?.reden;
    } catch {
      reden = undefined;
    }
    return { melding: vertaalOvernemenfout(error.message, reden) };
  }
  const rol = z.object({ rol: z.string() }).safeParse(data);
  redirect(
    `/programma/${invoer.data.activiteit_id}?overgenomen=${encodeURIComponent(rol.success ? rol.data.rol : invoer.data.rol)}`,
  );
}
