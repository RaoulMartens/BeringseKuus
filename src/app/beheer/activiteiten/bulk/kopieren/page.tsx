import type { Metadata } from 'next';

import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { maakSupabase } from '@/lib/supabase/server';

import { leesSeizoenen } from '../gegevens';
import { Kopieren } from '../kopieerscherm';

export const metadata: Metadata = { title: 'Vorig seizoen kopiëren – Ledenplatform' };

/**
 * Een vorig seizoen kopiëren (UC-006, wireframes admin-bulk-kopieren en admin-bulk-controleren). De pagina leest de seizoenen met
 * hun activiteiten en de groepen (om "voor wie" in woorden te tonen); het rekenen en het nalopen gebeurt in het scherm zelf, en
 * de database maakt de concepten aan.
 */
export default async function SeizoenKopieren() {
  await eisBeheer();
  const supabase = await maakSupabase();
  const seizoenen = await leesSeizoenen(supabase);
  const { data: groepen, error } = await supabase.from('groepen').select('id, naam').order('volgorde');
  if (error) throw new Error(`groepen niet te lezen: ${error.code ?? error.message}`);

  return (
    <Schermkader
      actief="beheer"
      titel="Vorig seizoen kopiëren"
      terug={{ href: '/beheer/activiteiten/bulk', tekst: 'Terug naar meerdere aanmaken' }}
    >
      <Kopieren seizoenen={seizoenen} groepen={groepen} />
    </Schermkader>
  );
}
