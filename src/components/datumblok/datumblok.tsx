// Het datumblok in een lijstrij (docs/visueel/stijl.css, sectie 13h): de dag groot, de weekdag klein; de maand staat al in
// de kop van de kaart, behalve in een lijst die maanden door elkaar toont (het beheeroverzicht): daar krijgt het blok een maand
// (`maand`). Het blok is versiering bij de tekst van de rij (de datum staat er ook voor schermlezers), daarom
// verborgen voor schermlezers en vervangen door een onzichtbare volledige datum.

import stijl from './datumblok.module.css';

interface Eigenschappen {
  weekdag: string;
  dag: string;
  /** De hele datum voor schermlezers, bijvoorbeeld "vr 22 januari". */
  lang: string;
  /** De maand kort ("feb"), onder de dag; alleen in een lijst waar de maand niet in de kop staat. */
  maand?: string;
  /** Vandaag: het blok in de themakleur. */
  vandaag?: boolean;
}

export function Datumblok({ weekdag, dag, lang, maand, vandaag }: Eigenschappen) {
  return (
    <span className={[stijl.blok, vandaag ? stijl.vandaag : undefined].filter(Boolean).join(' ')}>
      <span className={stijl.alleenSchermlezer}>{lang}</span>
      <span aria-hidden="true" className={stijl.dag}>
        {dag}
      </span>
      <span aria-hidden="true" className={stijl.weekdag}>
        {weekdag}
      </span>
      {maand && (
        <span aria-hidden="true" className={stijl.weekdag}>
          {maand}
        </span>
      )}
    </span>
  );
}
