// De Excel-import van activiteiten (UC-006, bouwgids 6.2): van de cellen die src/lib/xlsx.ts leest naar regels die de beheerder op het
// controlescherm kan nalopen, en van die regels naar wat activiteiten_bulk_aanmaken verwacht. Alles hier is zuivere logica zonder
// browser of database. De browser keurt nooit definitief goed of af: de database controleert elke regel opnieuw.
//
// Het sjabloon heeft vaste kolommen: naam, datum, verzameltijd, starttijd, eindtijd, locatie, busvertrek, notitie en voor_wie. Plekken
// per rol staan er niet in: een geïmporteerde activiteit krijgt één lege eindverantwoordelijke (de database zet die zelf).

import type { Cel, XlsxFoutCode } from '@/lib/xlsx';

export const MAX_REGELS = 200;

/** Wat de beheerder op het controlescherm ziet en kan aanpassen. Alles als tekst, zoals in een invulveld. */
export interface ImportRegel {
  /** Het rijnummer in het Excel-bestand (de kopregel is rij 1), voor meldingen. */
  nr: number;
  naam: string;
  /** YYYY-MM-DD, of leeg als de datum niet te lezen was; dan vult de beheerder hem in. */
  datum: string;
  /** HH:MM, of leeg. */
  verzameltijd: string;
  starttijd: string;
  eindtijd: string;
  locatie: string;
  busvertrek: string;
  notitie: string;
  /** De groepen zoals in Excel ("Bestuur; Raad van Elf"); leeg is iedereen. */
  voorWie: string;
  /** "Niet meenemen" zet dit uit; een weggelaten regel telt niet mee en hoeft niet te kloppen. */
  meenemen: boolean;
}

export type RegelVeld =
  | 'naam'
  | 'datum'
  | 'verzameltijd'
  | 'starttijd'
  | 'eindtijd'
  | 'locatie'
  | 'busvertrek'
  | 'notitie'
  | 'voorWie';

export interface Groep {
  id: string;
  naam: string;
}

export type ImportFoutCode = XlsxFoutCode | 'kolom_ontbreekt' | 'geen_regels' | 'te_veel_regels';

export interface ImportFout {
  code: ImportFoutCode;
  /** Bij kolom_ontbreekt: welke kolommen er ontbreken. */
  kolommen?: string[];
}

export interface ImportUitkomst {
  regels: ImportRegel[];
  /** De rijnummers van voorbeeldregels ("Voorbeeld: ..."): overgeslagen en gemeld. */
  voorbeelden: number[];
}

// ===== Datums en tijden =====

const MAANDEN: Record<string, number> = {
  jan: 1,
  januari: 1,
  feb: 2,
  februari: 2,
  mrt: 3,
  maart: 3,
  apr: 4,
  april: 4,
  mei: 5,
  jun: 6,
  juni: 6,
  jul: 7,
  juli: 7,
  aug: 8,
  augustus: 8,
  sep: 9,
  sept: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};
const WEEKDAGEN = new Set([
  'ma',
  'di',
  'wo',
  'do',
  'vr',
  'za',
  'zo',
  'maandag',
  'dinsdag',
  'woensdag',
  'donderdag',
  'vrijdag',
  'zaterdag',
  'zondag',
]);

function pad(n: number, lengte = 2): string {
  return String(n).padStart(lengte, '0');
}

/** Een echte kalenderdag (31 februari bestaat niet) in de jaren 2000 tot en met 2100, als YYYY-MM-DD; anders null. */
function maakDatum(jaar: number, maand: number, dag: number): string | null {
  if (jaar < 2000 || jaar > 2100 || maand < 1 || maand > 12 || dag < 1 || dag > 31) return null;
  const d = new Date(Date.UTC(jaar, maand - 1, dag));
  if (d.getUTCFullYear() !== jaar || d.getUTCMonth() !== maand - 1 || d.getUTCDate() !== dag) return null;
  return `${pad(jaar, 4)}-${pad(maand)}-${pad(dag)}`;
}

