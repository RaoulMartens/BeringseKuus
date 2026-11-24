// Het kader om een scherm (docs/visueel): de bovenbalk over de volle breedte, daaronder het kopvlak met de titel, en de
// inhoud. De bovenbalk is de banner, de rest staat in <main> (landmarks, bouwgids 14.3).
//
// Twee soorten scherm:
//  - voor wie is ingelogd: het menu (Start, Programma, Mijn diensten), voor wie beheerder is of kan worden de knop Beheer naast de
//    naam (alleen op een groot scherm; op een telefoon staat Beheer op Mijn account), en de naam;
//  - voor een gast (`gast`): alleen de naam van de vereniging, zonder menu. Dat zijn het inloggen, de pagina's achter de link
//    in de mail en de foutpagina's. Een gastscherm vraagt niets aan de database: ook als die niet antwoordt, werkt het
//    (de storingspagina mag niet van Supabase afhangen).
//
// De indeling is een hoofdkolom van hooguit 680 px, met eventueel een zijkolom van 380 px ernaast (ontwerpregel: geen volle
// breedte; past iets niet, maak de inhoud compacter). Op een telefoon staat alles onder elkaar. Wie Beheer ziet, beslist de
// bovenbalk; of iemand daadwerkelijk in beheer mag, beslist de database. De indeling zelf staat in Kader.

import type { ReactNode } from 'react';

import type { MenuOnderdeel } from '@/components/bovenbalk/bovenbalk';
import { haalBeheerstatus, heeftBeheerknop } from '@/lib/beheer';
import { huidigeGebruiker } from '@/lib/gebruiker';

import { Kader } from './kader';

export type Onderdeel = 'start' | 'programma' | 'mijndiensten' | 'beheer';

interface Eigenschappen {
  /** In welk onderdeel van het menu je bent; leeg als het scherm in geen van de onderdelen valt (Mijn account). */
  actief?: Onderdeel;
  /** Een scherm zonder menu en zonder database, voor wie niet is ingelogd of als er iets mis is. */
  gast?: boolean;
  /** De titel van het scherm: de <h1>. */
  titel: string;
  /** De grote begroeting van het welkomscherm; het kopvlak blijft even hoog. */
  groot?: boolean;
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
  const metBeheer = heeftBeheerknop(beheerstatus);
  // Mijn diensten staat achter Programma: het is jouw deel van het programma (ontwerp 24-11-2026). Beheer is geen onderdeel meer
  // maar een knop naast je naam, zodat de balk voor een beheerder niet langer is dan voor een lid.
  const onderdelen: MenuOnderdeel[] = [
    { href: '/', label: 'Start', stip: 1, actief: actief === 'start' },
    { href: '/programma', label: 'Programma', stip: 2, actief: actief === 'programma' },
    { href: '/programma/mijn', label: 'Mijn diensten', stip: 3, actief: actief === 'mijndiensten' },
  ];
  const beheer = metBeheer ? { href: '/beheer', actief: actief === 'beheer' } : undefined;
  return { onderdelen, beheer, gebruiker };
}

export async function Schermkader({
  actief,
  gast,
  titel,
  groot,
  datum,
  terug,
  zijkolom,
  children,
}: Eigenschappen) {
  const { onderdelen, beheer, gebruiker } = gast
    ? { onderdelen: [], beheer: undefined, gebruiker: null }
    : await menuEnGebruiker(actief);

  return (
    <Kader
      onderdelen={onderdelen}
      beheer={beheer}
      gebruiker={gebruiker ? { voornaam: gebruiker.voornaam, href: '/mijn' } : undefined}
      titel={titel}
      groot={groot}
      datum={datum}
      terug={terug}
      zijkolom={zijkolom}
    >
      {children}
    </Kader>
  );
}
