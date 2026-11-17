'use client';

// Het formulier voor je eigen telefoonnummer op Mijn account. Het nummer klopt als het met 0 of + begint (de server controleert en
// de database controleert nog eens); na het opslaan staat het nummer in de vorm die is bewaard en meldt het scherm dat het gelukt is.

import { useActionState } from 'react';

import { Verzendknop } from '@/components/knop/verzendknop';
import { Melding } from '@/components/melding/melding';
import { Veld } from '@/components/veld/veld';
import { TELEFOON_HULP } from '@/lib/telefoon';

import { zetTelefoon, type TelefoonStaat } from './acties';
import stijl from './mijn.module.css';

export function Telefoonformulier({ nummer }: { nummer: string }) {
  const [staat, actie] = useActionState<TelefoonStaat, FormData>(zetTelefoon, {
    nummer,
    fout: null,
    opgeslagen: false,
  });

  return (
    <form action={actie} className={stijl.telefoon}>
      <Veld
        id="telefoon"
        name="telefoon"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        label="Telefoonnummer"
        hulp={TELEFOON_HULP}
        maxLength={30}
        defaultValue={staat.nummer}
        key={staat.opgeslagen ? staat.nummer : 'invoer'}
        {...(staat.fout ? { fout: staat.fout } : {})}
      />
      {staat.opgeslagen && <Melding soort="succes">Je nummer is opgeslagen.</Melding>}
      <div>
        <Verzendknop bezigTekst="Bezig met opslaan…">Opslaan</Verzendknop>
      </div>
    </form>
  );
}
