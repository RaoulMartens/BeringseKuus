// Mijn diensten (UC-007, V8 5.7): de plekken waar het lid zelf op staat, op datum, met wat al geweest is apart en de afmeldingen in
// een eigen blok. Alles hier is zuivere logica zonder database, zodat de grenzen met tests vast te leggen zijn. Wat een lid mag zien
// beslist de view mijn_diensten (R13, R15, R22); dit zet de rijen in de volgorde en de blokken van het scherm.
//
// "Mijn diensten" toont alleen plekken, niet "aanwezig zonder dienst": iedereen staat standaard op aanwezig (R1), en dat zou het
// overzicht gelijk maken aan het programma (besluit 15-10-2026).

/** Eén eigen plek bij een activiteit. */
export interface DienstRij {
  activiteitId: string;
  naam: string;
  datum: string;
  starttijd: string | null;
  locatie: string | null;
  /** De rol, zoals de database hem kent ("werker"). */
  rol: string;
  eindigtOm: string;
}

/** Een activiteit waarvoor het lid is afgemeld. */
export interface AfgemeldRij {
  activiteitId: string;
  naam: string;
  datum: string;
  starttijd: string | null;
  locatie: string | null;
}

export interface MijnDiensten {
  /** Nog niet voorbij (het eindmoment ligt na nu), op volgorde. */
  komend: DienstRij[];
  /** Voorbij (R16), de laatste eerst, zoals het programma. */
  geweest: DienstRij[];
}

type Datumregel = { datum: string; starttijd: string | null; naam: string };

function vergelijk(a: Datumregel, b: Datumregel): number {
  if (a.datum !== b.datum) return a.datum < b.datum ? -1 : 1;
  const ta = a.starttijd ?? '99:99';
  const tb = b.starttijd ?? '99:99';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.naam.localeCompare(b.naam, 'nl');
}

/** Wat voorbij is, beslist het eindmoment: het exacte eindmoment telt als geweest (R16). */
function isVoorbij(eindigtOm: string, nu: Date): boolean {
  const einde = Date.parse(eindigtOm);
  if (Number.isNaN(einde) || Number.isNaN(nu.getTime())) throw new Error('ongeldig moment');
  return einde <= nu.getTime();
}

/** Deelt de eigen plekken in: komend op volgorde, geweest met het laatste eerst. */
export function splitsDiensten(rijen: DienstRij[], nu: Date): MijnDiensten {
  const gesorteerd = [...rijen].sort(vergelijk);
  return {
    komend: gesorteerd.filter((rij) => !isVoorbij(rij.eindigtOm, nu)),
    geweest: gesorteerd.filter((rij) => isVoorbij(rij.eindigtOm, nu)).reverse(),
  };
}

/** Waar een dienst van het seizoen staat: gedaan, komt nog, of afgemeld. */
export type SeizoenStaat = 'gedaan' | 'komt' | 'afgemeld';

/** Eén regel van "Je seizoen": een dienst of een afmelding, op datum. */
export interface SeizoenStop {
  activiteitId: string;
  naam: string;
  datum: string;
  /** De rol, zoals de database hem kent; leeg bij een afmelding (je had geen dienst meer). */
  rol: string | null;
  staat: SeizoenStaat;
}

/**
 * Je seizoen (ontwerp 24-11-2026): de diensten van het hele seizoen op één lijn, op datum: wat al gedaan is, wat nog komt en waarvoor je
 * bent afgemeld. Een activiteit staat er één keer: waarvoor je bent afgemeld, is geen dienst meer (afmelden met een dienst kan niet
 * zonder vervanger), dus komt hij uit de afmeldingen en niet uit de diensten.
 */
export function maakSeizoenslijn(diensten: MijnDiensten, afgemeld: AfgemeldRij[]): SeizoenStop[] {
  const dienst = (rij: DienstRij, staat: SeizoenStaat): SeizoenStop => ({
    activiteitId: rij.activiteitId,
    naam: rij.naam,
    datum: rij.datum,
    rol: rij.rol,
    staat,
  });
  const afmelding = (rij: AfgemeldRij): SeizoenStop => ({
    activiteitId: rij.activiteitId,
    naam: rij.naam,
    datum: rij.datum,
    rol: null,
    staat: 'afgemeld',
  });
  const stops = [
    ...diensten.geweest.map((rij) => dienst(rij, 'gedaan')),
    ...diensten.komend.map((rij) => dienst(rij, 'komt')),
    ...afgemeld.map(afmelding),
  ];
  return stops.sort(
    (a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0) || a.naam.localeCompare(b.naam, 'nl'),
  );
}

/** De afmeldingen op volgorde van datum. */
export function sorteerAfgemeld(rijen: AfgemeldRij[]): AfgemeldRij[] {
  return [...rijen].sort(vergelijk);
}

/** De regel van een rij: de rol, en bij een activiteit met meer dan één dienst zijn het er meerdere ("werker en drankhaler"). */
export function rolTekst(rollen: string[], label: (rol: string) => string | null): string {
  const namen = rollen.map((rol) => (label(rol) ?? rol).toLowerCase());
  return namen.join(' en ');
}
