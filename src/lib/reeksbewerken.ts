// Meerdere dagen van een reeks tegelijk bewerken (migratie 20261113110000, UX-FLOWS.md "Reeksen"): dezelfde tijden, plaats, notitie,
// doelgroep en eindverantwoordelijke voor alle dagen in één keer invullen, en eventueel alle dagen tegelijk publiceren. Alles hier
// is zuivere logica zonder database of scherm: wat de dagen gemeen hebben, wat de beheerder werkelijk verandert, en de
// foutteksten per dag. De controles zelf doet de database, per dag, met activiteit_opslaan.

import { leesTijd } from '@/lib/activiteitenimport';
import { dagTekst, tijdTekst } from '@/lib/programma';
import { vertaalPubliceerfout } from '@/lib/publiceren';

/** De velden die voor alle dagen gelijk kunnen zijn. Naam en datum zijn per dag en horen hier niet bij. */
export const REEKSVELDEN = [
  'verzameltijd',
  'starttijd',
  'eindtijd',
  'locatie',
  'bus_vertrektijd',
  'bus_locatie',
  'notitie',
] as const;
export type ReeksVeld = (typeof REEKSVELDEN)[number];

const TIJDVELDEN: readonly ReeksVeld[] = ['verzameltijd', 'starttijd', 'eindtijd', 'bus_vertrektijd'];
const MAX_TEKST = 200;
const MAX_NOTITIE = 2000;

/** Wat de database van één dag geeft: tijden als HH:MM of HH:MM:SS, tekst, en de groepen (leeg is iedereen). */
export type DagWaarden = Record<ReeksVeld, string | null> & { groepen: string[] };

/** Wat de dagen gemeen hebben bij een veld: de gedeelde waarde ("" als alle dagen leeg zijn), of dat de dagen verschillen. */
export interface Startwaarde {
  waarde: string;
  verschilt: boolean;
}

function genormaliseerd(veld: ReeksVeld, waarde: string | null): string {
  if (waarde === null) return '';
  if (TIJDVELDEN.includes(veld)) return tijdTekst(waarde) ?? '';
  return waarde.trim();
}

/** Per veld: hebben alle dagen dezelfde waarde, en welke? Verschillen ze, dan is er geen gedeelde waarde om te tonen. */
export function startwaarden(dagen: DagWaarden[]): Record<ReeksVeld, Startwaarde> {
  const uit = {} as Record<ReeksVeld, Startwaarde>;
  for (const veld of REEKSVELDEN) {
    const waarden = new Set(dagen.map((dag) => genormaliseerd(veld, dag[veld])));
    const eerste = [...waarden][0] ?? '';
    uit[veld] = waarden.size <= 1 ? { waarde: eerste, verschilt: false } : { waarde: '', verschilt: true };
  }
  return uit;
}

/** De groepen die alle dagen gemeen hebben (op volgorde van id), of dat de dagen verschillen. */
export function startGroepen(dagen: DagWaarden[]): { ids: string[]; verschilt: boolean } {
  const sleutels = new Set(dagen.map((dag) => [...dag.groepen].sort().join('|')));
  if (sleutels.size > 1) return { ids: [], verschilt: true };
  return { ids: [...(dagen[0]?.groepen ?? [])].sort(), verschilt: false };
}

export interface ReeksInvoer {
  velden: Record<ReeksVeld, string>;
  /** "Voor wie" voor alle dagen instellen: alleen dan gaan de groepen mee (anders blijven ze per dag zoals ze zijn). */
  groepenWijzigen: boolean;
  groepen: string[];
  /** Het lid dat eindverantwoordelijke wordt voor alle dagen; leeg is niet wijzigen. */
  eindverantwoordelijke: string;
}

export interface ReeksWijziging {
  /** Alleen wat verandert, klaar voor activiteiten_bulk_aanmaken's tegenhanger (p_velden): een tijd als HH:MM, leeg als null. */
  velden: Partial<Record<ReeksVeld, string | null>> & { groepen?: string[] };
  fouten: Partial<Record<ReeksVeld, string>>;
  eindverantwoordelijke: string | null;
}

/**
 * Wat er werkelijk verandert. Een veld waarvan de dagen verschillen en dat de beheerder leeg laat, blijft per dag zoals het is; een
 * veld dat hij leegmaakt terwijl alle dagen dezelfde waarde hadden, wordt voor alle dagen leeg. Een waarde die gelijk is aan de
 * gedeelde waarde is geen wijziging.
 */
export function bepaalWijziging(invoer: ReeksInvoer, start: Record<ReeksVeld, Startwaarde>): ReeksWijziging {
  const velden: ReeksWijziging['velden'] = {};
  const fouten: ReeksWijziging['fouten'] = {};
  for (const veld of REEKSVELDEN) {
    const ingevuld = invoer.velden[veld].trim();
    const begin = start[veld];
    if (begin.verschilt && ingevuld === '') continue;
    if (!begin.verschilt && ingevuld === begin.waarde) continue;
    if (ingevuld === '') {
      velden[veld] = null;
      continue;
    }
    if (TIJDVELDEN.includes(veld)) {
      const tijd = leesTijd(ingevuld);
      if (tijd === null) fouten[veld] = 'Dit is geen tijd. Vul hem in als 18:30.';
      else if (!(!begin.verschilt && tijd === begin.waarde)) velden[veld] = tijd;
      continue;
    }
    if (ingevuld.length > (veld === 'notitie' ? MAX_NOTITIE : MAX_TEKST)) {
      fouten[veld] = 'Dit is te lang.';
      continue;
    }
    velden[veld] = ingevuld;
  }
  if (invoer.groepenWijzigen) velden.groepen = [...new Set(invoer.groepen)];
  return { velden, fouten, eindverantwoordelijke: invoer.eindverantwoordelijke.trim() || null };
}

