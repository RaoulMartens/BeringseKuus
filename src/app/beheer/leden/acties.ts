'use server';

// De handelingen van "Leden" (UC-013): gegevens opslaan, op inactief zetten en weer actief maken. Op inactief zetten en weer actief maken
// zijn elk een eigen bevestigingspagina met een formulier dat hier uitkomt. De regels en de controles staan in de database (lid_opslaan,
// lid_inactief_zetten, lid_actief_zetten); de actie vertaalt een fout naar tekst voor de pagina. Slaagt het, dan gaat de beheerder naar het
// overzicht met het lid in de adresbalk (het id, geen naam: wat er op het scherm staat komt uit de database).

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { eisBeheer } from '@/lib/beheer';
import { vertaalLedenfout, type Ledenfout } from '@/lib/leden';
import { maakSupabase } from '@/lib/supabase/server';

export interface LedenStaat {
  melding: string | null;
  /** Bij dienst_blokkeert: de activiteiten waar het lid een plek heeft. */
  activiteiten?: Ledenfout['activiteiten'];
}

const ID = z.uuid();

interface Databasefout {
  code?: string;
  message: string;
  details?: string | null;
}

/** Eén gedeelde afhandeling: geen_admin stuurt terug naar beheer, een andere fout blijft op de pagina met de reden. */
function naFout(logtekst: string, fout: Databasefout): LedenStaat {
  console.error(`${logtekst}: ${fout.code ?? fout.message}`);
  if (fout.code !== 'BK001') return { melding: vertaalLedenfout('').tekst };
  if (fout.message === 'geen_admin') redirect('/beheer');
  let detail: unknown;
  try {
    detail = fout.details ? JSON.parse(fout.details) : undefined;
  } catch {
    detail = undefined;
  }
  const vertaald = vertaalLedenfout(fout.message, detail);
  return { melding: vertaald.tekst, activiteiten: vertaald.activiteiten };
}

export async function slaLidOp(_vorige: LedenStaat, formulier: FormData): Promise<LedenStaat> {
  await eisBeheer();
  const lid = ID.safeParse(formulier.get('lid_id'));
  if (!lid.success) return { melding: vertaalLedenfout('lid_onbekend').tekst };
  const groepen = z.array(z.uuid()).safeParse(formulier.getAll('groep'));
  if (!groepen.success) return { melding: vertaalLedenfout('groep_onbekend').tekst };
  const telefoon = formulier.get('telefoon');
  const aanmerkingen = formulier.getAll('aanmerking');

  const supabase = await maakSupabase();
  const { error } = await supabase.rpc('lid_opslaan', {
    p_lid_id: lid.data,
    p_telefoon: typeof telefoon === 'string' ? telefoon : '',
    p_groepen: groepen.data,
    p_mag_bob: aanmerkingen.includes('bob'),
    p_mag_eindverantw: aanmerkingen.includes('eindverantwoordelijke'),
  });
  if (error) return naFout('lid niet opgeslagen', error);
  redirect(`/beheer/leden?opgeslagen=${lid.data}`);
}

export async function zetLidInactief(_vorige: LedenStaat, formulier: FormData): Promise<LedenStaat> {
  await eisBeheer();
  const lid = ID.safeParse(formulier.get('lid_id'));
  if (!lid.success) return { melding: vertaalLedenfout('lid_onbekend').tekst };

  const supabase = await maakSupabase();
  const { data, error } = await supabase.rpc('lid_inactief_zetten', { p_lid_id: lid.data });
  if (error) return naFout('lid niet op inactief gezet', error);
  const open = z.object({ plekken_open: z.number() }).safeParse(data);
  redirect(`/beheer/leden?inactief=${lid.data}&open=${open.success ? open.data.plekken_open : 0}`);
}

export async function zetLidActief(_vorige: LedenStaat, formulier: FormData): Promise<LedenStaat> {
  await eisBeheer();
  const lid = ID.safeParse(formulier.get('lid_id'));
  if (!lid.success) return { melding: vertaalLedenfout('lid_onbekend').tekst };

  const supabase = await maakSupabase();
  const { error } = await supabase.rpc('lid_actief_zetten', { p_lid_id: lid.data });
  if (error) return naFout('lid niet weer actief gezet', error);
  redirect(`/beheer/leden?actief=${lid.data}`);
}
