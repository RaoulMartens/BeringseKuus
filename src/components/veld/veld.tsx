// Een invoerveld met zijn label, hulptekst en foutmelding (docs/visueel/stijl.css, sectie 7). Label, hulp en fout zijn
// aan het veld gekoppeld (for, aria-describedby, aria-invalid), zodat een schermlezer ze voorleest (bouwgids 14.3). Het
// label staat boven het veld en is er altijd: een veld zonder label bestaat niet.
//
// De foutmelding is de tekst uit het ontwerp; deze component bedenkt zelf geen tekst. `gewijzigd` toont de stip voor
// "nog niet opgeslagen" (beheer).

import type { ComponentPropsWithoutRef } from 'react';

import stijl from './veld.module.css';

type Eigenschappen = Omit<
  ComponentPropsWithoutRef<'input'>,
  'id' | 'className' | 'aria-describedby' | 'aria-invalid'
> & {
  id: string;
  label: string;
  /** Uitleg onder het veld, bijvoorbeeld "6 cijfers". */
  hulp?: string;
  /** De foutmelding; met een fout krijgt het veld de foutstaat. */
  fout?: string;
  /** Een wijziging die nog niet is opgeslagen. */
  gewijzigd?: boolean;
};

export function Veld({ id, label, hulp, fout, gewijzigd, ...invoer }: Eigenschappen) {
  const hulpId = hulp ? `${id}-hulp` : undefined;
  const foutId = fout ? `${id}-fout` : undefined;
  const beschrijving = [foutId, hulpId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={stijl.veld}>
      <label htmlFor={id} className={stijl.label}>
        {label}
      </label>
      <div className={stijl.invoer}>
        <input
          {...invoer}
          id={id}
          className={[stijl.input, fout ? stijl.fout : undefined, gewijzigd ? stijl.gewijzigd : undefined]
            .filter(Boolean)
            .join(' ')}
          aria-invalid={fout ? true : undefined}
          aria-describedby={beschrijving}
        />
      </div>
      {fout && (
        <p id={foutId} role="alert" className={stijl.foutTekst}>
          {fout}
        </p>
      )}
      {hulp && (
        <p id={hulpId} className={stijl.hulp}>
          {hulp}
        </p>
      )}
    </div>
  );
}
