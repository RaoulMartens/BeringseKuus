import type { Metadata } from 'next';

import { Kaart } from '@/components/kaart/kaart';
import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { maakSupabase } from '@/lib/supabase/server';

import { leesKandidaten } from '../gegevens';

import { Kandidatenkeuze } from './kandidatenkeuze';

export const metadata: Metadata = { title: 'Beheerder toevoegen – Ledenplatform' };

export default async function BeheerderKiezen() {
  await eisBeheer();
  const kandidaten = await leesKandidaten(await maakSupabase());

  return (
    <Schermkader
      actief="beheer"
      titel="Beheerder toevoegen"
      terug={{ href: '/beheer/beheerders', tekst: 'Terug naar beheerders' }}
    >
      {kandidaten.length === 0 ? (
        <Kaart titel="Niemand om toe te voegen">
          <p>Alle leden met een inlogaccount zijn al beheerder.</p>
        </Kaart>
      ) : (
        <Kandidatenkeuze kandidaten={kandidaten} />
      )}
    </Schermkader>
  );
}
