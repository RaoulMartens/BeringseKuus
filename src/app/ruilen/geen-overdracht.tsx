// De pagina als overdragen niet kan (de activiteit is geweest, je hebt geen dienst, of de dienst wijzigt alleen het bestuur):
// een uitleg in plaats van een formulier, zoals bij afmelden. Een pagina die niets doet, laat dat zien in woorden.

import { Kaart } from '@/components/kaart/kaart';
import { Schermkader } from '@/components/schermkader/schermkader';
import { langeDag } from '@/lib/programma';

import stijl from '../afmelden/afmelden.module.css';

export function GeenOverdracht({
  activiteit,
  reden,
}: {
  activiteit: { naam: string; datum: string };
  reden: string;
}) {
  return (
    <Schermkader
      actief="start"
      titel="Dienst overdragen kan hier niet"
      terug={{ href: '/', tekst: 'Terug naar start' }}
    >
      <Kaart titel={`${activiteit.naam} — ${langeDag(activiteit.datum)}`}>
        <p className={stijl.tekst}>{reden}</p>
      </Kaart>
    </Schermkader>
  );
}
