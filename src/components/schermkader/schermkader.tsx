// Het kader om een scherm voor wie is ingelogd (docs/visueel): de bovenbalk over de volle breedte, daaronder het kopvlak met
// de titel, en de inhoud in het midden. De bovenbalk is de banner, de rest staat in <main> (landmarks, bouwgids 14.3).
//
// De bovenbalk toont Beheer alleen aan wie beheerder is of kan worden; wie geen beheerder is, ziet het menu van een lid
// (ontwerp: het raadslid heeft alleen Start en Programma). Of iemand daadwerkelijk in beheer mag, beslist de database.

import type { ReactNode } from 'react';

import { Bovenbalk, type MenuOnderdeel } from '@/components/bovenbalk/bovenbalk';
import { Kopvlak } from '@/components/kopvlak/kopvlak';
import { haalBeheerstatus } from '@/lib/beheer';
import { huidigeGebruiker } from '@/lib/gebruiker';
import { VERENIGING } from '@/lib/vereniging';

import stijl from './schermkader.module.css';

export type Onderdeel = 'start' | 'programma' | 'beheer';

interface Eigenschappen {
  /** In welk onderdeel van het menu je bent. */
  actief: Onderdeel;
  /** De titel van het scherm: de <h1>. */
  titel: string;
  /** Een kleine regel boven de titel. */
  datum?: string;
  children: ReactNode;
}

export async function Schermkader({ actief, titel, datum, children }: Eigenschappen) {
  const [gebruiker, beheerstatus] = await Promise.all([huidigeGebruiker(), haalBeheerstatus()]);
  const metBeheer = beheerstatus !== null && beheerstatus !== 'geen_beheerder' && beheerstatus !== 'geen_lid';

  const onderdelen: MenuOnderdeel[] = [
    { href: '/', label: 'Start', stip: 1, actief: actief === 'start' },
    { href: '/programma', label: 'Programma', stip: 2, actief: actief === 'programma' },
    ...(metBeheer
      ? [{ href: '/beheer', label: 'Beheer', stip: 3 as const, actief: actief === 'beheer' }]
      : []),
  ];

  return (
    <>
      <Bovenbalk
        merk={VERENIGING.naam}
        onderdelen={onderdelen}
        gebruiker={gebruiker ? { voornaam: gebruiker.voornaam, href: '/mijn' } : undefined}
      />
      <main>
        <Kopvlak titel={titel} datum={datum} />
        <div className={stijl.inhoud}>{children}</div>
      </main>
    </>
  );
}