/** Verandert er niets? Dan hoeft "Opslaan als concept" niets te doen en zeggen we dat. */
export function isLeeg(wijziging: ReeksWijziging): boolean {
  return Object.keys(wijziging.velden).length === 0 && wijziging.eindverantwoordelijke === null;
}

// ===== Foutteksten per dag =====

function detailTekst(detail: unknown, sleutel: string): string | null {
  if (typeof detail !== 'object' || detail === null || !(sleutel in detail)) return null;
  const waarde = (detail as Record<string, unknown>)[sleutel];
  return typeof waarde === 'string' ? waarde : null;
}

function detailGetal(detail: unknown, sleutel: string): number | null {
  if (typeof detail !== 'object' || detail === null || !(sleutel in detail)) return null;
  const waarde = (detail as Record<string, unknown>)[sleutel];
  return typeof waarde === 'number' ? waarde : null;
}

const VELDNAAM: Record<string, string> = {
  verzameltijd: 'de verzameltijd',
  starttijd: 'de starttijd',
  eindtijd: 'de eindtijd',
  locatie: 'de locatie',
  bus_vertrektijd: 'het busvertrek',
  bus_locatie: 'de plaats van de bus',
  notitie: 'de notitie',
  groepen: 'de groepen',
};

/**
 * De foutcode van de database in woorden, met de dag erbij ("Op wo 6 januari: ..."). `datums` zijn de datums van de dagen in dezelfde
 * volgorde als waarin ze zijn meegestuurd, zodat het nummer van de dag (`dag`) de juiste dag noemt. Er is bij een fout niets gewijzigd.
 */
export function vertaalReeksfout(code: string, detail: unknown, datums: string[]): string {
  const dagIndex = detailGetal(detail, 'dag');
  const datum = dagIndex === null ? undefined : datums[dagIndex];
  const dag = datum ? dagTekst(datum).lang : null;
  const voor = dag ? `Op ${dag}: ` : '';
  const niets = ' Er is voor geen enkele dag iets gewijzigd.';
  switch (code) {
    case 'publiceren_niet_mogelijk': {
      // Dezelfde tekst als bij één activiteit; de dag komt op de plek van "er": "...: op wo 6 januari ontbreekt de eindtijd."
      const tekst = vertaalPubliceerfout(code, detail);
      return `${dag ? tekst.replace('er ontbreekt', `op ${dag} ontbreekt`) : tekst}${niets}`;
    }
    case 'versie_verouderd':
      return `${voor}iemand anders heeft deze activiteit net gewijzigd. Laad de pagina opnieuw en probeer het nog eens.${niets}`;
    case 'alleen_concept':
      return `${voor}deze dag is al gepubliceerd. Een reeks waarvan dagen al gepubliceerd zijn, wijzig je niet in één keer.${niets}`;
    case 'activiteit_onbekend':
      return `${voor}deze activiteit bestaat niet meer.${niets}`;
    case 'activiteit_niet_open':
      return `${voor}deze dag is al geweest of geannuleerd en kan niet meer worden gewijzigd.${niets}`;
    case 'veld_ongeldig': {
      const veld = detailTekst(detail, 'veld');
      if (veld === 'eindtijd') return `${voor}de eindtijd kan niet gelijk zijn aan de starttijd.${niets}`;
      return `${voor}${veld && VELDNAAM[veld] ? `${VELDNAAM[veld]} klopt` : 'een waarde klopt'} niet.${niets}`;
    }
    case 'lid_buiten_doelgroep':
    case 'doelgroep_conflict':
      return `${voor}de eindverantwoordelijke hoort niet bij de gekozen groepen. Kies iemand uit die groepen, of pas "Voor wie" aan.${niets}`;
    case 'extern_niet_toegestaan':
      return `${voor}een externe helper kan geen eindverantwoordelijke zijn.${niets}`;
    case 'lid_inactief':
      return `${voor}de gekozen eindverantwoordelijke is niet meer actief.${niets}`;
    case 'dubbelboeking':
      return `${voor}de gekozen eindverantwoordelijke staat al op een andere plek bij deze activiteit.${niets}`;
    case 'slot_gewijzigd':
      return `${voor}iemand anders heeft de eindverantwoordelijke net aangepast. Laad de pagina opnieuw en probeer het nog eens.${niets}`;
    case 'groep_onbekend':
      return `Een van de gekozen groepen bestaat niet (meer).${niets}`;
    case 'te_veel_regels':
      return `Een reeks heeft hooguit 50 dagen.${niets}`;
    default:
      return `Het opslaan is niet gelukt.${niets} Probeer het nog eens; blijft het misgaan, laat het dan weten.`;
  }
}
