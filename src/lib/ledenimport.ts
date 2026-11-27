// Meerdere leden tegelijk toevoegen met een Excel-bestand (UC-013 AF-7, wireframes admin-leden-importeren en -controle): het bestand lezen,
// de groepen koppelen en de uitkomst van de controle (leden_importeren met proef) in woorden. Zuivere logica zonder database. De regels zelf
// (geldig adres, uniek adres, alles of niets) staan in de database; dit is het lezen en het vertalen.

import { koppelGroepen, type Groep } from '@/lib/activiteitenimport';
import type { Cel, XlsxFoutCode } from '@/lib/xlsx';

export const MAX_LEDEN = 200;

export interface LedenRegel {
  /** Het rijnummer in het bestand (de kop is rij 1), zodat een fout te vinden is. */
  nr: number;
  voornaam: string;
  achternaam: string;
  email: string;
  telefoon: string;
  /** Groepsnamen gescheiden door een puntkomma, zoals in het bestand. */
  groepen: string;
}

export interface LedenLeesFout {
  code: XlsxFoutCode | 'kolom_ontbreekt' | 'geen_regels' | 'te_veel_regels';
  kolommen?: string[];
}

export interface LedenLeesUitkomst {
  regels: LedenRegel[];
  /** De rijnummers van voorbeeldregels ("Voorbeeld: ..."): overgeslagen en gemeld. */
  voorbeelden: number[];
}

type Kolom = 'voornaam' | 'achternaam' | 'email' | 'groepen' | 'telefoon';
const VERPLICHT: Kolom[] = ['voornaam', 'achternaam', 'email', 'groepen'];
/** Hoe de kopjes in het bestand heten, en voor welke kolom ze gelden. */
const ALIAS: Record<string, Kolom> = {
  voornaam: 'voornaam',
  achternaam: 'achternaam',
  email: 'email',
  'e-mail': 'email',
  'e-mailadres': 'email',
  emailadres: 'email',
  groepen: 'groepen',
  groep: 'groepen',
  telefoon: 'telefoon',
  telefoonnummer: 'telefoon',
};
const WEERGAVE: Record<Kolom, string> = {
  voornaam: 'voornaam',
  achternaam: 'achternaam',
  email: 'e-mailadres',
  groepen: 'groepen',
  telefoon: 'telefoon',
};

function tekst(cel: Cel | undefined): string {
  if (cel === null || cel === undefined) return '';
  return String(cel).trim();
}

/** Een telefoonnummer: Excel maakt van 0612345678 het getal 612345678; met een 0 ervoor is het weer het nummer. */
function telefoon(cel: Cel | undefined): string {
  if (typeof cel === 'number' && Number.isInteger(cel) && String(cel).length === 9) return `0${cel}`;
  return tekst(cel);
}

/**
 * De regels uit de cellen van het eerste tabblad. De eerste rij is de kop; de volgorde van de kolommen is vrij, kolommen die we niet kennen worden
 * genegeerd. Lege rijen en voorbeeldregels (een voornaam die met "Voorbeeld:" begint) tellen niet mee; de voorbeeldregels worden wel gemeld.
 */
export function leesLedenRegels(rijen: Cel[][]): LedenLeesUitkomst | LedenLeesFout {
  const index = new Map<Kolom, number>();
  (rijen[0] ?? []).forEach((cel, i) => {
    const kolom = ALIAS[tekst(cel).toLowerCase().replace(/\s+/g, '')] ?? ALIAS[tekst(cel).toLowerCase()];
    if (kolom && !index.has(kolom)) index.set(kolom, i);
  });
  const ontbreekt = VERPLICHT.filter((k) => !index.has(k));
  if (ontbreekt.length > 0) return { code: 'kolom_ontbreekt', kolommen: ontbreekt.map((k) => WEERGAVE[k]) };

  const cel = (rij: Cel[], kolom: Kolom): Cel | undefined => {
    const i = index.get(kolom);
    return i === undefined ? undefined : rij[i];
  };

  const regels: LedenRegel[] = [];
  const voorbeelden: number[] = [];
  rijen.slice(1).forEach((rij, i) => {
    if (rij.every((c) => c === null || tekst(c) === '')) return;
    const nr = i + 2;
    const voornaam = tekst(cel(rij, 'voornaam'));
    if (/^voorbeeld\s*:/i.test(voornaam)) {
      voorbeelden.push(nr);
      return;
    }
    regels.push({
      nr,
      voornaam,
      achternaam: tekst(cel(rij, 'achternaam')),
      email: tekst(cel(rij, 'email')),
      telefoon: telefoon(cel(rij, 'telefoon')),
      groepen: tekst(cel(rij, 'groepen')),
    });
  });
  if (regels.length === 0) return { code: 'geen_regels' };
  if (regels.length > MAX_LEDEN) return { code: 'te_veel_regels' };
  return { regels, voorbeelden };
}

export function isLedenLeesFout(uitkomst: LedenLeesUitkomst | LedenLeesFout): uitkomst is LedenLeesFout {
  return 'code' in uitkomst;
}

