import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { dienstRegel } from '@/lib/leden';
import { korteDatum } from '@/lib/programma';
import { maakSupabase } from '@/lib/supabase/server';

import { zetLidInactief } from '../../acties';
import { Bevestigformulier } from '../../bevestigformulier';
import { leesLidBeheer } from '../../gegevens';
import stijl from '../../leden.module.css';

export const metadata: Metadata = { title: 'Lid op inactief zetten – Ledenplatform' };

/**
 * Een lid op inactief zetten (wireframe admin-lid-inactief-bevestigen): het raakt iemand anders en de plekken vallen leeg, dus eerst een eigen
 * pagina die vooraf toont wat er open valt. Een beheerder en jijzelf kunnen niet op inactief (R33): dan terug naar het lid.
 */
export default async function LidInactiefZetten({ params }: { params: Promise<{ lidId: string }> }) {
  await eisBeheer();
  const id = z.uuid().safeParse((await params).lidId);
  if (!id.success) notFound();

  const lid = await leesLidBeheer(await maakSupabase(), id.data);
  if (!lid) notFound();
  if (!lid.actief) redirect(`/beheer/leden/${lid.lidId}/actief`);
  if (lid.isIk || lid.isBeheerder) redirect(`/beheer/leden/${lid.lidId}`);

  const eindverantwoordelijk = lid.diensten.filter(
    (d) => d.rol === 'eindverantwoordelijke' && d.status === 'gepubliceerd',
  );

  return (
    <Schermkader
      actief="beheer"
      titel={`${lid.naam} op inactief zetten?`}
      terug={{ href: `/beheer/leden/${lid.lidId}`, tekst: `Terug naar ${lid.naam}` }}
    >
      <Kaart titel={lid.naam}>
        <p className={stijl.hulp}>
          {lid.naam} kan daarna niet meer inloggen en krijgt geen indelingen, berichten of uitnodigingen. Wat{' '}
          {lid.voornaam} deed, blijft staan: afmeldingen en eerdere diensten.
        </p>
      </Kaart>
      <Kaart titel={`Deze plekken vallen open (${lid.diensten.length})`} lijst={lid.diensten.length > 0}>
        {lid.diensten.length === 0 ? (
          <p className={stijl.hulp}>{lid.voornaam} heeft geen komende plekken.</p>
        ) : (
          <Lijst>
            {lid.diensten.map((d) => (
              <Lijstrij key={`${d.activiteitId}-${d.rol}`}>
                <span className={stijl.tekst}>
                  <strong className={stijl.naam}>{d.naam}</strong>
                  <span className={stijl.onder}>
                    {korteDatum(d.datum)} · {dienstRegel(d)}
                  </span>
                </span>
              </Lijstrij>
            ))}
          </Lijst>
        )}
      </Kaart>
      {eindverantwoordelijk.length > 0 && (
        <Melding soort="let-op">
          {lid.voornaam} is eindverantwoordelijke van {eindverantwoordelijk.map((d) => d.naam).join(', ')}.
          Die activiteit heeft daarna geen eindverantwoordelijke meer en komt onder Vraagt aandacht in het
          beheeroverzicht, tot je iemand kiest.
        </Melding>
      )}
      <Melding soort="let-op">
        Er gaat geen bericht uit, ook niet naar de leden die met {lid.voornaam} hadden geruild. Zeg het{' '}
        {lid.voornaam} zelf.
      </Melding>
      <Bevestigformulier
        actie={zetLidInactief}
        lidId={lid.lidId}
        knop="Op inactief zetten"
        soort="negatief"
        terugHref={`/beheer/leden/${lid.lidId}`}
      />
    </Schermkader>
  );
}
