'use server';

// Alle dagen van een reeks tegelijk bewerken: "Opslaan als concept" en "Alle N dagen publiceren" komen hier uit. De database doet
// het werk (activiteiten_bulk_wijzigen, per dag activiteit_opslaan, in één transactie): dezelfde controles als bij één activiteit, en
// alles of niets. Alleen wat de beheerder werkelijk veranderde, gaat mee. Bij een fout blijft hij op het formulier met wat hij had
// ingevuld en de dag waar het misging; er is dan voor geen enkele dag iets gewijzigd.

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { leesDetail } from '@/lib/activiteitformulier';
import { eisBeheer } from '@/lib/beheer';
import {
  bepaalWijziging,
  isLeeg,
  REEKSVELDEN,
  vertaalReeksfout,
  type ReeksInvoer,
  type ReeksVeld,
  type Startwaarde,
} from '@/lib/reeksbewerken';
import type { Json } from '@/lib/supabase/database.types';
import { maakSupabase } from '@/lib/supabase/server';

export interface ReeksStaat {
  melding: string | null;
  fouten: Partial<Record<ReeksVeld, string>>;
  /** Wat er was ingevuld, terug in het formulier na een fout. */
  waarden: ReeksInvoer | null;
  /** Een nieuw kenmerk bij elk antwoord: het formulier zet zijn velden er dan opnieuw mee neer. */
  kenmerk: string;
}

const DAGEN = z
  .array(
    z.object({
      id: z.uuid(),
      versie: z.number().int().min(1),
      datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  )
  .min(1)
  .max(50);

const STARTWAARDE = z.object({ waarde: z.string().max(2000), verschilt: z.boolean() });

function antwoord(
  melding: string | null,
  fouten: ReeksStaat['fouten'] = {},
  waarden: ReeksInvoer | null = null,
): ReeksStaat {
  return { melding, fouten, waarden, kenmerk: crypto.randomUUID() };
}

/** JSON uit een formulierveld, als onbekend type: wat erin zit, beslist de controle hieronder. */
function leesJson(waarde: FormDataEntryValue | null): unknown {
  return JSON.parse(String(waarde));
}

export async function wijzigReeks(_vorige: ReeksStaat, formulier: FormData): Promise<ReeksStaat> {
  await eisBeheer();

  const actie = formulier.get('actie');
  if (actie !== 'opslaan' && actie !== 'publiceren')
    return antwoord('Dit formulier klopt niet. Laad de pagina opnieuw.');

  let dagen;
  let start: Record<ReeksVeld, Startwaarde>;
  try {
    const d = DAGEN.safeParse(leesJson(formulier.get('dagen')));
    const s = z.record(z.string(), STARTWAARDE).safeParse(leesJson(formulier.get('initieel')));
    if (!d.success || !s.success) return antwoord('Dit formulier klopt niet. Laad de pagina opnieuw.');
    dagen = d.data;
    start = {} as Record<ReeksVeld, Startwaarde>;
    for (const veld of REEKSVELDEN) {
      const waarde = s.data[veld];
      if (!waarde) return antwoord('Dit formulier klopt niet. Laad de pagina opnieuw.');
      start[veld] = waarde;
    }
  } catch {
    return antwoord('Dit formulier klopt niet. Laad de pagina opnieuw.');
  }

  const tekst = (naam: string): string => {
    const waarde = formulier.get(naam);
    return typeof waarde === 'string' ? waarde : '';
  };
  const invoer: ReeksInvoer = {
    velden: Object.fromEntries(REEKSVELDEN.map((veld) => [veld, tekst(veld)])) as ReeksInvoer['velden'],
    groepenWijzigen: formulier.get('groepen_wijzigen') === 'on',
    groepen: formulier.getAll('groepen').filter((waarde): waarde is string => typeof waarde === 'string'),
    eindverantwoordelijke: tekst('eindverantwoordelijke'),
  };
  if (invoer.eindverantwoordelijke !== '' && !z.uuid().safeParse(invoer.eindverantwoordelijke).success) {
    return antwoord('Dit formulier klopt niet. Laad de pagina opnieuw.', {}, invoer);
  }
  if (!invoer.groepen.every((id) => z.uuid().safeParse(id).success)) {
    return antwoord('Dit formulier klopt niet. Laad de pagina opnieuw.', {}, invoer);
  }

  const wijziging = bepaalWijziging(invoer, start);
  if (Object.keys(wijziging.fouten).length > 0) return antwoord(null, wijziging.fouten, invoer);
  if (actie === 'opslaan' && isLeeg(wijziging)) {
    return antwoord('Er is niets gewijzigd. Vul iets in, of kies “Alle dagen publiceren”.', {}, invoer);
  }

  const supabase = await maakSupabase();
  const { data, error } = await supabase.rpc('activiteiten_bulk_wijzigen', {
    p_activiteiten: dagen.map(({ id, versie }) => ({ id, versie })),
    p_velden: wijziging.velden as unknown as Json,
    p_eindverantwoordelijke: wijziging.eindverantwoordelijke ?? undefined,
    p_publiceren: actie === 'publiceren',
  });

  if (error) {
    // Alleen de soort fout in het log, nooit wat er was ingevuld.
    console.error(`reeks niet gewijzigd: ${error.code ?? error.message}`);
    if (error.code !== 'BK001') return antwoord(vertaalReeksfout('', {}, []), {}, invoer);
    if (error.message === 'geen_admin') redirect('/beheer');
    return antwoord(
      vertaalReeksfout(
        error.message,
        leesDetail(error.details),
        dagen.map((dag) => dag.datum),
      ),
      {},
      invoer,
    );
  }

  const aantal =
    typeof data === 'object' && data !== null && 'aantal' in data && typeof data.aantal === 'number'
      ? data.aantal
      : dagen.length;
  redirect(`/beheer?${actie === 'publiceren' ? 'reekspubliceerd' : 'reekswijzigd'}=${aantal}`);
}
