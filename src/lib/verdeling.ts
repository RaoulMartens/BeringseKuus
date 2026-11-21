// "Wie is aan de beurt?" (UC-012, FO 9.2, bouwgids 8.2): per lid hoeveel diensten hij dit seizoen heeft, zodat het bestuur kan zien wie er
// nog niet is geweest en die kan invullen. Het systeem telt en laat zien; het bestuur beslist. Zuivere logica zonder netwerk en zonder
// database; de pagina en het formulier lezen de plekken en de leden.
//
// Wat telt: elke bezette plek van een lid bij een concept of gepubliceerde activiteit van het seizoen, behalve de bak (geen dienst, R23).
// Een geannuleerde activiteit telt niet mee (BG 5.4). Puur aantallen, geen weging naar zwaarte, oud papier telt mee (FO 9.2). Externe
// helpers staan er niet in (BG 9): dit overzicht is voor de leden.

import { initialen } from './wiekomter';

/** Een bezette plek van een lid bij een activiteit van het seizoen. */
export interface Dienst {
  lidId: string;
}

export interface VerdelingLid {
  id: string;
  voornaam: string;
  achternaam: string;
}

export interface VerdelingRij {
  lidId: string;
  naam: string;
  initialen: string;
  aantal: number;
}

export interface Verdeling {
  /** Alle leden, de minste diensten eerst; gelijk op alfabet. */
  rijen: VerdelingRij[];
  /** Hoeveel leden nog geen dienst hebben. */
  nogNiet: number;
}

/** Hoe donker het bolletje is: gestippeld bij geen dienst, licht bij één of twee, donker bij drie of meer. */
export type Trap = 'geen' | 'weinig' | 'veel';

export function trapVan(aantal: number): Trap {
  return aantal === 0 ? 'geen' : aantal < 3 ? 'weinig' : 'veel';
}

/** "nog geen dienst dit seizoen", "1 dienst dit seizoen", "3 diensten dit seizoen". */
export function dienstenTekst(aantal: number): string {
  if (aantal === 0) return 'nog geen dienst dit seizoen';
  return `${aantal} ${aantal === 1 ? 'dienst' : 'diensten'} dit seizoen`;
}

/** Het aantal diensten per lid, uit de bezette plekken van het seizoen. */
export function telDiensten(diensten: readonly Dienst[]): Map<string, number> {
  const telling = new Map<string, number>();
  for (const dienst of diensten) telling.set(dienst.lidId, (telling.get(dienst.lidId) ?? 0) + 1);
  return telling;
}

export function maakVerdeling(leden: readonly VerdelingLid[], diensten: readonly Dienst[]): Verdeling {
  const telling = telDiensten(diensten);
  const rijen = leden
    .map((lid): VerdelingRij => ({
      lidId: lid.id,
      naam: `${lid.voornaam} ${lid.achternaam}`,
      initialen: initialen(lid.voornaam, lid.achternaam),
      aantal: telling.get(lid.id) ?? 0,
    }))
    .sort((a, b) => a.aantal - b.aantal || a.naam.localeCompare(b.naam, 'nl'));
  return { rijen, nogNiet: rijen.filter((rij) => rij.aantal === 0).length };
}
