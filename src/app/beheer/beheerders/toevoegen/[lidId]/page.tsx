import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { maakSupabase } from '@/lib/supabase/server';

import { maakBeheerder } from '../../acties';
import { Bevestigformulier } from '../../bevestigformulier';
import stijl from '../../beheerders.module.css';
import { leesKandidaten } from '../../gegevens';

export const metadata: Metadata = { title: 'Beheerder maken – Ledenplatform' };

/**
 * De bevestiging voor het maken van een beheerder (wireframe admin-beheerder-toevoegen): het raakt iemand anders en het
 * lid moet daarna zelf een app instellen, dus eerst een eigen pagina met wat er gebeurt (ontwerpregel "Bevestigen"). Deze
 * pagina wijzigt niets; de knop roept maakBeheerder aan.
 */
export default async function BeheerderMaken({ params }: { params: Promise<{ lidId: string }> }) {
  await eisBeheer();
  const id = z.uuid().safeParse((await params).lidId);
  if (!id.success) notFound();

  const kandidaat = (await leesKandidaten(await maakSupabase())).find((k) => k.lidId === id.data);
  // Niet (meer) te kiezen: al beheerder, of geen account. Terug naar de lijst.
  if (!kandidaat) redirect('/beheer/beheerders/toevoegen');

  return (
    <Schermkader
      actief="beheer"
      titel={`${kandidaat.naam} beheerder maken?`}
      terug={{ href: '/beheer/beheerders/toevoegen', tekst: 'Terug naar de lijst' }}
    >
      <Kaart
        titel={kandidaat.naam}
        ondertitel="Een beheerder maakt activiteiten aan, publiceert en deelt in, en ziet de gegevens van alle leden."
      >
        <ol className={stijl.stappen}>
          <li>Bij het inloggen stelt {kandidaat.naam} zelf een app in.</li>
          <li>Jij ziet dan bij Beheerders dat je de toegang moet bevestigen.</li>
          <li>
            Na jouw bevestiging kan {kandidaat.naam} bij Beheer. Tot die tijd gebruikt het lid het platform
            als lid.
          </li>
        </ol>
      </Kaart>
      <Melding soort="info">Er gaat geen bericht uit. Zeg het {kandidaat.naam} zelf.</Melding>
      <Bevestigformulier
        actie={maakBeheerder}
        velden={{ lid_id: kandidaat.lidId }}
        knop="Beheerder maken"
        terugHref="/beheer/beheerders/toevoegen"
      />
    </Schermkader>
  );
}
