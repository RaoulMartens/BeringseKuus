'use client';

// De knoppen van de bevestigingspagina voor afmelden: een toelichting die alleen het bestuur leest, Afmelden bevestigen en
// Annuleren (wireframe afmelden-bevestigen: een bevestigingsscherm heeft precies twee knoppen, doen of niet doen). Faalt het
// afmelden, dan staat de reden erboven en blijft het lid hier; slaagt het, dan stuurt de server naar "Je bent afgemeld".

import { useActionState } from 'react';

import { Verzendknop } from '@/components/knop/verzendknop';
import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';
import { Tekstvak } from '@/components/veld/tekstvak';
import { MAX_TOELICHTING, type AfmeldStaat } from '@/lib/afmelden';

import { meldAf } from '../acties';
import stijl from '../afmelden.module.css';

const START: AfmeldStaat = { melding: null };

export function Afmeldformulier({ activiteitId, terugHref }: { activiteitId: string; terugHref: string }) {
  const [staat, actie] = useActionState<AfmeldStaat, FormData>(meldAf, START);

  return (
    <form action={actie} className={stijl.formulier}>
      <input type="hidden" name="activiteit_id" value={activiteitId} />
      <Tekstvak
        id="toelichting"
        name="toelichting"
        label="Toelichting (optioneel)"
        hulp="Alleen het bestuur leest dit mee. Laat leeg als je niets kwijt wilt."
        maxLength={MAX_TOELICHTING}
        rows={3}
      />
      {staat.melding && (
        <Melding soort="fout" rol="alert">
          {staat.melding}
        </Melding>
      )}
      <div className={stijl.knoppen}>
        <Verzendknop soort="negatief" bezigTekst="Bezig met afmelden…">
          Afmelden bevestigen
        </Verzendknop>
        <Knop href={terugHref} soort="tekst">
          Annuleren
        </Knop>
      </div>
    </form>
  );
}
