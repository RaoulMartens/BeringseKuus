// Een knop (docs/visueel/stijl.css, sectie 6). Het is een echte <button> (of een <a> als er een href is), geen div: dat
// is wat het ontwerp-HTML niet had en bouwgids 14.3 eist (toetsenbord, focus, schermlezer).
//
// De soort volgt wat de knop doet, niet hoe hij eruitziet:
//   primair      de hoofdactie in de themakleur
//   positief     maken of doorgaan (groen); een statuskleur, dus in elk thema gelijk
//   negatief     opgeven of weghalen met gevolgen (rood)
//   secundair    een tweede keuze: alleen een rand
//   gevaar       gevaarlijke keuze die niet de hoofdactie is: witte knop met rode rand
//   tekst        een knop met alleen een rand (Annuleren)
//   tekst-gevaar een link-achtige rode tekst (Concept verwijderen)

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Icoon, type IcoonNaam } from '@/components/icoon/icoon';

import stijl from './knop.module.css';

export type KnopSoort =
  'primair' | 'positief' | 'negatief' | 'secundair' | 'gevaar' | 'tekst' | 'tekst-gevaar';

const KLASSE: Record<KnopSoort, string | undefined> = {
  primair: stijl.primair,
  positief: stijl.positief,
  negatief: stijl.negatief,
  secundair: stijl.secundair,
  gevaar: stijl.gevaar,
  tekst: stijl.tekst,
  'tekst-gevaar': stijl.tekstGevaar,
};

interface Gedeeld {
  soort?: KnopSoort;
  /** Een icoon voor de tekst. Naast vette tekst is een simpel icoon in het vette gewicht (plus, vinkje). */
  icoon?: IcoonNaam;
  icoonGewicht?: 'regular' | 'bold';
  /** Over de volle breedte van het paneel of de balk. */
  vol?: boolean;
  children: ReactNode;
}

type Eigenschappen = Gedeeld &
  (
    | { href: string; type?: never; disabled?: never; naam?: never; waarde?: never }
    | {
        href?: never;
        type?: 'button' | 'submit';
        disabled?: boolean;
        /** Voor een formulier met meer dan één knop: welke knop is gebruikt. */
        naam?: string;
        waarde?: string;
      }
  );

export function Knop(eigenschappen: Eigenschappen) {
  const { soort = 'primair', icoon, icoonGewicht, vol, children } = eigenschappen;
  const klasse = [stijl.knop, KLASSE[soort], vol ? stijl.vol : undefined].filter(Boolean).join(' ');
  const inhoud = (
    <>
      {icoon && <Icoon naam={icoon} gewicht={icoonGewicht} />}
      {children}
    </>
  );

  if (eigenschappen.href !== undefined) {
    return (
      <Link href={eigenschappen.href} className={klasse}>
        {inhoud}
      </Link>
    );
  }
  return (
    <button
      type={eigenschappen.type ?? 'button'}
      className={klasse}
      disabled={eigenschappen.disabled}
      name={eigenschappen.naam}
      value={eigenschappen.waarde}
    >
      {inhoud}
    </button>
  );
}
