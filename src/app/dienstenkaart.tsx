// De kaart "Mijn diensten" onder de statuskaart op Start (UC-007): de ingang naar Mijn diensten voor wie geen eigen rij in de
// rolbezetting heeft (afgemeld, zonder dienst, lege staat). Wie wel een eigen rij heeft, krijgt "Al je diensten" op die rij.
// Opbouw als in het visuele ontwerp (welkom-afgemeld): een klein label "Mijn diensten" en daaronder één regel ("3 komende") met
// een pijltje. De link heet voor een schermlezer "Mijn diensten, 3 komende".

import { useId } from 'react';

import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { aantalKomende } from '@/lib/mijndiensten';

import stijl from './dienstenkaart.module.css';

export function Dienstenkaart({ aantal }: { aantal: number }) {
  // De kaart staat twee keer in de pagina (telefoon en groot scherm): elk een eigen id.
  const kopId = useId();
  return (
    <section className={stijl.kaart} aria-labelledby={kopId}>
      <h2 id={kopId} className={stijl.label}>
        Mijn diensten
      </h2>
      <Lijst>
        <Lijstrij href="/programma/mijn">
          <span className={stijl.tekst}>
            <span className={stijl.verborgen}>Mijn diensten, </span>
            {aantal > 0 ? <strong>{aantalKomende(aantal)}</strong> : aantalKomende(aantal)}
          </span>
        </Lijstrij>
      </Lijst>
    </section>
  );
}
