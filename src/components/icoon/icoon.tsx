// Eén plek voor alle iconen van de app. Een scherm noemt de betekenis (naam="pijl-links"), niet de set: de bron van de
// tekeningen staat in data.ts (gegenereerd uit Phosphor Icons, MIT) en is met één regel in scripts/maak-iconen.ts te
// wisselen. Zo zit er geen merknaam of bestandspad in een component.
//
// Toegankelijkheid (bouwgids 14.3): een icoon naast tekst is versiering en wordt niet voorgelezen (de standaard).
// Staat het icoon alleen, dan is `label` verplicht en krijgt het een naam voor schermlezers.

import { ICOON_DATA, type IcoonNaam } from './data';

export type { IcoonNaam };

interface Eigenschappen {
  naam: IcoonNaam;
  /** `bold` is er voor de iconen die naast vette tekst staan (plus, vinkje, download, fout, succes, kruis). */
  gewicht?: 'regular' | 'bold';
  /** Een naam voor schermlezers; alleen voor een icoon dat zonder tekst staat. */
  label?: string;
  className?: string;
}

export function Icoon({ naam, gewicht = 'regular', label, className }: Eigenschappen) {
  const gewichten: { regular: readonly string[]; bold?: readonly string[] } = ICOON_DATA[naam];
  const paden = (gewicht === 'bold' ? gewichten.bold : undefined) ?? gewichten.regular;

  return (
    <svg
      viewBox="0 0 256 256"
      fill="currentColor"
      width="1em"
      height="1em"
      className={className}
      focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {paden.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
