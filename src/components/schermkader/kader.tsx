// De indeling van een scherm zelf, zonder iets op te vragen: de bovenbalk, het kopvlak en de kolommen. Schermkader haalt
// het menu en de gebruiker op en geeft ze hierheen. Dit deel kent geen database en geen cookies, en mag daarom ook in een
// onderdeel dat in de browser draait (de foutpagina, die moet werken als de server of de database niet antwoordt).

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Bovenbalk, type MenuOnderdeel } from '@/components/bovenbalk/bovenbalk';
import { Icoon } from '@/components/icoon/icoon';
import { Kopvlak } from '@/components/kopvlak/kopvlak';
import { VERENIGING } from '@/lib/vereniging';

import stijl from './schermkader.module.css';

interface Eigenschappen {
  onderdelen?: MenuOnderdeel[];
  /** De ingelogde persoon in de bovenbalk. */
  gebruiker?: { voornaam: string; href: string };
  titel: string;
  datum?: string;
  terug?: { href: string; tekst: string };
  zijkolom?: ReactNode;
  children: ReactNode;
}

export function Kader({
  onderdelen = [],
  gebruiker,
  titel,
  datum,
  terug,
  zijkolom,
  children,
}: Eigenschappen) {
  return (
    <>
      <Bovenbalk merk={VERENIGING.naam} onderdelen={onderdelen} gebruiker={gebruiker} />
      <main>
        <Kopvlak titel={titel} datum={datum} />
        <div className={stijl.inhoud}>
          <div className={stijl.hoofd}>
            {terug && (
              <p className={stijl.terug}>
                <Link href={terug.href}>
                  <Icoon naam="pijl-links" />
                  {terug.tekst}
                </Link>
              </p>
            )}
            {children}
          </div>
          {zijkolom && <div className={stijl.zij}>{zijkolom}</div>}
        </div>
      </main>
    </>
  );
}
