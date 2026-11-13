import type { Metadata } from 'next';

import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { maakSupabase } from '@/lib/supabase/server';

import { Importeren } from './importeren';

export const metadata: Metadata = { title: 'Meerdere activiteiten aanmaken – Ledenplatform' };

/**
 * Meerdere activiteiten tegelijk aanmaken met een Excel-bestand (UC-006). De pagina haalt alleen op wat het onderdeel nodig heeft:
 * de groepen (om "voor wie" te koppelen) en het seizoen van vandaag (voor een datum zonder jaar). Het bestand zelf wordt in de
 * browser gelezen.
 */
export default async function MeerdereAanmaken() {
  await eisBeheer();
  const supabase = await maakSupabase();

  const { data: seizoen, error: seizoenFout } = await supabase.rpc('huidig_seizoen');
  if (seizoenFout) throw new Error(`seizoen niet te lezen: ${seizoenFout.code ?? seizoenFout.message}`);
  const { data: groepen, error: groepenFout } = await supabase
    .from('groepen')
    .select('id, naam')
    .order('volgorde');
  if (groepenFout) throw new Error(`groepen niet te lezen: ${groepenFout.code ?? groepenFout.message}`);

  return (
    <Schermkader
      actief="beheer"
      titel="Meerdere activiteiten aanmaken"
      terug={{ href: '/beheer', tekst: 'Terug naar activiteiten' }}
    >
      <Importeren groepen={groepen} seizoen={seizoen} />
    </Schermkader>
  );
}
