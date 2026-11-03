'use client';

// Het formulier voor een activiteit (UC-004, wireframes admin-activiteit-nieuw en admin-activiteit-voor-wie-concept): wanneer
// en waar, voor wie, de rolbezetting en het afmelden. Opslaan (de knop staat in het statuspaneel, naast dit formulier) stuurt
// alles in één keer naar de server (acties.ts). Een fout komt bij het veld, en wat de beheerder had ingevuld blijft staan.
// De controle in de browser is uit (noValidate): de teksten van de server zijn de teksten uit het ontwerp, en voor een
// schermlezer zijn ze overal hetzelfde.

import { useActionState, useEffect, useRef } from 'react';

import { Aankruislijst } from '@/components/aankruislijst/aankruislijst';
import { Kaart } from '@/components/kaart/kaart';
import { Melding } from '@/components/melding/melding';
import { Veld } from '@/components/veld/veld';
import { Tekstvak } from '@/components/veld/tekstvak';
import { TEKENS_NAAM, TEKENS_NOTITIE } from '@/lib/activiteitformulier';

import { slaActiviteitOp, type FormulierStaat } from './acties';
import { Plekken, type BestaandePlek, type Eindverantwoordelijke } from './plekken';

import stijl from './activiteitformulier.module.css';

export const FORMULIER_ID = 'activiteit-formulier';

export interface Begin {
  tekst: Record<string, string>;
  groepen: string[];
}

export interface Groep {
  id: string;
  naam: string;
  leden: number;
}

interface Eigenschappen {
  /** Leeg bij een nieuwe activiteit. */
  activiteitId: string | null;
  versie: number | null;
  begin: Begin;
  groepen: Groep[];
  aantalLeden: number;
  plekken: BestaandePlek[];
  eindverantwoordelijke: Eindverantwoordelijke;
}

const START: FormulierStaat = { fouten: {}, melding: null, waarden: null, kenmerk: 'start' };

function ledenTekst(aantal: number): string {
  return `${aantal} ${aantal === 1 ? 'lid' : 'leden'}`;
}

