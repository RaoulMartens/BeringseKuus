import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { langeDag } from '@/lib/programma';
import { aantalIngedeeld } from '@/lib/publiceren';
import { afgemeldTekst, ingedeeldTekst } from '@/lib/verwijderen';
import { maakSupabase } from '@/lib/supabase/server';

import { leesActiviteit, leesAfgemeld } from '../../gegevens';

import { Verwijderformulier } from './verwijderformulier';
import stijl from './verwijderen.module.css';

export const metadata: Metadata = { title: 'Activiteit verwijderen – Ledenplatform' };

/**
 * De bevestiging voor het verwijderen van een activiteit (UC-004 AF-10): het kan niet terug, dus eerst een eigen pagina met
 * wat er meegaat (ontwerpregel "Bevestigen"). Bij een gepubliceerde activiteit zegt de pagina ook dat leden hem niet meer zien
 * en dat er geen bericht uitgaat. Deze pagina wijzigt niets; de knop roept verwijderActiviteit aan.
 */
export default async function ActiviteitVerwijderen({ params }: { params: Promise<{ id: string }> }) {
  await eisBeheer();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await maakSupabase();
  const activiteit = await leesActiviteit(supabase, id.data);
  if (!activiteit) notFound();

  const terugHref = `/beheer/activiteiten/${activiteit.id}`;
  // Een concept of een gepubliceerde activiteit; bij een andere status is er niets te bevestigen.
  if (activiteit.status !== 'concept' && activiteit.status !== 'gepubliceerd') redirect(terugHref);
  const gepubliceerd = activiteit.status === 'gepubliceerd';

  const ingedeeld = aantalIngedeeld(activiteit.plekken, activiteit.eindverantwoordelijke.bezetterId);
  const afgemeld = gepubliceerd ? afgemeldTekst((await leesAfgemeld(supabase, activiteit.id)).length) : null;

  return (
    <Schermkader
      actief="beheer"
      titel={`${activiteit.naam} verwijderen?`}
      terug={{ href: terugHref, tekst: 'Terug naar de activiteit' }}
    >
      <Kaart titel={`${activiteit.naam} — ${langeDag(activiteit.datum)}`}>
        {gepubliceerd && (
          <p className={stijl.tekst}>
            Leden zien deze activiteit nu in het programma. Na het verwijderen is hij voor iedereen weg, ook
            uit Mijn diensten.
          </p>
        )}
        <p className={stijl.tekst}>{ingedeeldTekst(ingedeeld)}</p>
        {afgemeld && <p className={stijl.tekst}>{afgemeld}</p>}
        {gepubliceerd && (
          <p className={stijl.tekst}>
            Er gaat geen bericht uit. Laat het de leden zelf weten, zeker wie er is ingedeeld.
          </p>
        )}
        <p className={stijl.tekst}>Dit kun je niet terugdraaien.</p>
      </Kaart>
      <Verwijderformulier
        activiteitId={activiteit.id}
        terugHref={terugHref}
        knop={gepubliceerd ? 'Activiteit verwijderen' : 'Concept verwijderen'}
      />
    </Schermkader>
  );
}
