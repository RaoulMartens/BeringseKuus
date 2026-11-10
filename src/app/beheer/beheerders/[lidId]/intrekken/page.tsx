import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { maakSupabase } from '@/lib/supabase/server';

import { trekBeheerderIn } from '../../acties';
import { Bevestigformulier } from '../../bevestigformulier';
import { leesBeheerderslijst } from '../../gegevens';

export const metadata: Metadata = { title: 'Beheerrechten intrekken – Ledenplatform' };

/**
 * Beheerrechten intrekken (wireframe admin-beheerder-intrekken): het raakt iemand anders en de app van dat lid wordt
 * losgekoppeld, dus eerst een eigen pagina. Je eigen rechten trek je niet in: zo blijft er altijd een beheerder over.
 */
export default async function BeheerrechtenIntrekken({ params }: { params: Promise<{ lidId: string }> }) {
  await eisBeheer();
  const id = z.uuid().safeParse((await params).lidId);
  if (!id.success) notFound();

  const beheerder = (await leesBeheerderslijst(await maakSupabase())).find((b) => b.lidId === id.data);
  if (!beheerder || beheerder.isIk) redirect('/beheer/beheerders');

  return (
    <Schermkader
      actief="beheer"
      titel={`Beheerrechten van ${beheerder.naam} intrekken?`}
      terug={{ href: '/beheer/beheerders', tekst: 'Terug naar beheerders' }}
    >
      <Kaart titel={beheerder.naam}>
        <p>
          Daarna kan {beheerder.naam} niets meer beheren. Het lid blijft lid: diensten en groepen blijven
          staan. De app van het lid wordt losgekoppeld.
        </p>
      </Kaart>
      <Melding soort="let-op">
        Wordt {beheerder.naam} later weer beheerder, dan stelt het lid opnieuw een app in en bevestig jij dat
        opnieuw.
      </Melding>
      <Bevestigformulier
        actie={trekBeheerderIn}
        velden={{ lid_id: beheerder.lidId }}
        knop="Rechten intrekken"
        soort="negatief"
        terugHref="/beheer/beheerders"
      />
    </Schermkader>
  );
}
