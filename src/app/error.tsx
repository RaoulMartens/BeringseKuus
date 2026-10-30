'use client';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Kader } from '@/components/schermkader/kader';

interface Eigenschappen {
  error: Error & { digest?: string };
  reset: () => void;
}

// Een fout in een pagina (wireframe fout). Next toont dit in plaats van de pagina; `digest` is het nummer waarmee een fout
// in de logboeken terug te vinden is, en dat kan een lid aan het bestuur doorgeven. De tekst van de fout zelf tonen we
// nooit: die kan gegevens bevatten. Dit onderdeel draait in de browser en gebruikt daarom Kader, niet Schermkader.
export default function Foutpagina({ error, reset }: Eigenschappen) {
  return (
    <Kader titel="Er ging iets mis">
      <Kaart>
        <p>Dat is niet gelukt. Er is niets verloren gegaan. Probeer het nog een keer.</p>
        <p>
          <Knop onClick={reset}>Probeer opnieuw</Knop>
        </p>
        <p>
          <Knop href="/" soort="secundair">
            Terug naar start
          </Knop>
        </p>
        {error.digest && <p>Blijft het misgaan? Geef dit nummer door aan het bestuur: {error.digest}</p>}
      </Kaart>
    </Kader>
  );
}
