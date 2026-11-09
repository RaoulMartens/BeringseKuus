import type { Metadata } from 'next';

import { Knop } from '@/components/knop/knop';
import { Schermkader } from '@/components/schermkader/schermkader';
import { Statuspaneel } from '@/components/statuspaneel/statuspaneel';
import { eisBeheer } from '@/lib/beheer';
import { maakSupabase } from '@/lib/supabase/server';

import { Activiteitformulier, FORMULIER_ID } from '../activiteitformulier';
import { leesGroepen, leesKandidaten, leesRollen } from '../gegevens';

export const metadata: Metadata = { title: 'Nieuwe activiteit – Ledenplatform' };

export default async function NieuweActiviteit() {
  await eisBeheer();
  const supabase = await maakSupabase();
  const [{ groepen, aantalLeden }, kandidaten, rollen] = await Promise.all([
    leesGroepen(supabase),
    leesKandidaten(supabase),
    leesRollen(supabase),
  ]);

  return (
    <Schermkader
      actief="beheer"
      titel="Nieuwe activiteit"
      terug={{ href: '/beheer', tekst: 'Terug naar activiteiten' }}
      zijkolom={
        <Statuspaneel status="Concept" stip="leeg" uitleg="Alleen het bestuur ziet deze activiteit.">
          <Knop
            type="submit"
            soort="positief"
            icoon="verzenden"
            formulier={FORMULIER_ID}
            naam="actie"
            waarde="publiceren"
          >
            Publiceren
          </Knop>
          <Knop
            type="submit"
            soort="secundair"
            icoon="opslaan"
            formulier={FORMULIER_ID}
            naam="actie"
            waarde="opslaan"
          >
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
        eindverantwoordelijke={{ slotId: null, bezetterId: null, naam: null, telefoon: null, nieuw: true }}
        kandidaten={kandidaten}
        rollen={rollen}
        afgemeld={[]}
      />
    </Schermkader>
  );
}
