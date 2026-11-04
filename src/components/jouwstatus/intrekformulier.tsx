'use client';

// "Afmelding intrekken": een knop zonder bevestigingspagina, want het kan terug (afmelden kan altijd weer) en raakt niemand
// anders (ontwerpregel "Bevestigen"). Het staat in het statuspaneel en op de pagina na het afmelden. Faalt het, dan staat de
// reden boven de knop; slaagt het, dan stuurt de server naar "Je staat weer op aanwezig".

import { useActionState } from 'react';

import { Melding } from '@/components/melding/melding';
import { Verzendknop } from '@/components/knop/verzendknop';
import type { KnopSoort } from '@/components/knop/knop';
import type { AfmeldActie, AfmeldStaat } from '@/lib/afmelden';

import stijl from './jouwstatus.module.css';

const START: AfmeldStaat = { melding: null };

export function Intrekformulier({
  activiteitId,
  actie,
  label = 'Afmelding intrekken',
  soort = 'secundair',
}: {
  activiteitId: string;
  actie: AfmeldActie;
  label?: string;
  soort?: KnopSoort;
}) {
  const [staat, formActie] = useActionState<AfmeldStaat, FormData>(actie, START);
  return (
    <form action={formActie} className={stijl.intrekken}>
      <input type="hidden" name="activiteit_id" value={activiteitId} />
      {staat.melding && (
        <Melding soort="fout" rol="alert">
          {staat.melding}
        </Melding>
      )}
      <Verzendknop soort={soort} bezigTekst="Bezig met intrekken…">
        {label}
      </Verzendknop>
    </form>
  );
}
