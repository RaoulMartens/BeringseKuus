import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { groepenRegel } from '@/lib/leden';
import { maakSupabase } from '@/lib/supabase/server';

import { zetLidActief } from '../../acties';
import { Bevestigformulier } from '../../bevestigformulier';
import { leesLidBeheer } from '../../gegevens';
import stijl from '../../leden.module.css';

export const metadata: Metadata = { title: 'Lid weer actief maken – Ledenplatform' };

/** Een lid weer actief maken (wireframe admin-lid-actief): de plekken van eerder komen niet terug, de groepen staan nog zoals ze waren. */
export default async function LidActiefMaken({ params }: { params: Promise<{ lidId: string }> }) {
  await eisBeheer();
  const id = z.uuid().safeParse((await params).lidId);
  if (!id.success) notFound();

  const lid = await leesLidBeheer(await maakSupabase(), id.data);
  if (!lid) notFound();
  if (lid.actief) redirect(`/beheer/leden/${lid.lidId}`);

  const groepen = groepenRegel({
    groepen: lid.groepen.filter((g) => g.gekozen).map((g) => g.naam),
    isBeheerder: false,
  });

  return (
    <Schermkader
      actief="beheer"
      titel={`${lid.naam} weer actief maken?`}
      terug={{ href: '/beheer/leden/inactief', tekst: 'Terug naar inactieve leden' }}
    >
      <Kaart titel={lid.naam}>
        <p className={stijl.hulp}>
          {lid.naam} kan daarna weer inloggen en wordt weer ingedeeld en uitgenodigd. De plekken van eerder
          komen niet terug. De groepen staan nog zoals ze waren: {groepen}.
        </p>
      </Kaart>
      <Bevestigformulier
        actie={zetLidActief}
        lidId={lid.lidId}
        knop="Weer actief maken"
        soort="positief"
        terugHref="/beheer/leden/inactief"
      />
    </Schermkader>
  );
}
