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

/** De afmeldingen op volgorde van datum. */
export function sorteerAfgemeld(rijen: AfgemeldRij[]): AfgemeldRij[] {
  return [...rijen].sort(vergelijk);
}

/** De regel van een rij: de rol, en bij een activiteit met meer dan één dienst zijn het er meerdere ("werker en drankhaler"). */
export function rolTekst(rollen: string[], label: (rol: string) => string | null): string {
  const namen = rollen.map((rol) => (label(rol) ?? rol).toLowerCase());
  return namen.join(' en ');
}

/** De tekst onder een teller of een kaart: "3 komende" of "nog geen diensten". */
export function aantalKomende(aantal: number): string {
  return aantal === 0 ? 'nog geen diensten' : `${aantal} komende`;
}