/**
 * Het jaar van een datum zonder jaar, uit het seizoen (bouwgids 6.2): september tot en met december horen bij het beginjaar van
 * het seizoen, januari tot en met augustus bij het eindjaar. Seizoen 2026 is 2026/2027.
 */
export function jaarVoorMaand(maand: number, seizoen: number): number {
  return maand >= 9 ? seizoen : seizoen + 1;
}

/**
 * Een datum uit een cel: een serienummer van Excel, of tekst als "11-02-2028", "11/2/28", "2028-02-11", "27 feb" of "vr 11 feb 2028".
 * Zonder jaar neemt het systeem het jaar van het seizoen. Geeft YYYY-MM-DD, of null als er geen datum van te maken is.
 */
export function leesDatum(cel: Cel, seizoen: number): string | null {
  if (cel === null) return null;
  if (typeof cel === 'number') {
    // Excel telt dagen vanaf 30-12-1899 (het serienummer 60, de niet bestaande 29-02-1900, valt ver buiten onze jaren).
    if (!Number.isFinite(cel) || cel < 36_526 || cel > 73_415) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(cel) * 86_400_000);
    return maakDatum(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const tekst = cel.trim().toLowerCase().replace(/\.$/, '');
  if (tekst === '') return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(tekst);
  if (iso) return maakDatum(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const numeriek = /^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2}|\d{4}))?$/.exec(tekst);
  if (numeriek) {
    const maand = Number(numeriek[2]);
    const jaar =
      numeriek[3] === undefined
        ? jaarVoorMaand(maand, seizoen)
        : numeriek[3].length === 2
          ? 2000 + Number(numeriek[3])
          : Number(numeriek[3]);
    return maakDatum(jaar, maand, Number(numeriek[1]));
  }

  // "vr 11 feb 2028", "11 februari", "27 feb": een eventuele weekdag erbij mag, een jaar ook.
  const woorden = tekst.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  const eerste = woorden[0];
  if (eerste && WEEKDAGEN.has(eerste.replace(/\.$/, ''))) woorden.shift();
  const mondeling = /^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/.exec(woorden.join(' '));
  if (mondeling?.[2]) {
    const maand = MAANDEN[mondeling[2].replace(/\.$/, '')];
    if (maand === undefined) return null;
    const jaar = mondeling[3] === undefined ? jaarVoorMaand(maand, seizoen) : Number(mondeling[3]);
    return maakDatum(jaar, maand, Number(mondeling[1]));
  }
  return null;
}

/**
 * Een tijd uit een cel: een deel van een dag van Excel (0,75 is 18:00), of tekst als "18:30", "18.30", "18:30:00" of "19" (19:00).
 * Geeft HH:MM, of null als er geen tijd van te maken is.
 */
export function leesTijd(cel: Cel): string | null {
  if (cel === null) return null;
  if (typeof cel === 'number') {
    if (!Number.isFinite(cel)) return null;
    if (cel >= 0 && cel < 1) {
      const minuten = Math.round(cel * 1440);
      return minuten >= 1440 ? null : `${pad(Math.floor(minuten / 60))}:${pad(minuten % 60)}`;
    }
    return Number.isInteger(cel) && cel >= 0 && cel <= 23 ? `${pad(cel)}:00` : null;
  }
  const tekst = cel.trim();
  if (tekst === '') return null;
  const m = /^(\d{1,2})(?:[:.](\d{2})(?:[:.]\d{2})?)?$/.exec(tekst);
  if (!m) return null;
  const uur = Number(m[1]);
  const minuut = m[2] === undefined ? 0 : Number(m[2]);
  return uur <= 23 && minuut <= 59 ? `${pad(uur)}:${pad(minuut)}` : null;
}

// ===== De regels uit het bestand =====

function celTekst(cel: Cel | undefined): string {
  if (cel === null || cel === undefined) return '';
  return typeof cel === 'number' ? String(cel) : cel.trim();
}

