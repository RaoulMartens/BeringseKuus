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
  /** Bij email_bestaat: het lid dat dit adres al heeft (voor de link naar dat lid). */
  bestaand?: Ledenfout['bestaand'];
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
  return { melding: vertaald.tekst, activiteiten: vertaald.activiteiten, bestaand: vertaald.bestaand };
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

const TEKST = z.string().max(300);

/** Een nieuw lid toevoegen (UC-013 AF-4): het lid staat meteen in de lijst, de taken-Worker maakt het account en stuurt de uitnodiging. */
export async function voegLidToe(_vorige: LedenStaat, formulier: FormData): Promise<LedenStaat> {
  await eisBeheer();
  const voornaam = TEKST.safeParse(formulier.get('voornaam'));
  const achternaam = TEKST.safeParse(formulier.get('achternaam'));
  const email = TEKST.safeParse(formulier.get('email'));
  const telefoon = TEKST.safeParse(formulier.get('telefoon') ?? '');
  const groepen = z.array(z.uuid()).safeParse(formulier.getAll('groep'));
  if (!voornaam.success || !achternaam.success || !email.success || !telefoon.success) {
    return { melding: vertaalLedenfout('veld_ongeldig').tekst };
  }
  if (!groepen.success) return { melding: vertaalLedenfout('groep_onbekend').tekst };
  const aanmerkingen = formulier.getAll('aanmerking');

  const supabase = await maakSupabase();
  const { data, error } = await supabase.rpc('lid_toevoegen', {
    p_voornaam: voornaam.data,
    p_achternaam: achternaam.data,
    p_email: email.data,
    p_telefoon: telefoon.data,
    p_groepen: groepen.data,
    p_mag_bob: aanmerkingen.includes('bob'),
    p_mag_eindverantw: aanmerkingen.includes('eindverantwoordelijke'),
  });
  if (error) return naFout('lid niet toegevoegd', error);
  const lid = z.object({ lid_id: z.uuid() }).safeParse(data);
  redirect(lid.success ? `/beheer/leden?toegevoegd=${lid.data.lid_id}` : '/beheer/leden');
}

/** De uitnodiging opnieuw sturen aan een lid dat nog nooit is ingelogd (UC-013 AF-5). */
export async function stuurUitnodigingOpnieuw(_vorige: LedenStaat, formulier: FormData): Promise<LedenStaat> {
  await eisBeheer();
  const lid = ID.safeParse(formulier.get('lid_id'));
  if (!lid.success) return { melding: vertaalLedenfout('lid_onbekend').tekst };

  const supabase = await maakSupabase();
  const { error } = await supabase.rpc('lid_uitnodiging_opnieuw', { p_lid_id: lid.data });
  if (error) return naFout('uitnodiging niet opnieuw gestuurd', error);
  redirect(`/beheer/leden?uitgenodigd=${lid.data}`);
}

/** Het e-mailadres van een lid dat nog nooit is ingelogd corrigeren; het lid krijgt een uitnodiging op het nieuwe adres (UC-013 AF-6). */
export async function corrigeerAdres(_vorige: LedenStaat, formulier: FormData): Promise<LedenStaat> {
  await eisBeheer();
  const lid = ID.safeParse(formulier.get('lid_id'));
  if (!lid.success) return { melding: vertaalLedenfout('lid_onbekend').tekst };
  const email = TEKST.safeParse(formulier.get('email'));
  if (!email.success) return { melding: vertaalLedenfout('email_ongeldig').tekst };

  const supabase = await maakSupabase();
  const { error } = await supabase.rpc('lid_adres_corrigeren', { p_lid_id: lid.data, p_email: email.data });
  if (error) return naFout('adres niet gecorrigeerd', error);
  redirect(`/beheer/leden?uitgenodigd=${lid.data}`);
}
