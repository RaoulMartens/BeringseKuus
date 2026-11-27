import type { Metadata } from 'next';

import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { maakSupabase } from '@/lib/supabase/server';

import { Nieuwlidbevestigen } from './nieuwlidbevestigen';

export const metadata: Metadata = { title: 'Lid toevoegen – Ledenplatform' };

/** De bevestigingspagina van "Nieuw lid" (wireframe admin-lid-nieuw-bevestigen): er gaat een mail naar iemand anders, dus eerst nog een keer kijken. */
export default async function NieuwLidBevestigen() {
  await eisBeheer();
  const { data: groepen, error } = await (
    await maakSupabase()
  )
    .from('groepen')
    .select('id, naam')
    .order('volgorde');
  if (error) throw new Error(`groepen niet te lezen: ${error.code ?? error.message}`);

  return (
    <Schermkader
      actief="beheer"
      titel="Lid toevoegen en uitnodigen?"
      terug={{ href: '/beheer/leden', tekst: 'Terug naar leden' }}
    >
      <Nieuwlidbevestigen groepen={groepen} />
    </Schermkader>
  );
}
