'use server';

// De handelingen van "Beheerders" (ronde 19): beheerder maken, toegang bevestigen en beheerrechten intrekken. Elke handeling
// is een eigen bevestigingspagina met een formulier dat hier uitkomt. De regels en de controles staan in de database
// (beheerder_maken, beheerder_bevestigen, beheerder_intrekken); de actie vertaalt een fout naar tekst voor de pagina.
// Slaagt het, dan gaat de beheerder naar het overzicht met het lid in de adresbalk (het id, geen naam: wat er op het scherm
// staat komt uit de database).

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { eisBeheer } from '@/lib/beheer';
import { vertaalBeheerderfout, type BeheerderHandeling } from '@/lib/beheerders';
import { maakSupabase } from '@/lib/supabase/server';

export interface BeheerderStaat {
  melding: string | null;
}

const ID = z.uuid();

/** Eén gedeelde afhandeling: geen_admin stuurt terug naar beheer, een andere fout blijft op de pagina met de reden. */
function naFout(logtekst: string, code: string, bericht: string): BeheerderStaat {
  console.error(`${logtekst}: ${code}`);
  return { melding: vertaalBeheerderfout(bericht) };
}

export async function maakBeheerder(_vorige: BeheerderStaat, formulier: FormData): Promise<BeheerderStaat> {
  await eisBeheer();
  const lid = ID.safeParse(formulier.get('lid_id'));
  if (!lid.success) return { melding: vertaalBeheerderfout('lid_onbekend') };

  const supabase = await maakSupabase();
  const { error } = await supabase.rpc('beheerder_maken', { p_lid_id: lid.data });
  if (error) {
    if (error.code !== 'BK001') return naFout('beheerder niet gemaakt', error.code ?? error.message, '');
    if (error.message === 'geen_admin') redirect('/beheer');
    return naFout('beheerder niet gemaakt', error.message, error.message);
  }
  redirect(overzicht('toegevoegd', lid.data));
}

export async function bevestigBeheerder(
  _vorige: BeheerderStaat,
  formulier: FormData,
): Promise<BeheerderStaat> {
  await eisBeheer();
  const lid = ID.safeParse(formulier.get('lid_id'));
  const app = ID.safeParse(formulier.get('app_id'));
  if (!lid.success || !app.success) return { melding: vertaalBeheerderfout('lid_onbekend') };

  const supabase = await maakSupabase();
  const { error } = await supabase.rpc('beheerder_bevestigen', { p_lid_id: lid.data, p_app_id: app.data });
  if (error) {
    if (error.code !== 'BK001') return naFout('toegang niet bevestigd', error.code ?? error.message, '');
    if (error.message === 'geen_admin') redirect('/beheer');
    return naFout('toegang niet bevestigd', error.message, error.message);
  }
  redirect(overzicht('bevestigd', lid.data));
}

export async function trekBeheerderIn(_vorige: BeheerderStaat, formulier: FormData): Promise<BeheerderStaat> {
  await eisBeheer();
  const lid = ID.safeParse(formulier.get('lid_id'));
  if (!lid.success) return { melding: vertaalBeheerderfout('lid_onbekend') };

  const supabase = await maakSupabase();
  const { error } = await supabase.rpc('beheerder_intrekken', { p_lid_id: lid.data });
  if (error) {
    if (error.code !== 'BK001')
      return naFout('beheerrechten niet ingetrokken', error.code ?? error.message, '');
    if (error.message === 'geen_admin') redirect('/beheer');
    return naFout('beheerrechten niet ingetrokken', error.message, error.message);
  }
  redirect(overzicht('ingetrokken', lid.data));
}

function overzicht(handeling: BeheerderHandeling, lidId: string): string {
  return `/beheer/beheerders?${handeling}=${lidId}`;
}
