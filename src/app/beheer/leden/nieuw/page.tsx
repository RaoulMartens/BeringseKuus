import type { Metadata } from 'next';

import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { maakSupabase } from '@/lib/supabase/server';

import { Nieuwlidformulier, Nieuwlidpaneel } from './nieuwlidformulier';

export const metadata: Metadata = { title: 'Nieuw lid – Ledenplatform' };

/**
 * Een nieuw lid (wireframe admin-lid-nieuw): naam, e-mailadres, telefoon (niet verplicht), groepen en bijzondere rollen. Het e-mailadres is waarmee
 * het lid inlogt en is daarna niet meer te wijzigen. De knop is uit tot alles klopt en het paneel zegt wat nog nodig is; de controle zelf doet de
 * database (lid_toevoegen).
 */
export default async function NieuwLid() {
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
      titel="Nieuw lid"
      terug={{ href: '/beheer/leden', tekst: 'Terug naar leden' }}
      zijkolom={<Nieuwlidpaneel />}
    >
      <Nieuwlidformulier groepen={groepen} />
    </Schermkader>
  );
}
