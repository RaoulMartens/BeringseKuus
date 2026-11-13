'use server';

// Meerdere activiteiten tegelijk aanmaken (UC-006): de knop "N concepten aanmaken" op het controlescherm komt hier uit. De regels
// komen uit de browser (het Excel-bestand blijft daar); de database controleert ze opnieuw en maakt ze in één transactie aan
// (activiteiten_bulk_aanmaken): alles of niets, en twee keer klikken geeft nooit dubbele activiteiten. Bij een fout blijft de
// beheerder op het controlescherm met de melding, en de lijst staat er nog.

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { vertaalBulkfout } from '@/lib/activiteitenimport';
import { eisBeheer } from '@/lib/beheer';
import type { Json } from '@/lib/supabase/database.types';
import { maakSupabase } from '@/lib/supabase/server';

export interface ConceptenStaat {
  melding: string | null;
}

// De vorm van wat uit de browser komt. Wat de inhoud betekent, beslist de database; dit is alleen een slot tegen rommel en een grens
// op de grootte (200 regels, korte velden).
const REGEL = z
  .object({
    naam: z.string().max(200),
    datum: z.string().max(10),
    starttijd: z.string().max(8),
    locatie: z.string().max(200),
    verzameltijd: z.string().max(8).optional(),
    eindtijd: z.string().max(8).optional(),
    bus_vertrektijd: z.string().max(8).optional(),
    notitie: z.string().max(2000).optional(),
    groepen: z.array(z.uuid()).max(10).optional(),
  })
  .strict();

const INVOER = z.object({
  aanmaak_id: z.uuid(),
  regels: z.array(REGEL).min(1).max(200),
  nummers: z.array(z.number().int().min(1)).max(200),
});

/** JSON uit een formulierveld, als onbekend type: wat erin zit, beslist de controle hieronder. */
function leesJson(waarde: FormDataEntryValue | null): unknown {
  return JSON.parse(String(waarde));
}

/** Het regelnummer uit het detail van een fout van de database: {"regel": 3, ...}, vanaf 0. */
function leesRegelnummer(details: string | null | undefined): number | null {
  if (!details) return null;
  try {
    const detail: unknown = JSON.parse(details);
    if (
      typeof detail === 'object' &&
      detail !== null &&
      'regel' in detail &&
      typeof detail.regel === 'number'
    ) {
      return detail.regel;
    }
  } catch {
    return null;
  }
  return null;
}

export async function maakConcepten(_vorige: ConceptenStaat, formulier: FormData): Promise<ConceptenStaat> {
  await eisBeheer();

  let ruw: unknown;
  try {
    ruw = {
      aanmaak_id: formulier.get('aanmaak_id'),
      regels: leesJson(formulier.get('regels')),
      nummers: leesJson(formulier.get('nummers')),
    };
  } catch {
    return { melding: vertaalBulkfout('veld_ongeldig', null) };
  }
  const invoer = INVOER.safeParse(ruw);
  if (!invoer.success || invoer.data.nummers.length !== invoer.data.regels.length) {
    return { melding: vertaalBulkfout('veld_ongeldig', null) };
  }

  const supabase = await maakSupabase();
  const { data, error } = await supabase.rpc('activiteiten_bulk_aanmaken', {
    p_aanmaak_id: invoer.data.aanmaak_id,
    p_regels: invoer.data.regels as unknown as Json,
  });

  if (error) {
    // Alleen de soort fout in het log, nooit de regels (die kunnen namen of notities bevatten).
    console.error(`concepten niet aangemaakt: ${error.code ?? error.message}`);
    if (error.code !== 'BK001') return { melding: vertaalBulkfout('', null) };
    if (error.message === 'geen_admin') redirect('/beheer');
    const index = leesRegelnummer(error.details);
    return {
      melding: vertaalBulkfout(error.message, index === null ? null : (invoer.data.nummers[index] ?? null)),
    };
  }

  const aantal =
    typeof data === 'object' && data !== null && 'aantal' in data && typeof data.aantal === 'number'
      ? data.aantal
      : invoer.data.regels.length;
  redirect(`/beheer?aangemaakt=${aantal}`);
}