export function Activiteitformulier({
  activiteitId,
  versie,
  begin,
  groepen,
  aantalLeden,
  plekken,
  eindverantwoordelijke,
}: Eigenschappen) {
  const [staat, actie] = useActionState<FormulierStaat, FormData>(slaActiviteitOp, START);
  const formulier = useRef<HTMLFormElement>(null);
  const { fouten } = staat;
  const heeftFouten = Object.keys(fouten).length > 0;

  // Na een fout naar het eerste veld met een fout, zodat toetsenbord en schermlezer er meteen zijn.
  useEffect(() => {
    if (staat.waarden) formulier.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [staat]);

  // Wat er was ingevuld komt terug na een fout; anders de waarde van de activiteit.
  const waarde = (veld: string): string => staat.waarden?.tekst[veld] ?? begin.tekst[veld] ?? '';

  return (
    <form id={FORMULIER_ID} action={actie} ref={formulier} noValidate className={stijl.formulier}>
      {activiteitId && <input type="hidden" name="activiteit_id" value={activiteitId} />}
      {versie !== null && <input type="hidden" name="versie" value={versie} />}

      {staat.melding && (
        <Melding soort="fout" rol="alert">
          {staat.melding}
        </Melding>
      )}
      {!staat.melding && heeftFouten && (
        <Melding soort="fout" rol="alert">
          Het opslaan is niet gelukt. Kijk bij de gemarkeerde velden wat er moet worden aangepast.
        </Melding>
      )}

      <Kaart
        titel="Wanneer en waar"
        ondertitel="Velden met * zijn verplicht om te kunnen publiceren. Opslaan als concept kan altijd, ook halfaf."
      >
        <div className={stijl.velden}>
          <Veld
            id="naam"
            name="naam"
            label="Naam *"
            maxLength={TEKENS_NAAM}
            defaultValue={waarde('naam')}
            fout={fouten.naam}
          />
          <Veld
            id="datum"
            name="datum"
            label="Datum *"
            type="date"
            defaultValue={waarde('datum')}
            fout={fouten.datum}
          />
          <div className={stijl.rij}>
            <Veld
              id="verzameltijd"
              name="verzameltijd"
              label="Verzameltijd"
              type="time"
              defaultValue={waarde('verzameltijd')}
              fout={fouten.verzameltijd}
            />
            <Veld
              id="starttijd"
              name="starttijd"
              label="Starttijd *"
              type="time"
              defaultValue={waarde('starttijd')}
              fout={fouten.starttijd}
            />
            <Veld
              id="eindtijd"
              name="eindtijd"
              label="Eindtijd *"
              type="time"
              defaultValue={waarde('eindtijd')}
              fout={fouten.eindtijd}
            />
          </div>
          <Veld
            id="locatie"
            name="locatie"
            label="Locatie *"
            maxLength={200}
            defaultValue={waarde('locatie')}
            fout={fouten.locatie}
          />
          <div className={stijl.rij}>
            <Veld
              id="bus_vertrektijd"
              name="bus_vertrektijd"
              label="Busvertrek"
              type="time"
              hulp="Leeg: er rijdt geen bus."
              defaultValue={waarde('bus_vertrektijd')}
              fout={fouten.bus_vertrektijd}
            />
            <Veld
              id="bus_locatie"
              name="bus_locatie"
              label="Andere vertrekplaats"
              maxLength={200}
              hulp="Leeg: de bus vertrekt van de vaste plek van de vereniging."
              defaultValue={waarde('bus_locatie')}
              fout={fouten.bus_locatie}
            />
          </div>
          <Aankruislijst
            key={staat.kenmerk}
            naam="groep"
            legenda="Voor wie"
            uitleg="Kies een of meer groepen (bijvoorbeeld Bestuur en Raad van Elf) en alleen die leden zien de activiteit."
            alles={{ label: 'Iedereen', toelichting: ledenTekst(aantalLeden) }}
            opties={groepen.map((groep) => ({
              waarde: groep.id,
              label: groep.naam,
              toelichting: ledenTekst(groep.leden),
            }))}
            gekozen={staat.waarden?.groepen ?? begin.groepen}
            fout={fouten.groepen}
          />
          <Tekstvak
            id="notitie"
            name="notitie"
            label="Belangrijk om te weten"
            maxLength={TEKENS_NOTITIE}
            hulp="Vrij tekstveld, mag later worden aangevuld."
            defaultValue={waarde('notitie')}
            fout={fouten.notitie}
          />
        </div>
      </Kaart>

      <Kaart titel="Rolbezetting">
        <Plekken
          key={staat.kenmerk}
          bestaand={plekken}
          beginWeggehaald={staat.waarden?.plekWeghalen}
          beginToegevoegd={staat.waarden?.plekToevoegen}
          eindverantwoordelijke={eindverantwoordelijke}
          fout={fouten.plekken}
        />
      </Kaart>

      <Kaart titel="Afmelden">
        <div className={stijl.velden}>
          <Veld
            id="afmeld_deadline"
            name="afmeld_deadline"
            label="Afmeld-deadline"
            type="datetime-local"
            hulp="Leeg: vrij afmelden tot het einde."
            defaultValue={waarde('afmeld_deadline')}
            fout={fouten.afmeld_deadline}
          />
          <Veld
            id="min_aanwezigen"
            name="min_aanwezigen"
            label="Minimaal aanwezig"
            type="number"
            inputMode="numeric"
            min={1}
            hulp="Zonder afmeld-deadline geldt dit minimum niet."
            defaultValue={waarde('min_aanwezigen')}
            fout={fouten.min_aanwezigen}
          />
        </div>
      </Kaart>
    </form>
  );
}
