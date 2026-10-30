// De bovenbalk (docs/visueel/stijl.css, sectie 4): de naam van de vereniging, de onderdelen van het menu en wie is
// ingelogd. Een echte <header> met een <nav> (landmarks, bouwgids 14.3). Elk onderdeel heeft een stip in een eigen kleur
// uit het thema; de stip is versiering, de tekst draagt de betekenis. Het onderdeel waar je bent staat in `aria-current`.
//
// Op een telefoon (smaller dan 700 px) vervalt de naam van de vereniging en van de gebruiker (ontwerpbesluit): alleen
// het menu en het rondje blijven.

import Link from 'next/link';
import type { ReactNode } from 'react';

import stijl from './bovenbalk.module.css';

export interface MenuOnderdeel {
  href: string;
  label: string;
  /** Welke themakleur de stip krijgt: 1, 2 of 3 (thema-stip-1 t/m 3). */
  stip: 1 | 2 | 3;
  /** Hier ben je nu. */
  actief?: boolean;
}

interface Eigenschappen {
  /** De naam van de vereniging, uit het thema. */
  merk: string;
  /** Het logo van de vereniging (een afbeelding met alt-tekst leeg: de naam staat ernaast). */
  logo?: ReactNode;
  onderdelen: MenuOnderdeel[];
  /** De ingelogde persoon: de voornaam en waar het rondje naartoe leidt. */
  gebruiker?: { voornaam: string; href: string };
}

const STIP: Record<1 | 2 | 3, string | undefined> = { 1: stijl.stip1, 2: stijl.stip2, 3: stijl.stip3 };

export function Bovenbalk({ merk, logo, onderdelen, gebruiker }: Eigenschappen) {
  return (
    <header className={stijl.balk}>
      <div className={stijl.merk}>
        {logo}
        <span className={stijl.naam}>{merk}</span>
      </div>
      {onderdelen.length > 0 && (
        <nav aria-label="Hoofdmenu">
          <ul className={stijl.menu}>
            {onderdelen.map((onderdeel) => (
              <li key={onderdeel.href}>
                <Link
                  href={onderdeel.href}
                  className={[
                    stijl.onderdeel,
                    STIP[onderdeel.stip],
                    onderdeel.actief ? stijl.actief : undefined,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={onderdeel.actief ? 'page' : undefined}
                >
                  {onderdeel.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div className={stijl.ruimte} />
      {gebruiker && (
        <>
          <span className={stijl.gebruikersnaam}>{gebruiker.voornaam}</span>
          <Link
            href={gebruiker.href}
            className={stijl.rondje}
            aria-label={`Mijn account (${gebruiker.voornaam})`}
          >
            <span aria-hidden="true">{gebruiker.voornaam.slice(0, 1).toUpperCase()}</span>
          </Link>
        </>
      )}
    </header>
  );
}
