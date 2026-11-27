import type { Metadata } from 'next';

import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { maakSupabase } from '@/lib/supabase/server';

import { Ledenimport } from './ledenimport';

export const metadata: Metadata = { title: 'Meerdere leden toevoegen – Ledenplatform' };

/**
 * Meerdere leden tegelijk toevoegen met een Excel-bestand (UC-013 AF-7, wireframes admin-leden-importeren en -controle). Het bestand wordt in de browser
 * gelezen; de pagina haalt alleen de groepen op, om de namen in het bestand aan groepen te koppelen.
 */
export default async function LedenImporteren() {
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
      titel="Meerdere leden toevoegen"
      terug={{ href: '/beheer/leden', tekst: 'Terug naar leden' }}
    >
      <Ledenimport groepen={groepen} />
    </Schermkader>
  );
}