const KOLOMMEN = [
  'naam',
  'datum',
  'verzameltijd',
  'starttijd',
  'eindtijd',
  'locatie',
  'busvertrek',
  'notitie',
  'voor_wie',
] as const;
/** Zonder deze kolommen heeft het bestand geen zin; de rest mag ontbreken. */
const VERPLICHTE_KOLOMMEN = ['naam', 'datum', 'starttijd', 'locatie'] as const;

function kolomNaam(cel: Cel | undefined): string {
  return celTekst(cel).toLowerCase().replace(/\s+/g, '_');
}

/**
 * De regels uit de cellen van het eerste tabblad. De eerste rij is de kop; de volgorde van de kolommen is vrij, kolommen die we
 * niet kennen worden genegeerd. Lege rijen en voorbeeldregels (een naam die met "Voorbeeld:" begint) tellen niet mee; de
 * voorbeeldregels worden wel gemeld. Een datum zonder jaar krijgt het jaar van het seizoen.
 */
export function leesRegels(rijen: Cel[][], seizoen: number): ImportUitkomst | ImportFout {
  const kop = rijen[0] ?? [];
  const index = new Map<string, number>();
  kop.forEach((cel, i) => {
    const naam = kolomNaam(cel);
    if ((KOLOMMEN as readonly string[]).includes(naam) && !index.has(naam)) index.set(naam, i);
  });
  const ontbreekt = VERPLICHTE_KOLOMMEN.filter((k) => !index.has(k));
  if (ontbreekt.length > 0) return { code: 'kolom_ontbreekt', kolommen: [...ontbreekt] };

  const cel = (rij: Cel[], kolom: (typeof KOLOMMEN)[number]): Cel | undefined => {
    const i = index.get(kolom);
    return i === undefined ? undefined : rij[i];
  };

  const regels: ImportRegel[] = [];
  const voorbeelden: number[] = [];
  rijen.slice(1).forEach((rij, i) => {
    if (rij.every((c) => c === null || celTekst(c) === '')) return;
    const nr = i + 2;
    const naam = celTekst(cel(rij, 'naam'));
    if (/^voorbeeld\s*:/i.test(naam)) {
      voorbeelden.push(nr);
      return;
    }
    // Een datum of tijd die we niet kunnen lezen blijft leeg, zodat de beheerder hem op de regel kan invullen.
    const tijd = (kolom: 'verzameltijd' | 'starttijd' | 'eindtijd' | 'busvertrek') =>
      leesTijd(cel(rij, kolom) ?? null) ?? '';
    regels.push({
      nr,
      naam,
      datum: leesDatum(cel(rij, 'datum') ?? null, seizoen) ?? '',
      verzameltijd: tijd('verzameltijd'),
      starttijd: tijd('starttijd'),
      eindtijd: tijd('eindtijd'),
      locatie: celTekst(cel(rij, 'locatie')),
      busvertrek: tijd('busvertrek'),
      notitie: celTekst(cel(rij, 'notitie')),
      voorWie: celTekst(cel(rij, 'voor_wie')),
      meenemen: true,
    });
  });
  if (regels.length === 0) return { code: 'geen_regels' };
  if (regels.length > MAX_REGELS) return { code: 'te_veel_regels' };
  return { regels, voorbeelden };
}

export function isImportFout(uitkomst: ImportUitkomst | ImportFout): uitkomst is ImportFout {
  return 'code' in uitkomst;
}

// ===== Controle per regel =====

const MAX_NAAM = 200;
const MAX_NOTITIE = 2000;

/** De groepen uit "Bestuur; Raad van Elf": de namen, zonder lege stukjes. */
export function groepsnamen(voorWie: string): string[] {
  return voorWie
    .split(';')
    .map((naam) => naam.trim())
    .filter(Boolean);
}

