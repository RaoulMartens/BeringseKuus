import type { Metadata } from 'next';

import { Knop } from '@/components/knop/knop';
import { Schermkader } from '@/components/schermkader/schermkader';
import { Statuspaneel } from '@/components/statuspaneel/statuspaneel';
import { eisBeheer } from '@/lib/beheer';
import { maakSupabase } from '@/lib/supabase/server';

import { Activiteitformulier, FORMULIER_ID } from '../activiteitformulier';
import { leesGroepen } from '../gegevens';

export const metadata: Metadata = { title: 'Nieuwe activiteit – Ledenplatform' };

export default async function NieuweActiviteit() {
  await eisBeheer();
  const { groepen, aantalLeden } = await leesGroepen(await maakSupabase());

  return (
    <Schermkader
      actief="beheer"
      titel="Nieuwe activiteit"
      terug={{ href: '/beheer', tekst: 'Terug naar activiteiten' }}
      zijkolom={
        <Statuspaneel status="Concept" uitleg="Alleen het bestuur ziet deze activiteit.">
          <Knop type="submit" formulier={FORMULIER_ID}>
            Opslaan als concept
          </Knop>
        </Statuspaneel>
      }
    >
      <Activiteitformulier
        activiteitId={null}
        versie={null}
        // Het minimum begint op 13 (BA-5); de beheerder kan het aanpassen of leegmaken.
        begin={{ tekst: { min_aanwezigen: '13' }, groepen: [] }}
        groepen={groepen}
        aantalLeden={aantalLeden}
        plekken={[]}
        eindverantwoordelijke={{ naam: null, telefoon: null, nieuw: true }}
      />
    </Schermkader>
  );
}
