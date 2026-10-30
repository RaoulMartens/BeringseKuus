// Een label met een status ("concept", "gepubliceerd", "geannuleerd", of een eigen tekst), docs/visueel/stijl.css sectie
// 10 en 13i. Een label zegt de status, niet de tijd (ontwerpbesluit). Kleur én icoon én tekst dragen de betekenis.

import type { ReactNode } from 'react';

import { Icoon, type IcoonNaam } from '@/components/icoon/icoon';

import stijl from './statuslabel.module.css';

export type Status = 'concept' | 'gepubliceerd' | 'geannuleerd' | 'neutraal';

const ICOON: Record<Status, IcoonNaam | undefined> = {
  concept: 'concept',
  gepubliceerd: 'succes',
  geannuleerd: 'fout',
  neutraal: undefined,
};

const KLASSE: Record<Status, string | undefined> = {
  concept: stijl.concept,
  gepubliceerd: stijl.gepubliceerd,
  geannuleerd: stijl.geannuleerd,
  neutraal: undefined,
};

interface Eigenschappen {
  status?: Status;
  children: ReactNode;
}

export function Statuslabel({ status = 'neutraal', children }: Eigenschappen) {
  const icoon = ICOON[status];
  return (
    <span
      className={[stijl.label, KLASSE[status], icoon ? undefined : stijl.zonderIcoon]
        .filter(Boolean)
        .join(' ')}
    >
      {icoon && <Icoon naam={icoon} />}
      {children}
    </span>
  );
}
