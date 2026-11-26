'use client';

// Een keuzelijst met aankruisvakjes (Design-overdracht 3: "Keuzelijst met aankruisvakjes"), bijvoorbeeld "Voor wie":
// één of meer groepen, of iedereen. "Iedereen" is de uitkomst als er niets is aangekruist en sluit de rest uit: kruis je
// Iedereen aan, dan gaan de groepen uit; kruis je een groep aan, dan gaat Iedereen uit. Het is een gewone groep
// aankruisvakjes in een fieldset (toetsenbord: Tab en Spatie, de legenda wordt voorgelezen), geen uitklapper. Zonder
// JavaScript werkt het formulier ook: alleen de groepen worden verstuurd, geen groep betekent iedereen.

import { useState } from 'react';

import { Icoon, type IcoonNaam } from '@/components/icoon/icoon';

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
  /** De keuze "alles": het label en de toelichting ("Iedereen", "42 leden"). Zonder is het een gewone groep vakjes. */
  alles?: { label: string; toelichting?: string };
  /** Geen kader om de lijst: de vakjes staan als rijen in de kaart (een vast onderdeel van een formulier, geen uitklapmenu). */
  vast?: boolean;
  /** Wordt aangeroepen met de nieuwe keuze, voor wie het aantal wijzigingen bijhoudt. */
  onWijzig?: (gekozen: string[]) => void;
  /** Eerst één veld met de keuze (met dit icoon vooraan) en de vakjes pas na een klik, zoals "Voor wie" in het ontwerp. */
  uitklapbaar?: { icoon: IcoonNaam };
  fout?: string;
}

export function Aankruislijst({
  naam,
  legenda,
  uitleg,
  opties,
  gekozen,
  alles,
  vast,
  onWijzig,
  uitklapbaar,
  fout,
}: Eigenschappen) {
  const [gekozenNu, zetGekozen] = useState<string[]>(gekozen);
  const foutId = fout ? `${naam}-fout` : undefined;
  const uitlegId = uitleg ? `${naam}-uitleg` : undefined;
  const beschrijving = [foutId, uitlegId].filter(Boolean).join(' ') || undefined;

  function kies(nieuw: string[]) {
    zetGekozen(nieuw);
    onWijzig?.(nieuw);
  }

  function wissel(waarde: string) {
    kies(gekozenNu.includes(waarde) ? gekozenNu.filter((w) => w !== waarde) : [...gekozenNu, waarde]);
  }

  // Uitklapbaar: een veld met wat er is gekozen ("Iedereen", "Bestuur, Raad van Elf"); een klik toont de vakjes eronder. Ze blijven
  // in de pagina als ze dicht zijn (verborgen, niet weg), dus de keuze gaat ook dicht gewoon mee met het formulier.
  const [open, zetOpen] = useState(Boolean(fout));
  const lijstId = `${naam}-lijst`;
  const samenvatting =
    gekozenNu.length === 0
      ? (alles?.label ?? 'Niets gekozen')
      : opties
          .filter((optie) => gekozenNu.includes(optie.waarde))
          .map((optie) => optie.label)
          .join(', ');

  return (
    <fieldset className={stijl.groep} aria-describedby={beschrijving}>
      <legend className={stijl.legenda}>{legenda}</legend>
      {uitklapbaar && (
        <button
          type="button"
          className={stijl.keuzeveld}
          aria-expanded={open}
          aria-controls={lijstId}
          onClick={() => zetOpen(!open)}
        >
          <span className={stijl.keuzeIcoon}>
            <Icoon naam={uitklapbaar.icoon} />
          </span>
          <span className={stijl.keuzeTekst}>{samenvatting}</span>
          <span className={[stijl.chevron, open ? stijl.chevronOpen : undefined].filter(Boolean).join(' ')}>
            <Icoon naam="chevron-omlaag" />
          </span>
        </button>
      )}
      <ul
        id={lijstId}
        hidden={uitklapbaar ? !open : undefined}
        className={[stijl.lijst, vast ? stijl.vast : undefined].filter(Boolean).join(' ')}
      >
        {alles && (
          <li>
            <label className={stijl.optie}>
              <input type="checkbox" checked={gekozenNu.length === 0} onChange={() => kies([])} />
              <span className={stijl.label}>{alles.label}</span>
              {alles.toelichting && <span className={stijl.toelichting}>{alles.toelichting}</span>}
            </label>
          </li>
        )}
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
