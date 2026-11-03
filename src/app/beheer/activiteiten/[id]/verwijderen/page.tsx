import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { langeDag } from '@/lib/programma';
import { aantalIngedeeld } from '@/lib/publiceren';
import { ingedeeldTekst } from '@/lib/verwijderen';
import { maakSupabase } from '@/lib/supabase/server';

import { leesActiviteit } from '../../gegevens';

import { Verwijderformulier } from './verwijderformulier';
import stijl from './verwijderen.module.css';

export const metadata: Metadata = { title: 'Concept verwijderen – Ledenplatform' };

/**
 * De bevestiging voor het verwijderen van een concept (UC-004 AF-10): het kan niet terug, dus eerst een eigen pagina met wat
 * er meegaat (ontwerpregel "Bevestigen"). Deze pagina wijzigt niets; de knop roept verwijderConcept aan.
 */
export default async function ConceptVerwijderen({ params }: { params: Promise<{ id: string }> }) {
  await eisBeheer();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await maakSupabase();
  const activiteit = await leesActiviteit(supabase, id.data);
  if (!activiteit) notFound();

  const terugHref = `/beheer/activiteiten/${activiteit.id}`;
  // Alleen een concept is te verwijderen; bij een andere status is er niets te bevestigen.
  if (activiteit.status !== 'concept') redirect(terugHref);

  const ingedeeld = aantalIngedeeld(activiteit.plekken, activiteit.eindverantwoordelijke.bezetterId);

  return (
    <Schermkader
      actief="beheer"
      titel={`${activiteit.naam} verwijderen?`}
      terug={{ href: terugHref, tekst: 'Terug naar de activiteit' }}
    >
      <Kaart titel={`${activiteit.naam} — ${langeDag(activiteit.datum)}`}>
        <p className={stijl.tekst}>{ingedeeldTekst(ingedeeld)}</p>
        <p className={stijl.tekst}>Dit kun je niet terugdraaien.</p>
      </Kaart>
      <Verwijderformulier activiteitId={activiteit.id} terugHref={terugHref} />
    </Schermkader>
  );
}
