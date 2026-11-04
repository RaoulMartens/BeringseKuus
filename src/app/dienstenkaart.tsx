// De kaart "Mijn diensten · N komende ›" onder de statuskaart op Start (UC-007): de ingang naar Mijn diensten voor wie geen eigen rij in
// de rolbezetting heeft (afgemeld, zonder dienst, lege staat). Wie wel een eigen rij heeft, krijgt "Al je diensten" op die rij.

import { Kaart } from '@/components/kaart/kaart';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { aantalKomende } from '@/lib/mijndiensten';

import stijl from './programma/programma.module.css';

export function Dienstenkaart({ aantal }: { aantal: number }) {
  return (
    <Kaart lijst>
      <Lijst zonderKop>
        <Lijstrij href="/programma/mijn">
          <span className={stijl.tekst}>
            <strong className={stijl.naam}>Mijn diensten</strong>
            <span className={stijl.regel}>{aantalKomende(aantal)}</span>
          </span>
        </Lijstrij>
      </Lijst>
    </Kaart>
  );
}
