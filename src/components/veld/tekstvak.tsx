// Een tekstvak met meer regels (het veld "Belangrijk om te weten"), met dezelfde opbouw, labels en foutstaat als Veld
// (docs/visueel/stijl.css, sectie 7): label, hulp en fout zijn aan het veld gekoppeld.

import type { ComponentPropsWithoutRef } from 'react';

import stijl from './veld.module.css';

type Eigenschappen = Omit<
  ComponentPropsWithoutRef<'textarea'>,
  'id' | 'className' | 'aria-describedby' | 'aria-invalid'
> & {
  id: string;
  label: string;
  hulp?: string;
  fout?: string;
  /** Een wijziging die nog niet is opgeslagen. */
  gewijzigd?: boolean;
};

export function Tekstvak({ id, label, hulp, fout, gewijzigd, ...invoer }: Eigenschappen) {
  const hulpId = hulp ? `${id}-hulp` : undefined;
  const foutId = fout ? `${id}-fout` : undefined;
  const beschrijving = [foutId, hulpId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={stijl.veld}>
      <label htmlFor={id} className={stijl.label}>
        {label}
      </label>
      <div className={stijl.invoer}>
        <textarea
          {...invoer}
          id={id}
          className={[
            stijl.input,
            stijl.tekstvak,
            fout ? stijl.fout : undefined,
            gewijzigd ? stijl.gewijzigd : undefined,
          ]
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
