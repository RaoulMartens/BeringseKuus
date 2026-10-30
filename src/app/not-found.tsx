import type { Metadata } from 'next';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Schermkader } from '@/components/schermkader/schermkader';

export const metadata: Metadata = { title: 'Pagina niet gevonden – Ledenplatform' };

// Een adres dat niet bestaat (wireframe niet-gevonden). Een gastscherm: het vraagt niets aan de database, zodat het ook
// werkt als die even niet bereikbaar is.
export default function NietGevonden() {
  return (
    <Schermkader gast titel="Deze pagina bestaat niet">
      <Kaart>
        <p>
          We kunnen deze pagina niet vinden. Misschien is de link verouderd of is er een typefout in het
          adres.
        </p>
        <p>
          <Knop href="/">Naar start</Knop>
        </p>
        <p>
          <Knop href="/programma" soort="secundair">
            Naar het programma
          </Knop>
        </p>
      </Kaart>
    </Schermkader>
  );
}
