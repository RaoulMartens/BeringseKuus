'use client';

// De knoppen van een bevestigingspagina bij "Leden": het werkwoord op de hoofdknop en Annuleren (ontwerpregel "Bevestigen"). Faalt de handeling,
// dan staat de reden erboven en blijft de beheerder hier; slaagt ze, dan stuurt de server naar het overzicht.

import { useActionState } from 'react';

import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';

import type { LedenStaat } from './acties';
import stijl from './leden.module.css';

const START: LedenStaat = { melding: null };

export function Bevestigformulier({
  actie,
  lidId,
  knop,
  soort = 'primair',
  terugHref,
}: {
  actie: (vorige: LedenStaat, formulier: FormData) => Promise<LedenStaat>;
  lidId: string;
  /** Het werkwoord op de knop: "Op inactief zetten", "Weer actief maken". */
  knop: string;
  soort?: 'primair' | 'positief' | 'negatief';
  terugHref: string;
}) {
  const [staat, voerUit] = useActionState<LedenStaat, FormData>(actie, START);

  return (
    <form action={voerUit} className={stijl.formulier}>
      <input type="hidden" name="lid_id" value={lidId} />
      {staat.melding && (
        <Melding soort="fout" rol="alert">
          {staat.melding}
        </Melding>
      )}
      <div className={stijl.knoppen}>
        <Knop type="submit" soort={soort}>
          {knop}
        </Knop>
        <Knop href={terugHref} soort="tekst">
          Annuleren
        </Knop>
      </div>
    </form>
  );
}
