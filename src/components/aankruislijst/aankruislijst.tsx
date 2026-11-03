'use client';

// Een keuzelijst met aankruisvakjes (Design-overdracht 3: "Keuzelijst met aankruisvakjes"), bijvoorbeeld "Voor wie":
// één of meer groepen, of iedereen. "Iedereen" is de uitkomst als er niets is aangekruist en sluit de rest uit: kruis je
// Iedereen aan, dan gaan de groepen uit; kruis je een groep aan, dan gaat Iedereen uit. Het is een gewone groep
// aankruisvakjes in een fieldset (toetsenbord: Tab en Spatie, de legenda wordt voorgelezen), geen uitklapper. Zonder
// JavaScript werkt het formulier ook: alleen de groepen worden verstuurd, geen groep betekent iedereen.

import { useState } from 'react';

import stijl from './aankruislijst.module.css';

export interface Optie {
  waarde: string;
  label: string;
  /** "9 leden". */
  toelichting?: string;
}

interface Eigenschappen {
  /** De naam van de formulierwaarde; elke aangekruiste optie wordt onder deze naam verstuurd. */
  naam: string;
  legenda: string;
  uitleg?: string;
  opties: Optie[];
  /** De waarden die nu zijn aangekruist; leeg betekent "alles". */
  gekozen: string[];
  /** De keuze "alles": het label en de toelichting ("Iedereen", "42 leden"). */
  alles: { label: string; toelichting?: string };
  fout?: string;
}

export function Aankruislijst({ naam, legenda, uitleg, opties, gekozen, alles, fout }: Eigenschappen) {
  const [gekozenNu, zetGekozen] = useState<string[]>(gekozen);
  const foutId = fout ? `${naam}-fout` : undefined;
  const uitlegId = uitleg ? `${naam}-uitleg` : undefined;
  const beschrijving = [foutId, uitlegId].filter(Boolean).join(' ') || undefined;

  function wissel(waarde: string) {
    zetGekozen((vorige) =>
      vorige.includes(waarde) ? vorige.filter((w) => w !== waarde) : [...vorige, waarde],
    );
  }

  return (
    <fieldset className={stijl.groep} aria-describedby={beschrijving}>
      <legend className={stijl.legenda}>{legenda}</legend>
      <ul className={stijl.lijst}>
        <li>
          <label className={stijl.optie}>
            <input type="checkbox" checked={gekozenNu.length === 0} onChange={() => zetGekozen([])} />
            <span className={stijl.label}>{alles.label}</span>
            {alles.toelichting && <span className={stijl.toelichting}>{alles.toelichting}</span>}
          </label>
        </li>
        {opties.map((optie) => (
          <li key={optie.waarde}>
            <label className={stijl.optie}>
              <input
                type="checkbox"
                name={naam}
                value={optie.waarde}
                checked={gekozenNu.includes(optie.waarde)}
                onChange={() => wissel(optie.waarde)}
              />
              <span className={stijl.label}>{optie.label}</span>
              {optie.toelichting && <span className={stijl.toelichting}>{optie.toelichting}</span>}
            </label>
          </li>
        ))}
      </ul>
      {uitleg && (
        <p id={uitlegId} className={stijl.uitleg}>
          {uitleg}
        </p>
      )}
      {fout && (
        <p id={foutId} role="alert" className={stijl.fout}>
          {fout}
        </p>
      )}
    </fieldset>
  );
}
