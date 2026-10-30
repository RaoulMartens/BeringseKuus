import type { Metadata } from 'next';

import { Kaart } from '@/components/kaart/kaart';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';

export const metadata: Metadata = { title: 'Beheer – Ledenplatform' };

// Tijdelijk: de beheerschermen komen in fase 2. Deze pagina bewijst dat de toegang werkt (stap D) en leidt naar wat er al is:
// het programma. Het staat in het kader van de andere schermen, dus met de bovenbalk.
export default async function Beheer() {
  await eisBeheer();
  return (
    <Schermkader actief="beheer" titel="Beheer">
      <p>Je bent ingelogd als beheerder.</p>
      <Kaart titel="Wat er al is" kop="h2" lijst>
        <Lijst>
          <Lijstrij href="/programma">Het programma van het seizoen bekijken</Lijstrij>
        </Lijst>
      </Kaart>
    </Schermkader>
  );
}
