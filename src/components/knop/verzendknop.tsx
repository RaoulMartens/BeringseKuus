'use client';

// Een verzendknop met een wachtstand: zolang het formulier wordt verstuurd, is de knop uit en staat er "even geduld". Zo maakt
// dubbel klikken geen tweede afmelding of overdracht (F2-05); de database houdt het ook zelf tegen (al_afgemeld), dit is er
// voor het gevoel van de lid: er gebeurt iets. Alleen voor knoppen die in het formulier staan.

import { useFormStatus } from 'react-dom';

import { Knop, type KnopSoort } from './knop';

import type { IcoonNaam } from '@/components/icoon/icoon';
import type { ReactNode } from 'react';

interface Eigenschappen {
  soort?: KnopSoort;
  icoon?: IcoonNaam;
  vol?: boolean;
  /** De tekst terwijl het formulier wordt verstuurd. */
  bezigTekst?: string;
  children: ReactNode;
}

export function Verzendknop({ soort, icoon, vol, bezigTekst = 'Even geduld…', children }: Eigenschappen) {
  const { pending } = useFormStatus();
  return (
    <Knop type="submit" soort={soort} icoon={pending ? undefined : icoon} vol={vol} disabled={pending}>
      {pending ? bezigTekst : children}
    </Knop>
  );
}
