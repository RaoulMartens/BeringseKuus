// Het statuspaneel van een activiteit (docs/visueel/stijl.css, sectie 13: `.wf-sidebar.wf-sticky`): status als kop met een
// stip (leeg bij een concept, groen bij gepubliceerd), de reden of uitleg eronder, een lijn, wat er nog nodig is om te
// publiceren, en de knoppen, elk zo breed als het paneel. Een tekstlink zoals "Concept verwijderen" staat onder de knoppen,
// zonder eigen lijn. Op een groot scherm staat het rechts en blijft het in beeld; op een telefoon is het een balk onderaan,
// zodat de knoppen altijd te bereiken zijn. Het paneel staat naast het formulier, niet erin: de knoppen horen er met het
// formulier-attribuut bij (Knop, `formulier`).

import type { ReactNode } from 'react';

import stijl from './statuspaneel.module.css';

interface Eigenschappen {
  /** De status als kop: "Concept". */
  status: string;
  /** De stip voor de status: leeg (concept) of vol (gepubliceerd); weggelaten bij een andere status. */
  stip?: 'leeg' | 'vol';
  /** Een korte uitleg onder de kop: "Alleen het bestuur ziet deze activiteit." */
  uitleg?: string;
  /** Wat er nog nodig is om te publiceren; leeg of weggelaten als alles er is. */
  nodig?: string[];
  /** De knoppen; een paneel zonder knoppen is alleen een status. */
  children?: ReactNode;
  /** Tekstlinks onder de knoppen ("Zo zien leden het", "Concept verwijderen"); op een telefoon staan ze niet in de balk. */
  onderaan?: ReactNode;
}

export function Statuspaneel({ status, stip, uitleg, nodig = [], children, onderaan }: Eigenschappen) {
  const heeftInhoud = nodig.length > 0 || Boolean(children) || Boolean(onderaan);
  return (
    <section aria-labelledby="statuspaneel-kop" className={stijl.paneel}>
      <h2 id="statuspaneel-kop" className={stijl.kop}>
        {stip && (
          <span className={[stijl.stip, stip === 'vol' ? stijl.vol : undefined].filter(Boolean).join(' ')} />
        )}
        {status}
      </h2>
      {uitleg && <p className={stijl.uitleg}>{uitleg}</p>}
      {heeftInhoud && <hr className={stijl.scheiding} />}
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
