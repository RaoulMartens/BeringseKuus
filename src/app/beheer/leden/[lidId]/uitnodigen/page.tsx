import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { uitnodigingTekst } from '@/lib/leden';
import { maakSupabase } from '@/lib/supabase/server';

import { stuurUitnodigingOpnieuw } from '../../acties';
import { Bevestigformulier } from '../../bevestigformulier';
import { leesLidBeheer, leesUitnodigingen } from '../../gegevens';
import stijl from '../../leden.module.css';

export const metadata: Metadata = { title: 'Uitnodiging opnieuw sturen – Ledenplatform' };

/**
 * De uitnodiging opnieuw sturen (wireframe admin-lid-uitnodigen): alleen voor een lid dat nog nooit is ingelogd. De mail gaat naar iemand anders,
 * dus een eigen bevestigingspagina. Wijst vooraf op de gewone reden dat een mail niet aankomt: een verkeerd adres.
 */
export default async function UitnodigingOpnieuw({ params }: { params: Promise<{ lidId: string }> }) {
  await eisBeheer();
  const id = z.uuid().safeParse((await params).lidId);
  if (!id.success) notFound();

  const supabase = await maakSupabase();
  const lid = await leesLidBeheer(supabase, id.data);
  if (!lid) notFound();
  if (!lid.actief || lid.laatstIngelogd) redirect(`/beheer/leden/${lid.lidId}`);
  const uitnodiging = (await leesUitnodigingen(supabase)).get(lid.lidId) ?? null;
  const eerder = uitnodigingTekst(uitnodiging);

  return (
    <Schermkader
      actief="beheer"
      titel={`Uitnodiging opnieuw sturen aan ${lid.naam}?`}
      terug={{ href: `/beheer/leden/${lid.lidId}`, tekst: `Terug naar ${lid.naam}` }}
    >
      <Kaart titel={lid.naam}>
        <p className={stijl.hulp}>
          {lid.email}
          {eerder ? ` · eerste uitnodiging: ${eerder.toLowerCase()}` : ''}
        </p>
      </Kaart>
      <Melding soort="let-op">
        {lid.voornaam} krijgt dezelfde mail nog een keer, met uitleg hoe je inlogt (een code per mail). Komt
        hij niet aan, kijk dan eerst of het adres klopt:{' '}
        <a href={`/beheer/leden/${lid.lidId}/adres`}>e-mailadres corrigeren</a>.
      </Melding>
      <Bevestigformulier
        actie={stuurUitnodigingOpnieuw}
        lidId={lid.lidId}
        knop="Uitnodiging sturen"
        soort="positief"
        terugHref={`/beheer/leden/${lid.lidId}`}
      />
    </Schermkader>
  );
}