/** De groepen bij een regel, en welke namen er niet bestaan (op hoofdletters na). */
export function koppelGroepen(voorWie: string, groepen: Groep[]): { ids: string[]; onbekend: string[] } {
  const ids = new Set<string>();
  const onbekend: string[] = [];
  for (const naam of groepsnamen(voorWie)) {
    const gevonden = groepen.find((g) => g.naam.toLowerCase() === naam.toLowerCase());
    if (gevonden) ids.add(gevonden.id);
    else onbekend.push(naam);
  }
  return { ids: [...ids], onbekend };
}

/**
 * Wat er op een regel niet klopt, per veld, in woorden voor de beheerder. Dezelfde verplichte velden als bij één activiteit: naam,
 * datum, starttijd en locatie. Een weggelaten regel hoeft niet te kloppen.
 */
export function controleerRegel(regel: ImportRegel, groepen: Groep[]): Partial<Record<RegelVeld, string>> {
  if (!regel.meenemen) return {};
  const fouten: Partial<Record<RegelVeld, string>> = {};
  if (regel.naam.trim() === '') fouten.naam = 'Vul een naam in.';
  else if (regel.naam.length > MAX_NAAM) fouten.naam = 'Deze naam is te lang.';
  if (regel.datum.trim() === '') fouten.datum = 'Vul een datum in (bijvoorbeeld 11-02-2028).';
  else if (leesDatum(regel.datum, 0) === null) fouten.datum = 'Dit is geen datum. Vul hem in als 11-02-2028.';
  for (const veld of ['verzameltijd', 'starttijd', 'eindtijd', 'busvertrek'] as const) {
    if (regel[veld].trim() !== '' && leesTijd(regel[veld]) === null)
      fouten[veld] = 'Dit is geen tijd. Vul hem in als 18:30.';
  }
  if (regel.starttijd.trim() === '') fouten.starttijd = 'Vul een starttijd in.';
  if (regel.locatie.trim() === '') fouten.locatie = 'Vul een locatie in.';
  else if (regel.locatie.length > MAX_NAAM) fouten.locatie = 'Deze locatie is te lang.';
  if (
    !fouten.eindtijd &&
    !fouten.starttijd &&
    regel.eindtijd.trim() !== '' &&
    leesTijd(regel.eindtijd) === leesTijd(regel.starttijd)
  ) {
    fouten.eindtijd = 'De eindtijd kan niet gelijk zijn aan de starttijd.';
  }
  if (regel.notitie.length > MAX_NOTITIE) fouten.notitie = 'Deze notitie is te lang.';
  const { onbekend } = koppelGroepen(regel.voorWie, groepen);
  if (onbekend.length > 0) {
    fouten.voorWie = `Groep onbekend: ${onbekend.map((naam) => `“${naam}”`).join(', ')}. Kies uit: ${groepen.map((g) => g.naam).join(', ')}.`;
  }
  return fouten;
}

/** Het aantal regels dat wordt aangemaakt, en of er nog fouten zijn. */
export function samenvatting(regels: ImportRegel[], groepen: Groep[]): { aantal: number; metFouten: number } {
  let aantal = 0;
  let metFouten = 0;
  for (const regel of regels) {
    if (!regel.meenemen) continue;
    if (Object.keys(controleerRegel(regel, groepen)).length > 0) metFouten += 1;
    else aantal += 1;
  }
  return { aantal, metFouten };
}

// ===== Naar de database =====

export interface ServerRegel {
  naam: string;
  datum: string;
  starttijd: string;
  locatie: string;
  verzameltijd?: string;
  eindtijd?: string;
  bus_vertrektijd?: string;
  notitie?: string;
  groepen?: string[];
}

/**
 * De regels die activiteiten_bulk_aanmaken krijgt: alleen wat meegenomen wordt, met lege velden weggelaten. De index in deze lijst is
 * het regelnummer dat de database bij een fout teruggeeft; `nummers` zegt bij elk daarvan het rijnummer in het bestand.
 */
