import type { Metadata } from 'next';
import { z } from 'zod';

import { Schermkader } from '@/components/schermkader/schermkader';
import { Verdelingsraster } from '@/components/verdelingsraster/verdelingsraster';
import { eisBeheer } from '@/lib/beheer';
import { maakVerdeling } from '@/lib/verdeling';
import { seizoenTitel } from '@/lib/vereniging';
import { maakSupabase } from '@/lib/supabase/server';

import { leesDiensten, leesHuidigSeizoen, leesVerdelingsleden } from './gegevens';
import stijl from './verdeling.module.css';

export const metadata: Metadata = { title: 'Wie is aan de beurt? – Ledenplatform' };

/**
 * "Wie is aan de beurt?" (UC-012, FO 9.2, bouwgids 8.2; de opdrachtgever: een fijn overzicht voor de beheerders): alle leden als bolletje met het
 * aantal diensten dit seizoen, de minste eerst. Het systeem telt en laat zien; het bestuur beslist. `?seizoen=` is er voor een ander
 * seizoen, maar staat niet in het scherm: dat is het huidige seizoen.
 */
export default async function Verdeling({
  searchParams,
}: {
  searchParams: Promise<{ seizoen?: string | string[] }>;
}) {
  await eisBeheer();
  const supabase = await maakSupabase();
  const gevraagd = z.coerce
    .number()
    .int()
    .min(2000)
    .max(2100)
    .safeParse((await searchParams).seizoen);
  const seizoen = gevraagd.success ? gevraagd.data : await leesHuidigSeizoen(supabase);

  const [leden, diensten] = await Promise.all([
    leesVerdelingsleden(supabase),
    leesDiensten(supabase, seizoen),
  ]);
  const verdeling = maakVerdeling(leden, diensten);

  return (
    <Schermkader
      actief="beheer"
      titel="Wie is aan de beurt?"
      terug={{ href: '/beheer', tekst: 'Terug naar activiteiten' }}
    >
      {leden.length === 0 ? (
        <p className={stijl.leeg}>Er zijn nog geen leden.</p>
      ) : (
        <Verdelingsraster verdeling={verdeling} seizoen={seizoenTitel(seizoen)} />
      )}
    </Schermkader>
  );
}
