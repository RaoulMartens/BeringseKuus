'use client';

// De knoppen van de bevestigingspagina "Dienst overnemen": het werkwoord op de hoofdknop en Annuleren. Faalt het, dan staat de reden erboven.

import { useActionState } from 'react';

import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';

import { neemDienstOver, type OvernemenStaat } from '../acties';

const START: OvernemenStaat = { melding: null };

export function Overnemenformulier({
  activiteitId,
  lidId,
  rol,
  naam,
  gepubliceerd,
}: {
  activiteitId: string;
  lidId: string;
  rol: string;
  naam: string;
  gepubliceerd: boolean;
}) {
  const [staat, voerUit, bezig] = useActionState<OvernemenStaat, FormData>(neemDienstOver, START);
  const voornaam = naam.split(' ')[0] ?? naam;

  return (
    <form action={voerUit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-group)' }}>
      <input type="hidden" name="activiteit_id" value={activiteitId} />
      <input type="hidden" name="lid_id" value={lidId} />
      <input type="hidden" name="rol" value={rol} />
      {staat.melding && (
        <Melding soort="fout" rol="alert">
          {staat.melding}
        </Melding>
      )}
      <Melding soort="let-op">
        {gepubliceerd
          ? `${voornaam} krijgt een mail dat je de dienst hebt overgenomen. Het lid wordt niet gevraagd.`
          : `Deze activiteit is nog een concept: ${voornaam} krijgt er geen mail van. Zeg het zelf.`}
      </Melding>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Knop type="submit" soort="positief" disabled={bezig}>
          Dienst overnemen
        </Knop>
        <Knop href={`/programma/${activiteitId}`} soort="tekst">
          Annuleren
        </Knop>
      </div>
    </form>
  );
}
