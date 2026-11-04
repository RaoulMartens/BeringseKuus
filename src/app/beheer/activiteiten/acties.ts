'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import {
  leesDetail,
  leesFormulier,
  leesOpslagDoel,
  leesWaarden,
  vertaalOpslagfout,
  type Waarden,
} from '@/lib/activiteitformulier';
import { eisBeheer } from '@/lib/beheer';
import { vertaalPubliceerfout } from '@/lib/publiceren';
import { vertaalVerwijderfout } from '@/lib/verwijderen';
import { maakSupabase } from '@/lib/supabase/server';

export interface FormulierStaat {
  /** Bij het veld; de sleutel is de veldnaam, of "groepen" of "plekken". */
  fouten: Record<string, string>;
  /** Bovenaan het formulier, voor wat niet bij één veld hoort. */
  melding: string | null;
  /** Wat er was ingevuld, terug in het formulier na een fout. */
  waarden: Waarden | null;
  /** Een nieuw kenmerk bij elk antwoord: het formulier zet de onderdelen met eigen toestand er dan opnieuw mee neer. */
  kenmerk: string;
}

/** Een antwoord voor het formulier, met een nieuw kenmerk. */
function antwoord(
  fouten: Record<string, string>,
  melding: string | null,
  waarden: Waarden | null,
): FormulierStaat {
  return { fouten, melding, waarden, kenmerk: crypto.randomUUID() };
}

const ID = z.uuid();
const VERSIE = z.coerce.number().int().min(1).max(2_000_000_000);

/**
 * Slaat een activiteit op als concept (aanmaken of wijzigen): alle velden en plekken in één aanroep van
 * public.activiteit_opslaan, dus allemaal of niets (BG 4.4). Alleen voor een beheerder met een code: eisBeheer() eerst, en
 * de database weigert daarna nog een keer (geen_admin). Bij een fout blijft de beheerder op het formulier, met wat hij had
 * ingevuld; na het opslaan gaat hij naar het overzicht met een melding.
 */
export async function slaActiviteitOp(_vorige: FormulierStaat, formulier: FormData): Promise<FormulierStaat> {
  await eisBeheer();
  const waarden = leesWaarden(formulier);

  // Nieuw of bewerken staat er uitdrukkelijk in: een bewerking zonder id of versie wordt nooit een nieuw concept (CR-06).
  const doel = leesOpslagDoel(formulier);
  if (doel.soort === 'fout') {
    const code =
      doel.reden === 'versie' ? 'versie_verouderd' : doel.reden === 'id' ? 'activiteit_onbekend' : '';
    return antwoord({}, vertaalOpslagfout(code, {}).melding, waarden);
  }

  const uitkomst = leesFormulier(formulier);
  if (!uitkomst.ok) {
    return antwoord(uitkomst.fouten, null, waarden);
  }

  const supabase = await maakSupabase();
  const { data, error } = await supabase.rpc('activiteit_opslaan', {
    p_activiteit_id: doel.soort === 'bewerken' ? doel.id : undefined,
    p_velden: { ...uitkomst.velden },
    p_wijzigingen: uitkomst.wijzigingen.map((wijziging) => ({ ...wijziging })),
    p_publiceren: false,
    p_verwachte_versie: doel.soort === 'bewerken' ? doel.versie : undefined,
  });

  if (error) {
    // De foutcode is een van onze eigen codes (SQLSTATE BK001); alleen de soort komt in het log, geen invoer.
    console.error(`activiteit niet opgeslagen: ${error.code ?? error.message}`);
    if (error.code !== 'BK001') {
      return antwoord({}, vertaalOpslagfout('', {}).melding, waarden);
    }
    // Is de beheerder tussentijds geen beheerder meer (de code is verlopen), dan naar het scherm dat daarbij hoort.
    if (error.message === 'geen_admin') redirect('/beheer');
    const tekst = vertaalOpslagfout(error.message, leesDetail(error.details));
    return antwoord(tekst.fouten, tekst.melding, waarden);
  }

  const opgeslagen = z.object({ activiteit_id: ID }).safeParse(data);
  if (!opgeslagen.success) {
    console.error('activiteit opgeslagen, maar het antwoord had geen id');
    redirect('/beheer');
  }
  // Met "Publiceren" is het concept nu bewaard en volgt de bevestiging: publiceren raakt anderen en kan niet terug (BA-3).
  if (formulier.get('actie') === 'publiceren') {
    redirect(`/beheer/activiteiten/${opgeslagen.data.activiteit_id}/publiceren`);
  }
  redirect(`/beheer?opgeslagen=${opgeslagen.data.activiteit_id}`);
}

export interface PubliceerStaat {
  melding: string | null;
}

/**
 * Publiceert een concept na de bevestiging: dezelfde databasefunctie als het opslaan, met niets te wijzigen en
 * publiceren aan, zodat de controles van R21 (eindtijd, eindverantwoordelijke met telefoonnummer) op één plek staan.
 * Faalt iets, dan blijft de beheerder op de bevestigingspagina met de reden.
 */
export async function publiceerActiviteit(
  _vorige: PubliceerStaat,
  formulier: FormData,
): Promise<PubliceerStaat> {
  await eisBeheer();
  const id = ID.safeParse(formulier.get('activiteit_id'));
  if (!id.success) return { melding: vertaalPubliceerfout('activiteit_onbekend', {}) };
  const versie = VERSIE.safeParse(formulier.get('versie'));
  if (!versie.success) return { melding: vertaalPubliceerfout('versie_verouderd', {}) };

  const supabase = await maakSupabase();
  const { error } = await supabase.rpc('activiteit_opslaan', {
    p_activiteit_id: id.data,
    p_velden: {},
    p_wijzigingen: [],
    p_publiceren: true,
    p_verwachte_versie: versie.data,
  });

  if (error) {
    console.error(`activiteit niet gepubliceerd: ${error.code ?? error.message}`);
    if (error.code !== 'BK001') return { melding: vertaalPubliceerfout('', {}) };
    if (error.message === 'geen_admin') redirect('/beheer');
    return { melding: vertaalPubliceerfout(error.message, leesDetail(error.details)) };
  }
  redirect(`/beheer?gepubliceerd=${id.data}`);
}

/**
 * Verwijdert een concept na de bevestiging (public.concept_verwijderen): de plekken en de doelgroep gaan mee, en er gaat geen
 * bericht uit (R18). Een gepubliceerde activiteit weigert de database (alleen_concept). Bij een fout blijft de beheerder op de
 * bevestigingspagina met de reden.
 */
export async function verwijderConcept(
  _vorige: PubliceerStaat,
  formulier: FormData,
): Promise<PubliceerStaat> {
  await eisBeheer();
  const id = ID.safeParse(formulier.get('activiteit_id'));
  if (!id.success) return { melding: vertaalVerwijderfout('activiteit_onbekend') };

  const supabase = await maakSupabase();
  const { error } = await supabase.rpc('concept_verwijderen', { p_activiteit_id: id.data });

  if (error) {
    console.error(`concept niet verwijderd: ${error.code ?? error.message}`);
    if (error.code !== 'BK001') return { melding: vertaalVerwijderfout('') };
    if (error.message === 'geen_admin') redirect('/beheer');
    return { melding: vertaalVerwijderfout(error.message) };
  }
  redirect(`/beheer?verwijderd=${id.data}`);
}
