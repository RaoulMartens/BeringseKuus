'use client';

// De knoppen van de bevestiging van het overdragen: Dienst overdragen en Annuleren (een bevestigingsscherm heeft precies twee knoppen,
// UX-FLOWS "Bevestiging vóór schrijfactie"). De overdracht kan het lid niet zelf terugdraaien, dus het werkwoord staat op de knop.
// Faalt het, dan staat de reden erboven; slaagt het, dan stuurt de server naar het resultaat of door naar stap 2 van afmelden.

import { useActionState } from 'react';

import { Knop } from '@/components/knop/knop';
import { Verzendknop } from '@/components/knop/verzendknop';
import { Melding } from '@/components/melding/melding';
import type { AfmeldStaat } from '@/lib/afmelden';

import stijl from '../../../afmelden/afmelden.module.css';
import { ruilDienst } from '../../acties';

const START: AfmeldStaat = { melding: null };

export function Ruilformulier({
  activiteitId,
  vervangerId,
  taak,
  terugHref,
}: {
  activiteitId: string;
  vervangerId: string;
  taak: 'afmelden' | null;
  terugHref: string;
}) {
  const [staat, actie] = useActionState<AfmeldStaat, FormData>(ruilDienst, START);

  return (
    <form action={actie} className={stijl.formulier}>
      <input type="hidden" name="activiteit_id" value={activiteitId} />
      <input type="hidden" name="vervanger_id" value={vervangerId} />
      {taak && <input type="hidden" name="taak" value={taak} />}
      {staat.melding && (
        <Melding soort="fout" rol="alert">
          {staat.melding}
        </Melding>
      )}
      <div className={stijl.knoppen}>
        <Verzendknop soort="negatief" bezigTekst="Bezig met overdragen…">
          Dienst overdragen
        </Verzendknop>
        <Knop href={terugHref} soort="tekst">
          Annuleren
        </Knop>
      </div>
    </form>
  );
}