/** Wat een fout bij het lezen van het bestand zegt, voor de beheerder. */
export function vertaalLedenLeesfout(fout: LedenLeesFout): string {
  switch (fout.code) {
    case 'geen_xlsx':
      return 'Dit is geen Excel-bestand (.xlsx). Download het sjabloon, vul het in en kies het bestand opnieuw.';
    case 'macro':
      return 'Dit bestand heeft macro’s of is beveiligd met een wachtwoord. Sla het op als gewoon Excel-bestand (.xlsx) en probeer het opnieuw.';
    case 'te_groot':
      return `Dit bestand is te groot om te lezen (hooguit 1 MB, ${MAX_LEDEN} leden en één tabblad). Maak het kleiner en probeer het opnieuw.`;
    case 'beschadigd':
      return 'Dit bestand is beschadigd en niet te lezen. Open het in Excel, sla het opnieuw op en probeer het nog eens.';
    case 'leeg':
      return 'Dit bestand heeft geen tabblad met gegevens.';
    case 'kolom_ontbreekt':
      return `Er ontbreken kolommen in de eerste rij: ${(fout.kolommen ?? []).join(', ')}. Gebruik het sjabloon, of zet deze kolomnamen bovenaan.`;
    case 'geen_regels':
      return 'Er staan geen leden in dit bestand. Vul onder de kopregel een regel per lid in, en wis de voorbeeldregels.';
    case 'te_veel_regels':
      return `Er staan meer dan ${MAX_LEDEN} leden in dit bestand. Splits het in twee bestanden.`;
  }
}

/** Een regel zoals de database hem wil (leden_importeren), met de groepen als id's. Een groep die niet bestaat komt er niet in: dat meldt de controle apart. */
export interface LedenServerregel {
  regel: number;
  voornaam: string;
  achternaam: string;
  email: string;
  telefoon: string;
  groepen: string[];
}

export function naarLedenServerregels(regels: LedenRegel[], groepen: Groep[]): LedenServerregel[] {
  return regels.map((r) => ({
    regel: r.nr,
    voornaam: r.voornaam,
    achternaam: r.achternaam,
    email: r.email,
    telefoon: r.telefoon,
    groepen: koppelGroepen(r.groepen, groepen).ids,
  }));
}

/** De groepsnamen in een regel die niet bestaan, per rijnummer: de database kent alleen id's en zou zeggen "geen groep". */
export function onbekendeGroepen(regels: LedenRegel[], groepen: Groep[]): Map<number, string[]> {
  const uit = new Map<number, string[]>();
  for (const r of regels) {
    const { onbekend } = koppelGroepen(r.groepen, groepen);
    if (onbekend.length > 0) uit.set(r.nr, onbekend);
  }
  return uit;
}

// ===== De uitkomst van de controle =====

export type RegelStatus = 'toevoegen' | 'bestaat_al' | 'fout';

export interface ControleRegel {
  regel: number;
  status: RegelStatus;
  code?: string;
  voornaam: string;
  achternaam: string;
  email: string;
}

export interface LedenControle {
  regels: ControleRegel[];
  toevoegen: number;
  bestaatAl: number;
  fouten: number;
}

/** Leest het antwoord van leden_importeren; null als het niet de verwachte vorm heeft. */
export function leesLedenControle(json: unknown): LedenControle | null {
  if (typeof json !== 'object' || json === null) return null;
  const o = json as Record<string, unknown>;
  if (!Array.isArray(o.regels)) return null;
  const regels: ControleRegel[] = [];
  for (const r of o.regels) {
    if (typeof r !== 'object' || r === null) return null;
    const x = r as Record<string, unknown>;
    if (
      typeof x.regel !== 'number' ||
      (x.status !== 'toevoegen' && x.status !== 'bestaat_al' && x.status !== 'fout')
    )
      return null;
    regels.push({
      regel: x.regel,
      status: x.status,
      code: typeof x.code === 'string' ? x.code : undefined,
      voornaam: typeof x.voornaam === 'string' ? x.voornaam : '',
      achternaam: typeof x.achternaam === 'string' ? x.achternaam : '',
      email: typeof x.email === 'string' ? x.email : '',
    });
  }
  return {
    regels,
    toevoegen: regels.filter((r) => r.status === 'toevoegen').length,
    bestaatAl: regels.filter((r) => r.status === 'bestaat_al').length,
    fouten: regels.filter((r) => r.status === 'fout').length,
  };
}

/** Wat er mis is met een regel, in woorden. `onbekend` zijn de groepsnamen die niet bestaan, als dat de oorzaak is. */
export function regelFoutTekst(code: string | undefined, onbekend: string[] = []): string {
  if (onbekend.length > 0) {
    return onbekend.length === 1
      ? `De groep “${onbekend[0]}” bestaat niet.`
      : `De groepen ${onbekend.map((g) => `“${g}”`).join(', ')} bestaan niet.`;
  }
  switch (code) {
    case 'email_ongeldig':
      return 'Het e-mailadres klopt niet.';
    case 'email_dubbel':
      return 'Dit e-mailadres staat al eerder in het bestand.';
    case 'veld_ontbreekt':
      return 'Voornaam, achternaam of e-mailadres ontbreekt.';
    case 'veld_ongeldig':
      return 'Een naam is te lang (hooguit 100 tekens).';
    case 'groep_nodig':
      return 'Er staat geen groep bij.';
    case 'telefoon_ongeldig':
      return 'Het telefoonnummer klopt niet. Begin met 0 of +, bijvoorbeeld 06 12 34 56 78.';
    default:
      return 'Deze regel klopt niet.';
  }
}

/** De naam in een controleregel, met een noodnaam als die ontbreekt. */
export function controleNaam(r: Pick<ControleRegel, 'voornaam' | 'achternaam' | 'email'>): string {
  const naam = `${r.voornaam} ${r.achternaam}`.trim();
  return naam || r.email || 'Naam ontbreekt';
}
