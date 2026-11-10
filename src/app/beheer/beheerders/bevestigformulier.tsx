'use client';

// De knoppen van een bevestigingspagina bij "Beheerders": het werkwoord op de hoofdknop en Annuleren (ontwerpregel
// "Bevestigen"). Faalt de handeling, dan staat de reden erboven en blijft de beheerder hier; slaagt ze, dan stuurt de server
// naar het overzicht. Eén formulier voor de drie handelingen: wat anders is, zijn de actie, de verborgen velden en de knop.

import { useActionState } from 'react';

import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';

import type { BeheerderStaat } from './acties';
import stijl from './beheerders.module.css';

const START: BeheerderStaat = { melding: null };

export function Bevestigformulier({
  actie,
  velden,
  knop,
  soort = 'primair',
  terugHref,
  extra,
}: {
  actie: (vorige: BeheerderStaat, formulier: FormData) => Promise<BeheerderStaat>;
  /** De verborgen velden die de actie nodig heeft (het lid, en bij bevestigen de app die op het scherm stond). */
  velden: Record<string, string>;
  /** Het werkwoord op de knop: "Beheerder maken", "Toegang bevestigen", "Rechten intrekken". */
  knop: string;
  soort?: 'primair' | 'negatief';
  terugHref: string;
  /** Een tweede, kleinere uitweg onder de knoppen (bijvoorbeeld "Dit klopt niet"). */
  extra?: { href: string; tekst: string };
}) {
  const [staat, voerUit] = useActionState<BeheerderStaat, FormData>(actie, START);

  return (
    <form action={voerUit} className={stijl.formulier}>
      {Object.entries(velden).map(([naam, waarde]) => (
        <input key={naam} type="hidden" name={naam} value={waarde} />
      ))}
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
      {extra && (
        <p className={stijl.extra}>
          <Knop href={extra.href} soort="tekst-gevaar">
            {extra.tekst}
          </Knop>
        </p>
      )}
    </form>
  );
}
