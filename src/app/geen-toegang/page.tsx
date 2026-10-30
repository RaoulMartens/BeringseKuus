import type { Metadata } from 'next';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Schermkader } from '@/components/schermkader/schermkader';

export const metadata: Metadata = { title: 'Alleen voor het bestuur – Ledenplatform' };

// Een lid zonder beheerrechten dat een beheerpagina opent (wireframe alleen-bestuur).
export default function GeenToegang() {
  return (
    <Schermkader gast titel="Dit is alleen voor het bestuur" terug={{ href: '/', tekst: 'Terug naar start' }}>
      <Kaart titel="Beheer is bedoeld voor bestuursleden">
        <p>
          Alles wat een lid doet kan wel: het programma bekijken, je dienst ruilen en je afmelden. Denk je dat
          je hier toch bij hoort? Vraag het aan het bestuur.
        </p>
        <p>
          <Knop href="/">Naar start</Knop>
        </p>
      </Kaart>
    </Schermkader>
  );
}
