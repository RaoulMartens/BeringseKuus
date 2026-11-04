'use server';

// De serveracties van afmelden en je afmelding intrekken (UC-003): ze controleren de invoer met Zod en roepen meld_af en
// trek_afmelding_in aan. De database beslist (R7, R8, R9, R15); dit zet de uitkomst om in een pagina of een melding. Bij succes
// stuurt de server door naar een eigen pagina, bij een fout blijft het lid waar hij is, met de reden erboven.

import { redirect } from 'next/navigation';
import { z } from 'zod';

import {
  afgemeldHref,
  ingetrokkenHref,
  ondergrensQuery,
  vertaalAfmeldfout,
  vertaalIntrekfout,
  type AfmeldStaat,
} from '@/lib/afmelden';
import { huidigeAuthGebruiker } from '@/lib/sessie';
import { maakSupabase } from '@/lib/supabase/server';

const ID = z.uuid();
// De database kapt op 500 tekens af; hier alleen een grens tegen onzin, zodat er geen enorme tekst naar de database gaat.
const TOELICHTING = z.string().max(5000);

const ONBEKEND = vertaalAfmeldfout('activiteit_niet_open', '{}');

/** Een lid meldt zich af, met een toelichting die alleen het bestuur leest. */
export async function meldAf(_vorige: AfmeldStaat, formulier: FormData): Promise<AfmeldStaat> {
  if (!(await huidigeAuthGebruiker())) redirect('/inloggen');
  const id = ID.safeParse(formulier.get('activiteit_id'));
  if (!id.success) return { melding: ONBEKEND.soort === 'melding' ? ONBEKEND.tekst : null };
  const toelichting = TOELICHTING.safeParse(formulier.get('toelichting') ?? '');
  if (!toelichting.success)
    return { melding: 'De toelichting is te lang. Maak hem korter en probeer het nog eens.' };

  const supabase = await maakSupabase();
  const { error } = await supabase.rpc('meld_af', {
    p_activiteit_id: id.data,
    p_toelichting: toelichting.data,
  });
  if (!error) redirect(afgemeldHref(id.data));

  console.error(`niet afgemeld: ${error.code ?? error.message}`);
  const uitkomst =
    error.code === 'BK001' ? vertaalAfmeldfout(error.message, error.details) : vertaalAfmeldfout('', '{}');
  switch (uitkomst.soort) {
    case 'melding':
      return { melding: uitkomst.tekst };
    case 'inloggen':
      return redirect('/mijn');
    case 'afgemeld':
      return redirect(afgemeldHref(id.data));
    case 'ondergrens':
      return redirect(
        `/afmelden/${id.data}/kan-niet${uitkomst.ondergrens ? `?${ondergrensQuery(uitkomst.ondergrens)}` : ''}`,
      );
  }
}

/** Een lid trekt zijn afmelding in (R9): hij staat daarna weer op aanwezig. Een eerder overgedragen dienst komt niet terug. */
export async function trekAfmeldingIn(_vorige: AfmeldStaat, formulier: FormData): Promise<AfmeldStaat> {
  if (!(await huidigeAuthGebruiker())) redirect('/inloggen');
  const id = ID.safeParse(formulier.get('activiteit_id'));
  if (!id.success) return { melding: 'Deze activiteit bestaat niet meer.' };

  const supabase = await maakSupabase();
  const { error } = await supabase.rpc('trek_afmelding_in', { p_activiteit_id: id.data });
  if (!error) redirect(ingetrokkenHref(id.data));

  console.error(`afmelding niet ingetrokken: ${error.code ?? error.message}`);
  const uitkomst =
    error.code === 'BK001' ? vertaalIntrekfout(error.message, error.details) : vertaalIntrekfout('', '{}');
  switch (uitkomst.soort) {
    case 'melding':
      return { melding: uitkomst.tekst };
    case 'inloggen':
      return redirect('/mijn');
    case 'aanwezig':
      return redirect(ingetrokkenHref(id.data));
  }
}
