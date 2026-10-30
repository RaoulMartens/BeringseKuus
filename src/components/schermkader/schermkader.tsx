// Het kader om een scherm (docs/visueel): de bovenbalk over de volle breedte, daaronder het kopvlak met de titel, en de
// inhoud. De bovenbalk is de banner, de rest staat in <main> (landmarks, bouwgids 14.3).
//
// Twee soorten scherm:
//  - voor wie is ingelogd: het menu (Start, Programma, en Beheer voor wie beheerder is of kan worden) en de naam;
//  - voor een gast (`gast`): alleen de naam van de vereniging, zonder menu. Dat zijn het inloggen, de pagina's achter de link
//    in de mail en de foutpagina's. Een gastscherm vraagt niets aan de database: ook als die niet antwoordt, werkt het
//    (de storingspagina mag niet van Supabase afhangen).
//
// De indeling is een hoofdkolom van hooguit 680 px, met eventueel een zijkolom van 380 px ernaast (ontwerpregel: geen volle
// breedte; past iets niet, maak de inhoud compacter). Op een telefoon staat alles onder elkaar. Wie Beheer ziet, beslist de
// bovenbalk; of iemand daadwerkelijk in beheer mag, beslist de database. De indeling zelf staat in Kader.

import type { ReactNode } from 'react';

import type { MenuOnderdeel } from '@/components/bovenbalk/bovenbalk';
import { haalBeheerstatus } from '@/lib/beheer';
import { huidigeGebruiker } from '@/lib/gebruiker';

import { Kader } from './kader';

export type Onderdeel = 'start' | 'programma' | 'beheer';

interface Eigenschappen {
  /** In welk onderdeel van het menu je bent; leeg als het scherm in geen van de onderdelen valt (Mijn account). */
  actief?: Onderdeel;
  /** Een scherm zonder menu en zonder database, voor wie niet is ingelogd of als er iets mis is. */
  gast?: boolean;
  /** De titel van het scherm: de <h1>. */
  titel: string;
  /** Een kleine regel boven de titel. */
  datum?: string;
  /** Een link "← Terug naar …" bovenaan de inhoud. */
  terug?: { href: string; tekst: string };
  /** Een zijkolom naast de inhoud (bijvoorbeeld het statuspaneel of de agendakaart); op een telefoon komt hij eronder. */
  zijkolom?: ReactNode;
  children: ReactNode;
}

async function menuEnGebruiker(actief: Onderdeel | undefined) {
  const [gebruiker, beheerstatus] = await Promise.all([huidigeGebruiker(), haalBeheerstatus()]);
  const metBeheer = beheerstatus !== null && beheerstatus !== 'geen_beheerder' && beheerstatus !== 'geen_lid';
  const onderdelen: MenuOnderdeel[] = [
    { href: '/', label: 'Start', stip: 1, actief: actief === 'start' },
    { href: '/programma', label: 'Programma', stip: 2, actief: actief === 'programma' },
    ...(metBeheer
      ? [{ href: '/beheer', label: 'Beheer', stip: 3 as const, actief: actief === 'beheer' }]
      : []),
  ];
  return { onderdelen, gebruiker };
}

export async function Schermkader({ actief, gast, titel, datum, terug, zijkolom, children }: Eigenschappen) {
  const { onderdelen, gebruiker } = gast
    ? { onderdelen: [], gebruiker: null }
    : await menuEnGebruiker(actief);

  return (
    <Kader
      onderdelen={onderdelen}
      gebruiker={gebruiker ? { voornaam: gebruiker.voornaam, href: '/mijn' } : undefined}
      titel={titel}
      datum={datum}
      terug={terug}
      zijkolom={zijkolom}
    >
      {children}
    </Kader>
  );
}
