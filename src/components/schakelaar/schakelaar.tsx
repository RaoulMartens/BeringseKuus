'use client';

// De schakelaar (docs/visueel/stijl.css, sectie 22): aan of uit voor één ding, met "Aan" of "Uit" ernaast zodat het niet alleen aan de
// kleur te zien is. Groen = aan. Een echte knop met role="switch" (toetsenbord: spatie of enter), geen aankruisvakje: een schakelaar werkt
// meteen, een vakje hoort bij een formulier dat je daarna bewaart. Wat hij bedient staat als verborgen tekst in de knop (`naam`) en niet
// als aria-label naast de zichtbare tekst (axe: label-content-name-mismatch).

import stijl from './schakelaar.module.css';

interface Eigenschappen {
  /** Wat de schakelaar aan of uit zet, zoals een schermlezer het voorleest ("Bak bijhouden bij deze activiteit"). */
  naam: string;
  aan: boolean;
  onWissel: (aan: boolean) => void;
}

export function Schakelaar({ naam, aan, onWissel }: Eigenschappen) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={aan}
      className={stijl.schakelaar}
      onClick={() => onWissel(!aan)}
    >
      <span className={stijl.verborgen}>{naam}</span>
      <span
        className={[stijl.spoor, aan ? stijl.aan : undefined].filter(Boolean).join(' ')}
        aria-hidden="true"
      />
      <span className={stijl.tekst} aria-hidden="true">
        {aan ? 'Aan' : 'Uit'}
      </span>
    </button>
  );
}
