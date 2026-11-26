'use client';

// Het telefoonnummer op Mijn account: eerst lezen, dan wijzigen (ontwerp 24-11-2026, UC-011). Staat er een nummer, dan zie je het als tekst
// met een knop Wijzig; die opent het veld met Opslaan en Annuleren. Is er nog geen nummer, dan staat het veld meteen open (zonder
// Annuleren: er is niets om naar terug te gaan). Het nummer klopt als het met 0 of + begint (de server controleert en de database
// controleert nog eens); na het opslaan sta je terug in de leesweergave met de melding dat het gelukt is. Een fout houdt het veld open,
// met wat je typte; Annuleren brengt je dan terug naar het nummer dat is opgeslagen.

import { useActionState, useState, type ReactNode } from 'react';

import { Knop } from '@/components/knop/knop';
import { Verzendknop } from '@/components/knop/verzendknop';
import { Melding } from '@/components/melding/melding';
import { Veld } from '@/components/veld/veld';

import { zetTelefoon, type TelefoonStaat } from './acties';
import stijl from './mijn.module.css';

export function Telefoonformulier({ nummer, onderaan }: { nummer: string; onderaan?: ReactNode }) {
  const [staat, actie] = useActionState<TelefoonStaat, FormData>(zetTelefoon, {
    nummer,
    bewaard: nummer,
    fout: null,
    opgeslagen: false,
  });
  // Wijzigen en annuleren gelden voor de staat waarin je klikte: na een verstuurd formulier is er een nieuwe staat, dus ben je terug in
  // de leesweergave (bij een fout houdt `staat.fout` het veld open, tot je annuleert).
  const [wijzigtIn, setWijzigtIn] = useState<TelefoonStaat | null>(null);
  const [geannuleerdIn, setGeannuleerdIn] = useState<TelefoonStaat | null>(null);
  const heeftBewaard = staat.bewaard !== '';
  const toonFout = staat.fout !== null && geannuleerdIn !== staat;
  const veldOpen = !heeftBewaard || wijzigtIn === staat || toonFout;

  if (!veldOpen) {
    return (
      <div className={stijl.lees}>
        {staat.opgeslagen && <Melding soort="succes">Je nummer is opgeslagen.</Melding>}
        <div className={stijl.leesRij}>
          <div className={stijl.leesTekst}>
            <span className={stijl.leesLabel}>Telefoonnummer</span>
            <strong className={stijl.nummer}>{staat.bewaard}</strong>
          </div>
          <Knop type="button" soort="secundair" onClick={() => setWijzigtIn(staat)}>
            Wijzig<span className={stijl.verborgen}> telefoonnummer</span>
          </Knop>
        </div>
        {onderaan}
      </div>
    );
  }

  return (
    <form action={actie} className={stijl.telefoon}>
      <Veld
        id="telefoon"
        name="telefoon"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        label="Telefoonnummer"
        hulp="Begin met 0 of +, bijvoorbeeld 06 12 34 56 78."
        maxLength={30}
        defaultValue={toonFout ? staat.nummer : staat.bewaard}
        key={toonFout ? 'getypt' : `bewaard-${staat.bewaard}`}
        {...(toonFout && staat.fout ? { fout: staat.fout } : {})}
      />
      <div className={stijl.knoppen}>
        <Verzendknop soort="positief" icoon="opslaan" bezigTekst="Bezig met opslaan…">
          Opslaan
        </Verzendknop>
        {heeftBewaard && (
          <Knop
            type="button"
            soort="secundair"
            onClick={() => {
              setWijzigtIn(null);
              setGeannuleerdIn(staat);
            }}
          >
            Annuleren
          </Knop>
        )}
      </div>
    </form>
  );
}
