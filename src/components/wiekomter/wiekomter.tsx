// De kaart "Wie komt er?" (UC-010): één bolletje met initialen per lid voor wie de activiteit is. Gevuld = komt, gestippeld =
// afgemeld. De naam staat bij hover en focus en voor een schermlezer; de reden van een afmelding is er niet. Zonder JavaScript:
// de naam bij het bolletje is CSS (data-naam), het bolletje is focusbaar zodat het ook met het toetsenbord en door te tikken werkt.

import type { Raster } from '@/lib/wiekomter';

import stijl from './wiekomter.module.css';

interface Eigenschappen {
  raster: Raster;
  /** De activiteit waar het raster bij hoort: twee activiteiten op één dag hebben elk een raster. */
  activiteit: string;
  /** Zet de naam van de activiteit onder de kop; alleen als er meer dan één raster op het scherm staat. */
  metNaam?: boolean;
}

export function WieKomter({ raster, activiteit, metNaam }: Eigenschappen) {
  if (raster.leden.length === 0) return null;

  return (
    <section className={stijl.kaart} aria-label={`Wie komt er ${activiteit}`}>
      <h2 className={stijl.label}>Wie komt er?</h2>
      {metNaam && <p className={stijl.activiteit}>{activiteit}</p>}
      <p className={stijl.telling}>
        <strong>{raster.aanwezig}</strong> aanwezig <span aria-hidden="true">&middot;</span>{' '}
        <strong>{raster.afgemeld}</strong> afgemeld
      </p>
      <ul className={stijl.leden} aria-label={`Alle leden voor wie ${activiteit} is`}>
        {raster.leden.map((lid) => (
          <li
            key={lid.lidId}
            className={lid.komt ? stijl.lid : `${stijl.lid} ${stijl.af}`}
            tabIndex={0}
            data-naam={lid.naam}
            aria-label={`${lid.naam}, ${lid.komt ? 'aanwezig' : 'afgemeld'}`}
          >
            {lid.initialen}
          </li>
        ))}
      </ul>
      <div className={stijl.legenda} aria-hidden="true">
        <span>
          <span className={`${stijl.lid} ${stijl.klein}`} />
          komt
        </span>
        <span>
          <span className={`${stijl.lid} ${stijl.af} ${stijl.klein}`} />
          afgemeld
        </span>
      </div>
    </section>
  );
}
