// De bovenbalk (docs/visueel/stijl.css, sectie 4): de naam van de vereniging, de onderdelen van het menu en wie is
// ingelogd. Een echte <header> met een <nav> (landmarks, bouwgids 14.3). Elk onderdeel heeft een stip in een eigen kleur
// uit het thema; de stip is versiering, de tekst draagt de betekenis. Het onderdeel waar je bent staat in `aria-current`.
//
// Beheer is geen onderdeel van het menu maar een knop naast je naam (24-11-2026), voor wie beheerder is of kan worden. Naam en
// rondje zijn samen één link naar Mijn account.
//
// Op een telefoon (smaller dan 700 px) vervalt de naam van de vereniging en van de gebruiker (ontwerpbesluit) en ook de knop
// Beheer (te krap; Beheer staat dan op Mijn account): alleen het menu en het rondje blijven.

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
  /** De knop Beheer naast de naam; leeg voor wie geen beheerder is. */
  beheer?: { href: string; actief: boolean };
  /** De ingelogde persoon: de voornaam en waar het rondje naartoe leidt. */
  gebruiker?: { voornaam: string; href: string };
}

const STIP: Record<1 | 2 | 3, string | undefined> = { 1: stijl.stip1, 2: stijl.stip2, 3: stijl.stip3 };

export function Bovenbalk({ merk, logo, onderdelen, beheer, gebruiker }: Eigenschappen) {
  return (
    <header className={stijl.balk}>
      <div className={stijl.merk}>
        {logo}
        <span className={stijl.naam}>{merk}</span>
      </div>
      {onderdelen.length > 0 && (
        <nav aria-label="Hoofdmenu" className={stijl.navigatie}>
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
      {beheer && (
        <Link
          href={beheer.href}
          className={[stijl.beheer, beheer.actief ? stijl.beheerActief : undefined].filter(Boolean).join(' ')}
          aria-current={beheer.actief ? 'page' : undefined}
        >
          Beheer
        </Link>
      )}
      {gebruiker && (
        <Link href={gebruiker.href} className={stijl.account}>
          {/* De naam van de link komt uit zijn tekst ("Mijn account (Sam)"), niet uit een aria-label: met een label naast de zichtbare
              naam vindt axe de zichtbare tekst niet in de naam (label-content-name-mismatch, WCAG 2.5.3). Op een telefoon is de naam
              alleen visueel weg, zodat hij in de naam blijft. */}
          <span className={stijl.verborgen}>Mijn account (</span>
          <span className={stijl.gebruikersnaam}>{gebruiker.voornaam}</span>
          <span className={stijl.verborgen}>)</span>
          <span className={stijl.rondje} aria-hidden="true">
            {gebruiker.voornaam.slice(0, 1).toUpperCase()}
          </span>
        </Link>
      )}
    </header>
  );
}
