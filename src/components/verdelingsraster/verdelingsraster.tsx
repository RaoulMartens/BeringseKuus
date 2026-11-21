// Het raster van "Wie is aan de beurt?" (UC-012): hetzelfde bolletje met initialen als "Wie komt er?", met het aantal diensten als klein
// getal erop. Gestippeld = nog geen dienst, licht = één of twee, donker = drie of meer; de trap staat naast het getal, zodat kleur niet
// het enige signaal is. De naam met het aantal staat bij hover en focus (data-naam) en voor een schermlezer (aria-label); het bolletje is
// focusbaar zodat het ook met het toetsenbord en door te tikken werkt.

import { dienstenTekst, trapVan, type Verdeling } from '@/lib/verdeling';

import stijl from './verdelingsraster.module.css';

interface Eigenschappen {
  verdeling: Verdeling;
  /** "Vastelaovend 2026/2027" */
  seizoen: string;
}

const KLASSE = { geen: stijl.geen, weinig: undefined, veel: stijl.veel } as const;

export function Verdelingsraster({ verdeling, seizoen }: Eigenschappen) {
  return (
    <section className={stijl.kaart} aria-label="Alle leden en hun diensten dit seizoen">
      <h2 className={stijl.label}>
        Alle leden <span aria-hidden="true">&middot;</span> {verdeling.rijen.length}
      </h2>
      <p className={stijl.uitleg}>
        {seizoen}, de minste diensten eerst. Het getal op een bolletje is het aantal diensten; de naam staat
        erbij.
      </p>
      <ul className={stijl.leden}>
        {verdeling.rijen.map((rij) => (
          <li
            key={rij.lidId}
            className={[stijl.lid, KLASSE[trapVan(rij.aantal)]].filter(Boolean).join(' ')}
            tabIndex={0}
            data-naam={`${rij.naam} · ${rij.aantal} ${rij.aantal === 1 ? 'dienst' : 'diensten'} dit seizoen`}
            aria-label={`${rij.naam}, ${dienstenTekst(rij.aantal)}`}
          >
            {rij.initialen}
            {rij.aantal > 0 && (
              <span className={stijl.teller} aria-hidden="true">
                {rij.aantal}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className={stijl.legenda} aria-hidden="true">
        <span>
          <span className={`${stijl.lid} ${stijl.geen} ${stijl.klein}`} />
          nog geen dienst
        </span>
        <span>
          <span className={`${stijl.lid} ${stijl.klein}`} />1 of 2
        </span>
        <span>
          <span className={`${stijl.lid} ${stijl.veel} ${stijl.klein}`} />3 of meer
        </span>
      </div>
    </section>
  );
}
