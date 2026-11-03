// Het statuspaneel van een activiteit (docs/visueel/stijl.css, sectie 13: `.wf-sidebar.wf-sticky`): status als kop, de reden
// of uitleg eronder, wat er nog nodig is om te publiceren, en de knoppen. Op een groot scherm staat het rechts en blijft
// het in beeld; op een telefoon is het een balk onderaan, zodat de knoppen altijd te bereiken zijn. Het paneel staat naast
// het formulier, niet erin: de knoppen horen er met het formulier-attribuut bij (Knop, `formulier`).

import type { ReactNode } from 'react';

import stijl from './statuspaneel.module.css';

interface Eigenschappen {
  /** De status als kop: "Concept". */
  status: string;
  /** Een korte uitleg onder de kop: "Alleen het bestuur ziet deze activiteit." */
  uitleg?: string;
  /** Wat er nog nodig is om te publiceren; leeg of weggelaten als alles er is. */
  nodig?: string[];
  /** De knoppen; een paneel zonder knoppen is alleen een status. */
  children?: ReactNode;
  /** Een tekstlink helemaal onderaan, apart van de knoppen ("Concept verwijderen"); op een telefoon staat hij niet in de balk. */
  onderaan?: ReactNode;
}

export function Statuspaneel({ status, uitleg, nodig = [], children, onderaan }: Eigenschappen) {
  return (
    <section aria-labelledby="statuspaneel-kop" className={stijl.paneel}>
      <h2 id="statuspaneel-kop" className={stijl.kop}>
        {status}
      </h2>
      {uitleg && <p className={stijl.uitleg}>{uitleg}</p>}
      {nodig.length > 0 && (
        <div className={stijl.nodig}>
          <h3 className={stijl.nodigKop}>Nog nodig om te publiceren</h3>
          <ul className={stijl.lijst}>
            {nodig.map((onderdeel) => (
              <li key={onderdeel}>{onderdeel}</li>
            ))}
          </ul>
        </div>
      )}
      {children && <div className={stijl.knoppen}>{children}</div>}
      {onderaan && <div className={stijl.onderaan}>{onderaan}</div>}
    </section>
  );
}
