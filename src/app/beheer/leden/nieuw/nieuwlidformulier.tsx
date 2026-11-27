'use client';

// Het formulier en het statuspaneel van "Nieuw lid" (wireframe admin-lid-nieuw). De ingevulde waarden staan in de layout (nieuwlidstaat.tsx), zodat
// ze blijven staan als je naar de bevestigingspagina gaat en terugkomt. Een fout van de database (bijvoorbeeld: dit adres is al van een lid) staat
// hier boven het formulier, met de link naar dat lid.

import Link from 'next/link';

import { Aankruislijst } from '@/components/aankruislijst/aankruislijst';
import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';
import { Statuspaneel } from '@/components/statuspaneel/statuspaneel';
import { Veld } from '@/components/veld/veld';
import { AANMERKINGEN } from '@/lib/leden';

import stijl from '../leden.module.css';
import { useNieuwLid } from './nieuwlidstaat';

interface Groep {
  id: string;
  naam: string;
}

export function Nieuwlidformulier({ groepen }: { groepen: Groep[] }) {
  const { waarden, zet, staat } = useNieuwLid();
  const adresFout = staat.bestaand ? 'Dit e-mailadres is al in gebruik.' : undefined;

  return (
    <form className={stijl.formulier} onSubmit={(e) => e.preventDefault()} noValidate>
      {staat.melding && (
        <Melding soort="fout" rol="alert">
          {staat.melding}{' '}
          {staat.bestaand && (
            <Link href={`/beheer/leden/${staat.bestaand.lidId}`}>Naar {staat.bestaand.naam}</Link>
          )}
        </Melding>
      )}
      <Kaart titel="Naam" label>
        <div className={stijl.veldrij}>
          <Veld
            id="voornaam"
            label="Voornaam"
            autoComplete="off"
            maxLength={100}
            value={waarden.voornaam}
            onChange={(e) => zet({ voornaam: e.target.value })}
          />
          <Veld
            id="achternaam"
            label="Achternaam"
            autoComplete="off"
            maxLength={100}
            value={waarden.achternaam}
            onChange={(e) => zet({ achternaam: e.target.value })}
          />
        </div>
      </Kaart>
      <Kaart titel="Inloggen" label>
        <Veld
          id="email"
          type="email"
          inputMode="email"
          label="E-mailadres"
          autoComplete="off"
          maxLength={254}
          hulp="Hiermee logt het lid in, met een code per mail. Controleer het goed: na de eerste keer inloggen kun je het hier niet meer wijzigen."
          fout={adresFout}
          value={waarden.email}
          onChange={(e) => zet({ email: e.target.value })}
        />
      </Kaart>
      <Kaart>
        <Veld
          id="telefoon"
          type="tel"
          inputMode="tel"
          label="Telefoonnummer (niet verplicht)"
          autoComplete="off"
          maxLength={30}
          hulp="Het lid kan het later zelf invullen op Mijn account. Leden zien het alleen bij activiteiten waar dit lid eindverantwoordelijke is."
          value={waarden.telefoon}
          onChange={(e) => zet({ telefoon: e.target.value })}
        />
      </Kaart>
      <Kaart>
        <Aankruislijst
          naam="groep"
          legenda="Groepen"
          uitleg="Kies minstens één groep. Leden zien alleen activiteiten van hun groepen."
          opties={groepen.map((g) => ({ waarde: g.id, label: g.naam }))}
          gekozen={waarden.groepen}
          vast
          onWijzig={(groepen) => zet({ groepen })}
        />
      </Kaart>
      <Kaart>
        <Aankruislijst
          naam="aanmerking"
          legenda="Bijzondere rollen"
          uitleg="Wie dit niet mag, kun je bij het indelen toch kiezen. Er staat dan “nog niet aangemerkt” bij de naam."
          opties={AANMERKINGEN.map((a) => ({ waarde: a.waarde, label: a.label }))}
          gekozen={waarden.aanmerkingen}
          vast
          onWijzig={(aanmerkingen) => zet({ aanmerkingen })}
        />
      </Kaart>
    </form>
  );
}

/** Het paneel: wat er nog nodig is, en de knop naar de bevestigingspagina (uit tot alles er is). */
export function Nieuwlidpaneel() {
  const { nodig } = useNieuwLid();
  const klaar = nodig.length === 0;
  return (
    <Statuspaneel
      status={klaar ? 'Klaar om toe te voegen' : 'Nog niet compleet'}
      uitleg={
        klaar
          ? 'Je ziet eerst nog een controle. Dan gaat de uitnodiging per mail weg.'
          : `Nog nodig: ${nodig.join(', ')}.`
      }
    >
      {klaar ? (
        <Knop href="/beheer/leden/nieuw/bevestigen" soort="positief">
          Lid toevoegen
        </Knop>
      ) : (
        <Knop type="button" soort="positief" disabled>
          Lid toevoegen
        </Knop>
      )}
    </Statuspaneel>
  );
}