export function naarServerregels(
  regels: ImportRegel[],
  groepen: Groep[],
): { regels: ServerRegel[]; nummers: number[] } {
  const uit: ServerRegel[] = [];
  const nummers: number[] = [];
  for (const regel of regels) {
    if (!regel.meenemen) continue;
    const datum = leesDatum(regel.datum, 0);
    const start = leesTijd(regel.starttijd);
    if (datum === null || start === null) continue; // de controle laat dit niet door
    const server: ServerRegel = {
      naam: regel.naam.trim(),
      datum,
      starttijd: start,
      locatie: regel.locatie.trim(),
    };
    const verzamel = leesTijd(regel.verzameltijd);
    if (verzamel) server.verzameltijd = verzamel;
    const eind = leesTijd(regel.eindtijd);
    if (eind) server.eindtijd = eind;
    const bus = leesTijd(regel.busvertrek);
    if (bus) server.bus_vertrektijd = bus;
    if (regel.notitie.trim() !== '') server.notitie = regel.notitie.trim();
    const { ids } = koppelGroepen(regel.voorWie, groepen);
    if (ids.length > 0) server.groepen = ids;
    uit.push(server);
    nummers.push(regel.nr);
  }
  return { regels: uit, nummers };
}

// ===== Foutteksten =====

/** Wat een fout van het lezen van het bestand zegt, voor de beheerder. */
export function vertaalImportfout(fout: ImportFout): string {
  switch (fout.code) {
    case 'geen_xlsx':
      return 'Dit is geen Excel-bestand (.xlsx). Download het sjabloon, vul het in en kies het bestand opnieuw.';
    case 'macro':
      return 'Dit bestand heeft macro’s of is beveiligd met een wachtwoord. Sla het op als gewoon Excel-bestand (.xlsx) en probeer het opnieuw.';
    case 'te_groot':
      return 'Dit bestand is te groot om te lezen (hooguit 1 MB, 200 regels en één tabblad). Maak het kleiner en probeer het opnieuw.';
    case 'beschadigd':
      return 'Dit bestand is beschadigd en niet te lezen. Open het in Excel, sla het opnieuw op en probeer het nog eens.';
    case 'leeg':
      return 'Dit bestand heeft geen tabblad met gegevens.';
    case 'kolom_ontbreekt':
      return `Er ontbreken kolommen in de eerste rij: ${(fout.kolommen ?? []).join(', ')}. Gebruik het sjabloon, of zet deze kolomnamen bovenaan.`;
    case 'geen_regels':
      return 'Er staan geen activiteiten in dit bestand. Vul onder de kopregel een regel per activiteit in, en wis de voorbeeldregels.';
    case 'te_veel_regels':
      return `Er staan meer dan ${MAX_REGELS} activiteiten in dit bestand. Splits het in twee bestanden.`;
  }
}

/** De foutcode van de database bij het aanmaken, in woorden; `rij` is het rijnummer in het bestand, als dat bekend is. */
export function vertaalBulkfout(code: string, rij: number | null): string {
  const regel = rij === null ? 'Een regel' : `Rij ${rij}`;
  switch (code) {
    case 'geen_admin':
      return 'Je mag dit niet meer. Log opnieuw in met je code.';
    case 'veld_ontbreekt':
      return `${regel} mist een verplicht veld (naam, datum, starttijd of locatie). Er is niets aangemaakt.`;
    case 'datum_ongeldig':
      return `${regel} heeft een datum die niet klopt. Er is niets aangemaakt.`;
    case 'veld_ongeldig':
      return `${regel} heeft een waarde die niet klopt. Er is niets aangemaakt.`;
    case 'groep_onbekend':
      return `${regel} noemt een groep die niet bestaat. Er is niets aangemaakt.`;
    case 'te_veel_regels':
      return `Er zijn meer dan ${MAX_REGELS} regels. Er is niets aangemaakt.`;
    default:
      return 'Het aanmaken is niet gelukt. Er is niets aangemaakt. Probeer het nog eens; blijft het misgaan, laat het dan weten.';
  }
}
