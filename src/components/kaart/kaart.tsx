// Een kaart: een wit vlak met een titel (docs/visueel/stijl.css, sectie 5 en 9). Alle kaarttitels staan in dezelfde
// themakleur. Een kaart die uit rijen bestaat (`lijst`) heeft geen opvulling rond de rijen: ze lopen van rand tot rand,
// zoals in GitHub, Stripe en Linear (hover, markering en scheidingslijn zonder wit randje). De rijen zelf komen uit
// Lijst en Lijstrij.

import type { ReactNode } from 'react';

import stijl from './kaart.module.css';

interface Eigenschappen {
  titel?: string;
  /** Het kopniveau in de pagina; kies het niveau dat bij de plek in de koppenstructuur hoort. */
  kop?: 'h2' | 'h3';
  /** Een zachte regel onder de titel. */
  ondertitel?: string;
  /** Iets dat rechts van de titel staat, bijvoorbeeld een schakelaar. */
  actie?: ReactNode;
  /** De kaart bestaat uit een Lijst: de rijen lopen over de volle breedte. */
  lijst?: boolean;
  children: ReactNode;
}

export function Kaart({ titel, kop: Kop = 'h2', ondertitel, actie, lijst, children }: Eigenschappen) {
  const kop = titel ? (
    <div className={lijst ? stijl.lijstKop : stijl.kop}>
      {actie ? (
        <div className={stijl.titelrij}>
          <Kop className={stijl.titel}>{titel}</Kop>
          {actie}
        </div>
      ) : (
        <Kop className={stijl.titel}>{titel}</Kop>
      )}
      {ondertitel && <p className={stijl.ondertitel}>{ondertitel}</p>}
    </div>
  ) : null;

  return (
    <section className={[stijl.kaart, lijst ? stijl.lijstkaart : undefined].filter(Boolean).join(' ')}>
      {kop}
      {children}
    </section>
  );
}
