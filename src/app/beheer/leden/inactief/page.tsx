import type { Metadata } from 'next';

import { Kaart } from '@/components/kaart/kaart';
import { Schermkader } from '@/components/schermkader/schermkader';
import { Tellers } from '@/components/tellers/tellers';
import { eisBeheer } from '@/lib/beheer';
import { inactiefRegel, maakLedenoverzicht } from '@/lib/leden';
import { maakSupabase } from '@/lib/supabase/server';

import { leesLedenlijst } from '../gegevens';
import { Ledenzoeker } from '../ledenzoeker';
import stijl from '../leden.module.css';

export const metadata: Metadata = { title: 'Inactieve leden – Ledenplatform' };

/** De inactieve leden (wireframe admin-leden-inactief): een rij opent de bevestiging van weer actief maken. */
export default async function InactieveLeden() {
  await eisBeheer();
  const overzicht = maakLedenoverzicht(await leesLedenlijst(await maakSupabase()));

  return (
    <Schermkader
      actief="beheer"
      titel="Inactieve leden"
      terug={{ href: '/beheer/leden', tekst: 'Terug naar leden' }}
      zijkolom={
        <Kaart titel="Tonen" label>
          <Tellers
            klein
            naam="Leden tonen"
            tellers={[
              { href: '/beheer/leden', aantal: overzicht.actief.length, label: 'actief', actief: false },
              {
                href: '/beheer/leden/inactief',
                aantal: overzicht.inactief.length,
                label: 'inactief',
                actief: true,
              },
            ]}
          />
        </Kaart>
      }
    >
      {overzicht.inactief.length === 0 ? (
        <Kaart titel="Inactief" label>
          <p className={stijl.hulp}>Er zijn geen inactieve leden.</p>
        </Kaart>
      ) : (
        <>
          <Ledenzoeker
            titel="Inactief"
            leden={overzicht.inactief.map((lid) => ({
              lidId: lid.lidId,
              voornaam: lid.voornaam,
              achternaam: lid.achternaam,
              naam: lid.naam,
              onder: inactiefRegel(lid),
              href: `/beheer/leden/${lid.lidId}/actief`,
            }))}
          />
          <p className={stijl.hulp}>
            Inactieve leden krijgen geen indeling, bericht of uitnodiging. Hun naam blijft staan bij wat ze
            deden.
          </p>
        </>
      )}
    </Schermkader>
  );
}
