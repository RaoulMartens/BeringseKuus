'use client';

// De knoppen van de bevestigingspagina voor het verwijderen van een concept: Concept verwijderen en Annuleren (wireframe
// admin-concept-verwijderen). Faalt het verwijderen, dan staat de reden erboven en blijft de beheerder hier; slaagt het, dan
// stuurt de server naar het overzicht.

import { useActionState } from 'react';

import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';

import { verwijderConcept, type PubliceerStaat } from '../../acties';

import stijl from './verwijderen.module.css';

const START: PubliceerStaat = { melding: null };

export function Verwijderformulier({ activiteitId, terugHref }: { activiteitId: string; terugHref: string }) {
  const [staat, actie] = useActionState<PubliceerStaat, FormData>(verwijderConcept, START);

  return (
    <form action={actie} className={stijl.formulier}>
      <input type="hidden" name="activiteit_id" value={activiteitId} />
      {staat.melding && (
        <Melding soort="fout" rol="alert">
          {staat.melding}
        </Melding>
      )}
      <div className={stijl.knoppen}>
        <Knop type="submit" soort="negatief">
          Concept verwijderen
        </Knop>
        <Knop href={terugHref} soort="tekst">
          Annuleren
        </Knop>
      </div>
    </form>
  );
}
