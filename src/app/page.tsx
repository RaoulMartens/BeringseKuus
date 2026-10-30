import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Schermkader } from '@/components/schermkader/schermkader';

// De voorpagina is nog niet de startpagina uit het ontwerp ("Alaaf, [voornaam]"): die komt met de indeling (fase 2). Tot dan
// een gastscherm dat zegt wat er is en waar je naartoe kunt.
export default function Startpagina() {
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
