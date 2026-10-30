// Het datumblok in een lijstrij (docs/visueel/stijl.css, sectie 13h): de dag groot, de weekdag klein; de maand staat al in
// de kop van de kaart. Het blok is versiering bij de tekst van de rij (de datum staat er ook voor schermlezers), daarom
// verborgen voor schermlezers en vervangen door een onzichtbare volledige datum.

import stijl from './datumblok.module.css';

interface Eigenschappen {
  weekdag: string;
  dag: string;
  /** De hele datum voor schermlezers, bijvoorbeeld "vr 22 januari". */
  lang: string;
  /** Vandaag: het blok in de themakleur. */
  vandaag?: boolean;
}

export function Datumblok({ weekdag, dag, lang, vandaag }: Eigenschappen) {
  return (
    <span className={[stijl.blok, vandaag ? stijl.vandaag : undefined].filter(Boolean).join(' ')}>
      <span className={stijl.alleenSchermlezer}>{lang}</span>
      <span aria-hidden="true" className={stijl.dag}>
        {dag}
      </span>
      <span aria-hidden="true" className={stijl.weekdag}>
        {weekdag}
      </span>
    </span>
  );
}
