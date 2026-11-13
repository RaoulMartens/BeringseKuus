'use client';

// Alle dagen van een reeks tegelijk bewerken. Eén formulier voor wat voor alle dagen gelijk is: tijden, plaats, notitie, voor wie en de
// eindverantwoordelijke. Een veld toont de gedeelde waarde van de dagen; verschillen de dagen, dan staat het veld leeg met "Verschilt per
// dag", en blijven de dagen zoals ze zijn tenzij je er iets invult. "Opslaan als concept" en "Alle N dagen publiceren" doen alles of
// niets (de database controleert elke dag). Naam en datum horen niet bij "voor alle dagen" en staan er niet in.

import { useActionState } from 'react';

import { Aankruislijst } from '@/components/aankruislijst/aankruislijst';
import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Melding } from '@/components/melding/melding';
import { Tekstvak } from '@/components/veld/tekstvak';
import { Veld } from '@/components/veld/veld';
import type { ReeksVeld, Startwaarde } from '@/lib/reeksbewerken';

import type { Groep } from '../activiteitformulier';

import { wijzigReeks, type ReeksStaat } from './acties';
import stijl from './reeks.module.css';

const START: ReeksStaat = { melding: null, fouten: {}, waarden: null, kenmerk: 'start' };

export interface ReeksDag {
  id: string;
  versie: number;
  datum: string;
  /** "ma 4 januari". */
  label: string;
}

export interface Lidkeuze {
  id: string;
  naam: string;
  heeftTelefoon: boolean;
}

interface Eigenschappen {
  dagen: ReeksDag[];
  start: Record<ReeksVeld, Startwaarde>;
  groepenStart: { ids: string[]; verschilt: boolean };
  groepen: Groep[];
  aantalLeden: number;
  leden: Lidkeuze[];
  /** De eindverantwoordelijke die alle dagen al hebben, of leeg als de dagen verschillen of er niemand is. */
  eindverantwoordelijke: string;
}

export function Reeksformulier({
  dagen,
  start,
  groepenStart,
  groepen,
  aantalLeden,
  leden,
  eindverantwoordelijke,
}: Eigenschappen) {
  const [staat, voerUit] = useActionState<ReeksStaat, FormData>(wijzigReeks, START);
  const waarden = staat.waarden;
  const aantal = dagen.length;

  const waarde = (veld: ReeksVeld) => (waarden ? waarden.velden[veld] : start[veld].waarde);
  const hulp = (veld: ReeksVeld) =>
    start[veld].verschilt ? 'Verschilt per dag. Laat leeg om ze zo te laten.' : undefined;
  const placeholder = (veld: ReeksVeld) => (start[veld].verschilt ? 'Verschilt per dag' : undefined);
  const veldProps = (veld: ReeksVeld, label: string) => ({
    id: `reeks-${veld}`,
    name: veld,
    label,
    defaultValue: waarde(veld),
    placeholder: placeholder(veld),
    hulp: staat.fouten[veld] ? undefined : hulp(veld),
    fout: staat.fouten[veld],
    autoComplete: 'off',
  });

  return (
    <form key={staat.kenmerk} action={voerUit} className={stijl.formulier} noValidate>
      <input
        type="hidden"
        name="dagen"
        value={JSON.stringify(dagen.map(({ id, versie, datum }) => ({ id, versie, datum })))}
      />
      <input type="hidden" name="initieel" value={JSON.stringify(start)} />

      {staat.melding && (
        <Melding soort="fout" rol="alert">
          {staat.melding}
        </Melding>
      )}

      <Kaart
        titel={`Voor alle ${aantal} dagen`}
        ondertitel="Wat je hier invult, krijgen alle dagen. Naam en datum blijven per dag."
      >
        <div className={stijl.velden}>
          <Veld {...veldProps('verzameltijd', 'Verzameltijd')} />
          <Veld {...veldProps('starttijd', 'Starttijd')} />
          <Veld {...veldProps('eindtijd', 'Eindtijd')} />
          <Veld {...veldProps('bus_vertrektijd', 'Busvertrek')} />
          <div className={stijl.breed}>
            <Veld {...veldProps('locatie', 'Locatie')} />
          </div>
          <div className={stijl.breed}>
            <Veld {...veldProps('bus_locatie', 'Plaats van de bus')} />
          </div>
          <div className={stijl.breed}>
            <Tekstvak
              id="reeks-notitie"
              name="notitie"
              label="Belangrijk om te weten"
              defaultValue={waarde('notitie')}
              placeholder={placeholder('notitie')}
              hulp={staat.fouten.notitie ? undefined : hulp('notitie')}
              fout={staat.fouten.notitie}
            />
          </div>
        </div>
      </Kaart>

      <Kaart titel="Voor wie">
        <label className={stijl.wijzigen}>
          <input type="checkbox" name="groepen_wijzigen" defaultChecked={waarden?.groepenWijzigen ?? false} />
          <span>Voor wie voor alle dagen instellen</span>
        </label>
        {groepenStart.verschilt && (
          <p className={stijl.uitleg}>
            De dagen hebben nu verschillende groepen. Zet het vinkje aan om ze gelijk te maken.
          </p>
        )}
        <Aankruislijst
          naam="groepen"
          legenda="Wie ziet deze activiteiten"
          opties={groepen.map((groep) => ({
            waarde: groep.id,
            label: groep.naam,
            toelichting: `${groep.leden} leden`,
          }))}
          gekozen={waarden ? waarden.groepen : groepenStart.ids}
          alles={{ label: 'Iedereen', toelichting: `${aantalLeden} leden` }}
        />
      </Kaart>

      <Kaart
        titel="Eindverantwoordelijke"
        ondertitel="Wie leden bellen bij een vraag. Nodig om te publiceren, met een telefoonnummer."
      >
        <div className={stijl.selectveld}>
          <label htmlFor="reeks-eindverantwoordelijke" className={stijl.label}>
            Eindverantwoordelijke voor alle dagen
          </label>
          <select
            id="reeks-eindverantwoordelijke"
            name="eindverantwoordelijke"
            className={stijl.select}
            defaultValue={waarden?.eindverantwoordelijke ?? eindverantwoordelijke}
          >
            <option value="">Niet wijzigen</option>
            {leden.map((lid) => (
              <option key={lid.id} value={lid.id}>
                {lid.naam}
                {lid.heeftTelefoon ? '' : ' (geen telefoonnummer)'}
              </option>
            ))}
          </select>
        </div>
      </Kaart>

      <Kaart titel="De dagen" ondertitel="Een dag afzonderlijk bewerken kan ook." lijst>
        <Lijst>
          {dagen.map((dag) => (
            <Lijstrij key={dag.id} href={`/beheer/activiteiten/${dag.id}`}>
              {dag.label}
            </Lijstrij>
          ))}
        </Lijst>
      </Kaart>

      <div className={stijl.knoppen}>
        <Knop type="submit" naam="actie" waarde="publiceren">
          {`Alle ${aantal} dagen publiceren`}
        </Knop>
        <Knop type="submit" soort="secundair" naam="actie" waarde="opslaan">
          Opslaan als concept
        </Knop>
        <Knop href="/beheer" soort="tekst">
          Annuleren
        </Knop>
      </div>
      <p className={stijl.noot}>
        Leden zien de dagen pas als je publiceert. Faalt één dag, dan verandert er voor geen enkele dag iets.
      </p>
    </form>
  );
}
