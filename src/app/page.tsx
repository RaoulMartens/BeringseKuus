import { redirect } from 'next/navigation';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Schermkader } from '@/components/schermkader/schermkader';
import { huidigeGebruiker } from '@/lib/gebruiker';
import { huidigeAuthGebruiker } from '@/lib/sessie';

// De voorpagina is nog niet de startpagina uit het ontwerp ("Alaaf, [voornaam]"): die komt met de indeling (fase 2). Tot dan
// stuurt ze een lid door naar het programma, en toont ze een gast wat er is en waar die naartoe kan (review F1-18).
export default async function Startpagina() {
  if (await huidigeAuthGebruiker()) redirect((await huidigeGebruiker()) ? '/programma' : '/mijn');

  return (
    <Schermkader gast titel="Ledenplatform">
      <Kaart titel="In aanbouw">
        <p>Dit platform is in aanbouw. Heb je al toegang, log dan in om het programma te bekijken.</p>
        <p>
          <Knop href="/inloggen">Inloggen</Knop>
        </p>
      </Kaart>
    </Schermkader>
  );
}
