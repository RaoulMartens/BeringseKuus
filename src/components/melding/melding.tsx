// Een melding in de pagina (docs/visueel/stijl.css, sectie 10): informatie, let op, fout, gelukt of "je bent afgemeld".
// Kleur én icoon dragen de soort, dus ook wie geen kleur ziet weet wat voor melding het is (bouwgids 14.3).
//
// Een melding die verschijnt als gevolg van een handeling (een fout na het versturen) krijgt role="alert" en wordt
// meteen voorgelezen; een melding die er bij het laden al staat is role="status". Staat er bij een veld een fout, dan
// hoort die bij het Veld zelf (de component Veld), niet hier.

import type { ReactNode } from 'react';

import { Icoon, type IcoonNaam } from '@/components/icoon/icoon';

import stijl from './melding.module.css';

export type MeldingSoort = 'info' | 'let-op' | 'fout' | 'succes' | 'afgemeld';

const ICOON: Record<MeldingSoort, IcoonNaam> = {
  info: 'info',
  'let-op': 'waarschuwing',
  fout: 'fout',
  succes: 'succes',
  afgemeld: 'info',
};

const KLASSE: Record<MeldingSoort, string | undefined> = {
  info: stijl.info,
  'let-op': stijl.letOp,
  fout: stijl.fout,
  succes: stijl.succes,
  afgemeld: stijl.afgemeld,
};

interface Eigenschappen {
  soort?: MeldingSoort;
  /** `alert` voor een reactie op een handeling; anders `status`. */
  rol?: 'alert' | 'status';
  children: ReactNode;
}

export function Melding({ soort = 'info', rol = 'status', children }: Eigenschappen) {
  return (
    <div role={rol} className={[stijl.melding, KLASSE[soort]].filter(Boolean).join(' ')}>
      <Icoon naam={ICOON[soort]} className={stijl.icoon} />
      <div>{children}</div>
    </div>
  );
}
