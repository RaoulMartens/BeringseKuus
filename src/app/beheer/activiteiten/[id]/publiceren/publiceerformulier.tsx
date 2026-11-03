'use client';

// De knoppen van de bevestigingspagina voor publiceren: Publiceren en Annuleren (wireframe admin-publiceren). Faalt het
// publiceren, dan staat de reden erboven en blijft de beheerder hier; slaagt het, dan stuurt de server naar het overzicht.

import { useActionState } from 'react';

import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';

import { publiceerActiviteit, type PubliceerStaat } from '../../acties';

import stijl from './publiceren.module.css';

const START: PubliceerStaat = { melding: null };

export function Publiceerformulier({
  activiteitId,
  versie,
  terugHref,
}: {
  activiteitId: string;
  versie: number;
  terugHref: string;
}) {
  const [staat, actie] = useActionState<PubliceerStaat, FormData>(publiceerActiviteit, START);

  return (
    <form action={actie} className={stijl.formulier}>
      <input type="hidden" name="activiteit_id" value={activiteitId} />
      <input type="hidden" name="versie" value={versie} />
      {staat.melding && (
        <Melding soort="fout" rol="alert">
          {staat.melding}
        </Melding>
      )}
      <div className={stijl.knoppen}>
        <Knop type="submit" soort="positief">
          Publiceren
        </Knop>
        <Knop href={terugHref} soort="tekst">
          Annuleren
        </Knop>
      </div>
    </form>
  );
}
