import type { Metadata } from 'next';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';

export const metadata: Metadata = { title: 'Storing – Ledenplatform' };

// De database of het inlogsysteem antwoordt niet (wireframe storing, een ontwerpgat uit de bouw). Een storing stuurt je nooit
// naar Inloggen: het lid is niet uitgelogd. Een gastscherm: het vraagt zelf niets aan de database, anders had het zelf een
// storing (zie sessie.ts, dat hierheen stuurt).
export default function Storing() {
  return (
    <Schermkader gast titel="We kunnen nu niet bij de gegevens">
      <Melding soort="let-op">
        Het ledenplatform kan op dit moment niet bij de gegevens. Dat ligt niet aan jou en je bent niet
        uitgelogd.
      </Melding>
      <Kaart titel="Probeer het over een paar minuten opnieuw">
        <p>Je hoeft niet opnieuw in te loggen.</p>
        <p>
          Moet je nu weten waar je moet zijn? Vraag het aan de eindverantwoordelijke van de activiteit of aan
          een bestuurslid.
        </p>
        <p>
          <Knop href="/">Probeer opnieuw</Knop>
        </p>
      </Kaart>
    </Schermkader>
  );
}
