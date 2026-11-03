// Het beheeroverzicht (UC-004 stap 1, V8 5.6, Datamodel-fase-1.md punt 5): de komende activiteiten, verdeeld in "Vraagt
// aandacht" en "Op orde", met per regel de taak in woorden. Alles hier is zuivere logica zonder database; de rijen komen
// uit public.beheeroverzicht(). De tellers en de lijst maken we uit dezelfde rijen, zodat getal en lijst nooit uiteenlopen.
//
// Een regel zegt wat er te doen is ("1 werker indelen"), niet "N plekken open" (ontwerpbesluit: dat was onduidelijk) en
// zonder symbolen: de doelgroep leest woorden sneller.

import { dagTekst, isActiviteitStatus, tijdTekst, type ActiviteitStatus } from '@/lib/programma';

/** Een activiteit heet "bijna te weinig" bij het minimum plus deze marge (Datamodel-fase-1.md punt 5). */
export const BIJNA_TE_WEINIG_MARGE = 1;

const ROLLEN: Record<string, { een: string; meer: string }> = {
  werker: { een: 'werker', meer: 'werkers' },
  drankhaler: { een: 'drankhaler', meer: 'drankhalers' },
  fotograaf: { een: 'fotograaf', meer: 'fotografen' },
  bob: { een: 'BOB', meer: "BOB's" },
};

export interface OverzichtRij {
  activiteitId: string;
  naam: string;
  /** YYYY-MM-DD */
  datum: string;
  status: ActiviteitStatus;
  starttijdOntbreekt: boolean;
  eindtijdOntbreekt: boolean;
  locatieOntbreekt: boolean;
  eindverantwoordelijkeOntbreekt: boolean;
  /** Alle lege plekken, ook de eindverantwoordelijke; zonder de bak. */
  legePlekken: number;
  legePlekkenPerRol: Record<string, number>;
  aanwezigen: number;
  /** Leeg = het minimum staat uit. */
  minAanwezigen: number | null;
  /** De activiteit is voor een of meer groepen, niet voor iedereen. */
  alleenGroepen: boolean;
  /** De verzameltijd, anders de starttijd (HH:MM of HH:MM:SS); leeg als er geen tijd is. */
  tijd: string | null;
}

export type Filter = 'alles' | 'diensten' | 'concepten';

export interface OverzichtRegel {
  id: string;
  /** "Vandaag", "Morgen" of "vr 5 februari". */
  dag: string;
  naam: string;
  /** "18:30"; leeg als er geen tijd is. */
  tijd: string | null;
  status: ActiviteitStatus;
  /** Wat er te doen is; leeg bij een activiteit die op orde is. */
  taak: string | null;
  /** "30 aanwezig"; leeg bij een concept (leden zien het nog niet). */
  aanwezigheid: string | null;
}

export interface Overzicht {
  filter: Filter;
  /** Het aantal diensten (plekken, ook de eindverantwoordelijke) dat nog moet worden ingedeeld. */
  tellers: { diensten: number; concepten: number };
  /** Zonder filter: "Vraagt aandacht". Met een filter: de gefilterde lijst. */
  aandacht: OverzichtRegel[];
  /** Zonder filter: "Op orde". Met een filter leeg. */
  opOrde: OverzichtRegel[];
}

/** Het filter uit de adresbalk; alles wat we niet kennen is "alles". */
export function leesFilter(waarde: string | string[] | undefined): Filter {
  const eerste = Array.isArray(waarde) ? waarde[0] : waarde;
  return eerste === 'diensten' || eerste === 'concepten' ? eerste : 'alles';
}

/** De lege plekken per rol uit het JSON-antwoord van de database; wat er niet in past, wordt genegeerd. */
export function leesPlekkenPerRol(json: unknown): Record<string, number> {
  const uit: Record<string, number> = {};
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return uit;
  for (const [rol, aantal] of Object.entries(json)) {
    if (typeof aantal === 'number' && Number.isInteger(aantal) && aantal > 0) uit[rol] = aantal;
  }
  return uit;
}

export function opsomming(delen: string[]): string {
  if (delen.length <= 1) return delen.join('');
  return `${delen.slice(0, -1).join(', ')} en ${delen[delen.length - 1]}`;
}

/** "Eindtijd en eindverantwoordelijke invullen": wat ontbreekt en nodig is om te publiceren (R21). */
export function invulTaak(
  rij: Pick<
    OverzichtRij,
    'starttijdOntbreekt' | 'eindtijdOntbreekt' | 'locatieOntbreekt' | 'eindverantwoordelijkeOntbreekt'
  >,
): string | null {
  const delen = [
    rij.starttijdOntbreekt ? 'starttijd' : null,
    rij.eindtijdOntbreekt ? 'eindtijd' : null,
    rij.locatieOntbreekt ? 'locatie' : null,
    rij.eindverantwoordelijkeOntbreekt ? 'eindverantwoordelijke' : null,
  ].filter((deel): deel is string => deel !== null);
  if (delen.length === 0) return null;
  const tekst = `${opsomming(delen)} invullen`;
  return tekst.charAt(0).toUpperCase() + tekst.slice(1);
}

/**
 * "2 werkers indelen", of "8 plekken indelen" als het om meer dan één soort gaat. De eindverantwoordelijke staat in de
 * invultaak en telt hier niet mee; een plek in de bak ook niet (V8 5.6).
 */
