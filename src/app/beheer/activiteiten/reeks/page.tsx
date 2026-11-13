import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { dagTekst } from '@/lib/programma';
import { startGroepen, startwaarden, type DagWaarden } from '@/lib/reeksbewerken';
import { maakSupabase } from '@/lib/supabase/server';

import { leesGroepen, leesKandidaten } from '../gegevens';

import { Reeksformulier } from './reeksformulier';

export const metadata: Metadata = { title: 'Alle dagen bewerken – Ledenplatform' };

const IDS = z.array(z.uuid()).min(2).max(50);

/**
 * Alle dagen van een reeks tegelijk bewerken: dezelfde tijden, plaats, notitie, voor wie en eindverantwoordelijke voor alle dagen, en
 * eventueel alle dagen tegelijk publiceren. De dagen komen uit de adresbalk (de id's, geen namen); alleen concepten kunnen hier.
 */
export default async function ReeksBewerken({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  await eisBeheer();
  const { ids: ruw } = await searchParams;
  const ids = IDS.safeParse(typeof ruw === 'string' ? ruw.split(',') : []);
  if (!ids.success) redirect('/beheer');

  const supabase = await maakSupabase();
  const [rijen, groepRijen, slots, groepen, kandidaten] = await Promise.all([
    supabase
      .from('activiteiten')
      .select(
        'id, naam, datum, status, versie, verzameltijd, starttijd, eindtijd, locatie, bus_vertrektijd, bus_locatie, notitie',
      )
      .in('id', ids.data)
      .order('datum'),
    supabase.from('activiteit_groep').select('activiteit_id, groep_id').in('activiteit_id', ids.data),
    supabase
      .from('rol_slots')
      .select('activiteit_id, bezetter_id')
      .eq('rol_type', 'eindverantwoordelijke')
      .in('activiteit_id', ids.data),
    leesGroepen(supabase),
    leesKandidaten(supabase),
  ]);
  if (rijen.error) throw new Error(`activiteiten niet te lezen: ${rijen.error.code ?? rijen.error.message}`);
  if (groepRijen.error)
    throw new Error(`doelgroepen niet te lezen: ${groepRijen.error.code ?? groepRijen.error.message}`);
  if (slots.error) throw new Error(`plekken niet te lezen: ${slots.error.code ?? slots.error.message}`);

  // Alleen concepten, en alle gevraagde dagen moeten er zijn; anders is er niets te bewerken en gaat de beheerder terug.
  if (rijen.data.length !== ids.data.length || rijen.data.some((rij) => rij.status !== 'concept'))
    redirect('/beheer');

  const dagen: DagWaarden[] = rijen.data.map((rij) => ({
    verzameltijd: rij.verzameltijd,
    starttijd: rij.starttijd,
    eindtijd: rij.eindtijd,
    locatie: rij.locatie,
    bus_vertrektijd: rij.bus_vertrektijd,
    bus_locatie: rij.bus_locatie,
    notitie: rij.notitie,
    groepen: groepRijen.data.filter((g) => g.activiteit_id === rij.id).map((g) => g.groep_id),
  }));

  // De eindverantwoordelijke die alle dagen al hebben, als dat er één is.
  const bezetters = new Set(
    rijen.data.map((rij) => slots.data.find((slot) => slot.activiteit_id === rij.id)?.bezetter_id ?? ''),
  );
  const huidig = bezetters.size === 1 ? ([...bezetters][0] ?? '') : '';

  const namen = new Set(rijen.data.map((rij) => rij.naam));
  const naam = namen.size === 1 ? (rijen.data[0]?.naam ?? 'Reeks') : 'Meerdere activiteiten';

  return (
    <Schermkader
      actief="beheer"
      titel={`${naam} bewerken`}
      terug={{ href: '/beheer', tekst: 'Terug naar activiteiten' }}
    >
      <Reeksformulier
        dagen={rijen.data.map((rij) => ({
          id: rij.id,
          versie: rij.versie,
          datum: rij.datum,
          label: dagTekst(rij.datum).lang,
        }))}
        start={startwaarden(dagen)}
        groepenStart={startGroepen(dagen)}
        groepen={groepen.groepen}
        aantalLeden={groepen.aantalLeden}
        leden={kandidaten
          .filter((kandidaat) => !kandidaat.extern)
          .map((kandidaat) => ({
            id: kandidaat.id,
            naam: kandidaat.naam,
            heeftTelefoon: kandidaat.telefoon !== null,
          }))}
        eindverantwoordelijke={huidig}
      />
    </Schermkader>
  );
}