export function indeelTaak(legePlekkenPerRol: Record<string, number>): string | null {
  const rollen = Object.entries(legePlekkenPerRol).filter(
    ([rol, aantal]) => rol !== 'eindverantwoordelijke' && rol !== 'bak' && aantal > 0,
  );
  const totaal = rollen.reduce((som, [, aantal]) => som + aantal, 0);
  if (totaal === 0) return null;
  const [eerste] = rollen;
  if (rollen.length === 1 && eerste) {
    const [rol, aantal] = eerste;
    const naam = ROLLEN[rol];
    const woord = naam ? (aantal === 1 ? naam.een : naam.meer) : rol;
    return `${aantal} ${woord} indelen`;
  }
  return `${totaal} ${totaal === 1 ? 'plek' : 'plekken'} indelen`;
}

/** "Bijna te weinig: 14 aanwezig, minimaal 13", of "Te weinig" onder het minimum; leeg als het minimum uit staat. */
export function bezettingTaak(rij: Pick<OverzichtRij, 'aanwezigen' | 'minAanwezigen'>): string | null {
  if (rij.minAanwezigen === null) return null;
  if (rij.aanwezigen < rij.minAanwezigen) {
    return `Te weinig: ${rij.aanwezigen} aanwezig, minimaal ${rij.minAanwezigen}`;
  }
  if (rij.aanwezigen <= rij.minAanwezigen + BIJNA_TE_WEINIG_MARGE) {
    return `Bijna te weinig: ${rij.aanwezigen} aanwezig, minimaal ${rij.minAanwezigen}`;
  }
  return null;
}

function volgendeDag(datum: string): string {
  const dag = new Date(`${datum}T12:00:00Z`);
  dag.setUTCDate(dag.getUTCDate() + 1);
  return dag.toISOString().slice(0, 10);
}

/** "Vandaag", "Morgen", anders "vr 5 februari". */
export function dagLabel(datum: string, vandaag: string): string {
  if (datum === vandaag) return 'Vandaag';
  if (datum === volgendeDag(vandaag)) return 'Morgen';
  return dagTekst(datum).lang;
}

function maakRegel(rij: OverzichtRij, vandaag: string): OverzichtRegel {
  // Een concept ziet nog niemand: aanwezigen en het minimum zeggen daar niets (UC-004 stap 8).
  const concept = rij.status === 'concept';
  const taken = [
    invulTaak(rij),
    indeelTaak(rij.legePlekkenPerRol),
    concept ? null : bezettingTaak(rij),
  ].filter((taak): taak is string => taak !== null);
  return {
    id: rij.activiteitId,
    dag: dagLabel(rij.datum, vandaag),
    naam: rij.naam,
    tijd: tijdTekst(rij.tijd),
    status: rij.status,
    taak: taken.length > 0 ? taken.join(', ') : null,
    aanwezigheid: concept
      ? null
      : `${rij.aanwezigen} aanwezig${rij.alleenGroepen ? ' · alleen voor een groep' : ''}`,
  };
}

function vergelijk(a: OverzichtRij, b: OverzichtRij): number {
  if (a.datum !== b.datum) return a.datum < b.datum ? -1 : 1;
  const ta = a.tijd ?? '99:99';
  const tb = b.tijd ?? '99:99';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.naam.localeCompare(b.naam, 'nl');
}

/** Een geannuleerde activiteit hoort niet in het overzicht (de database geeft hem ook niet); voor de zekerheid hier ook. */
export function maakOverzicht(rijen: OverzichtRij[], vandaag: string, filter: Filter): Overzicht {
  const open = [...rijen].filter((rij) => rij.status !== 'geannuleerd').sort(vergelijk);
  const tellers = {
    diensten: open.reduce((som, rij) => som + rij.legePlekken, 0),
    concepten: open.filter((rij) => rij.status === 'concept').length,
  };

  if (filter === 'diensten' || filter === 'concepten') {
    const gekozen = open.filter((rij) =>
      filter === 'diensten' ? rij.legePlekken > 0 : rij.status === 'concept',
    );
    return { filter, tellers, aandacht: gekozen.map((rij) => maakRegel(rij, vandaag)), opOrde: [] };
  }

  const regels = open.map((rij) => maakRegel(rij, vandaag));
  return {
    filter,
    tellers,
    aandacht: regels.filter((regel) => regel.taak !== null),
    opOrde: regels.filter((regel) => regel.taak === null),
  };
}

/** Een rij uit public.beheeroverzicht() en de tijd uit activiteiten, als OverzichtRij; een onbekende status wordt overgeslagen. */
export function maakRij(
  rij: {
    activiteit_id: string;
    naam: string;
    datum: string;
    status: string;
    starttijd_ontbreekt: boolean;
    eindtijd_ontbreekt: boolean;
    locatie_ontbreekt: boolean;
    eindverantwoordelijke_ontbreekt: boolean;
    lege_plekken: number;
    lege_plekken_per_rol: unknown;
    aanwezigen: number;
    min_aanwezigen: number | null;
    alleen_groepen: boolean;
  },
  tijd: string | null,
): OverzichtRij[] {
  if (!isActiviteitStatus(rij.status)) return [];
  return [
    {
      activiteitId: rij.activiteit_id,
      naam: rij.naam,
      datum: rij.datum,
      status: rij.status,
      starttijdOntbreekt: rij.starttijd_ontbreekt,
      eindtijdOntbreekt: rij.eindtijd_ontbreekt,
      locatieOntbreekt: rij.locatie_ontbreekt,
      eindverantwoordelijkeOntbreekt: rij.eindverantwoordelijke_ontbreekt,
      legePlekken: rij.lege_plekken,
      legePlekkenPerRol: leesPlekkenPerRol(rij.lege_plekken_per_rol),
      aanwezigen: rij.aanwezigen,
      minAanwezigen: rij.min_aanwezigen,
      alleenGroepen: rij.alleen_groepen,
      tijd,
    },
  ];
}
