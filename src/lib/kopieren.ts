// Een seizoen kopiëren (UC-006, "Vorig seizoen kopiëren"): de activiteiten van een eerder seizoen worden concepten in een nieuw
// seizoen, met alle datums even ver verschoven. Zuivere logica zonder netwerk en zonder database, zodat de regels met tests
// vast te leggen zijn; de pagina leest het vorige seizoen en de database (activiteiten_bulk_aanmaken) maakt de concepten aan.
//
// De regels (UC-006 stap 3):
//  - de beheerder kiest één activiteit met een bekende datum (bijvoorbeeld de Optocht) en zegt wanneer die in het nieuwe seizoen
//    valt; het verschil in dagen geldt voor alle activiteiten. Valt de nieuwe datum op dezelfde weekdag, dan kloppen de weekdagen;
//  - activiteiten op een vaste datum blijven staan: het systeem kent er één, 11 november (Elfde van de elfde). Die komt in het
//    nieuwe seizoen op 11 november van het beginjaar van dat seizoen; andere vaste datums past de beheerder op het controlescherm aan;
//  - wat meegaat: naam, tijden, locatie, bus, notitie, de minimale aanwezigheid, de doelgroep, de lege plekken per soort werk, en
//    de afmeld-deadline op dezelfde afstand van de nieuwe datum. Wat niet meegaat: wie waar is ingedeeld, afmeldingen, de bak,
//    de eindverantwoordelijke (de database maakt een lege vaste plek), oud papier (dat maakt het systeem zelf aan) en de status
//    (alles wordt een concept, dus er gaan geen berichten uit).

import { leesDatum } from './activiteitenimport.ts';

/** Een activiteit van het seizoen dat gekopieerd wordt, zoals de database hem geeft. */
export interface BronActiviteit {
  id: string;
  naam: string;
  /** JJJJ-MM-DD */
  datum: string;
  verzameltijd: string | null;
  starttijd: string | null;
  eindtijd: string | null;
  locatie: string | null;
  bus_vertrektijd: string | null;
  bus_locatie: string | null;
  notitie: string | null;
  /** Een tijdstip met tijdzone (ISO), of null. */
  afmeld_deadline: string | null;
  min_aanwezigen: number | null;
  /** Groep-id's; leeg is iedereen. */
  groepen: string[];
  /** De plekken per soort werk, zonder de eindverantwoordelijke en de bak. */
  plekken: { rol_type: string; aantal: number }[];
}

/** Een regel op het controlescherm. */
export interface KopieRegel {
  /** Een vast nummer binnen deze kopie, voor een foutmelding van de database. */
  nr: number;
  bron: BronActiviteit;
  /** De datum zoals de beheerder hem ziet en aanpast (dd-mm-jjjj). */
  datum: string;
  /** De datum in het vorige seizoen, om mee te vergelijken. */
  oudeDatum: string;
  /** De datum is een vaste datum van het jaar en is niet verschoven. */
  vast: boolean;
  meenemen: boolean;
}

export type KopieVeld = 'datum' | 'starttijd' | 'locatie';

function pad(n: number, lengte = 2): string {
  return String(n).padStart(lengte, '0');
}

/** De dag zelf als getal, in UTC: rekenen met dagen zonder dat de zomertijd meetelt. */
function dagnummer(iso: string): number {
  const [j, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(j ?? 0, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

export function dagenTussen(van: string, tot: string): number {
  return dagnummer(tot) - dagnummer(van);
}

export function plusDagen(iso: string, dagen: number): string {
  const d = new Date((dagnummer(iso) + dagen) * 86_400_000);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Het beginjaar van het seizoen waar een datum bij hoort: september tot en met december het jaar zelf, daarna het jaar ervoor. */
export function seizoenVan(iso: string): number {
  const [j, m] = iso.split('-').map(Number);
  return (m ?? 1) >= 9 ? (j ?? 0) : (j ?? 0) - 1;
}

/** 11 november is de enige vaste datum die het systeem kent (Elfde van de elfde). */
export function isVasteDatum(iso: string): boolean {
  return iso.slice(5) === '11-11';
}

/** "2028-02-11" als "11-02-2028", zoals de beheerder het invult. */
export function naarInvoer(iso: string): string {
  const [j, m, d] = iso.split('-');
  return `${d}-${m}-${j}`;
}

/** Wat de beheerder invult als datum, als JJJJ-MM-DD; zonder jaar neemt het systeem het jaar van het seizoen. */
export function leesInvoerDatum(tekst: string, seizoen: number): string | null {
  return leesDatum(tekst, seizoen);
}

const LOKAAL = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Amsterdam',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Datum en tijd van een tijdstip op de klok in Nederland. */
export function lokaleDelen(tijdstip: string): { datum: string; tijd: string } {
  const delen = Object.fromEntries(
    LOKAAL.formatToParts(new Date(tijdstip)).map((deel) => [deel.type, deel.value]),
  );
  return { datum: `${delen.year}-${delen.month}-${delen.day}`, tijd: `${delen.hour}:${delen.minute}` };
}

/**
 * De afmeld-deadline van de nieuwe activiteit: evenveel dagen voor de nieuwe datum als de oude deadline voor de oude datum lag, op
 * dezelfde tijd op de klok in Nederland. Zonder tijdzone: de database leest dat als tijd in Nederland, ook over de zomertijd heen.
 */
export function nieuweDeadline(
  oudeDatum: string,
  deadline: string | null,
  nieuweDatum: string,
): string | null {
  if (deadline === null) return null;
  const lokaal = lokaleDelen(deadline);
  const dagenVoor = dagenTussen(lokaal.datum, oudeDatum);
  return `${plusDagen(nieuweDatum, -dagenVoor)}T${lokaal.tijd}:00`;
}

function tijd(waarde: string | null): string | null {
  return waarde === null ? null : waarde.slice(0, 5);
}

/**
 * De regels van de kopie: alle activiteiten van het vorige seizoen, verschoven. `referentieId` is de activiteit met de bekende
 * datum en `nieuweDatum` is waar die in het nieuwe seizoen op valt (JJJJ-MM-DD). Op volgorde van de nieuwe datum.
 */
export function maakKopie(bron: BronActiviteit[], referentieId: string, nieuweDatum: string): KopieRegel[] {
  const referentie = bron.find((activiteit) => activiteit.id === referentieId);
  if (!referentie) return [];
  const verschuiving = dagenTussen(referentie.datum, nieuweDatum);
  const beginjaar = seizoenVan(nieuweDatum);
  const regels = bron.map((activiteit) => {
    const vast = isVasteDatum(activiteit.datum);
    const datum = vast ? `${pad(beginjaar, 4)}-11-11` : plusDagen(activiteit.datum, verschuiving);
    return { bron: activiteit, datum, oudeDatum: activiteit.datum, vast };
  });
  regels.sort((a, b) =>
    a.datum === b.datum ? a.bron.naam.localeCompare(b.bron.naam, 'nl') : a.datum < b.datum ? -1 : 1,
  );
  return regels.map((regel, index) => ({
    nr: index + 1,
    bron: regel.bron,
    datum: naarInvoer(regel.datum),
    oudeDatum: regel.oudeDatum,
    vast: regel.vast,
    meenemen: true,
  }));
}

/** Wat er op een regel niet klopt, per veld, in woorden voor de beheerder. */
export function controleerKopie(regel: KopieRegel, seizoen: number): Partial<Record<KopieVeld, string>> {
  const fouten: Partial<Record<KopieVeld, string>> = {};
  if (leesInvoerDatum(regel.datum, seizoen) === null) {
    fouten.datum = 'Vul een datum in, bijvoorbeeld 11-02-2028.';
  }
  // Een concept uit het vorige seizoen kan zonder starttijd of locatie zijn gebleven. Die kunnen hier niet worden ingevuld: de
  // beheerder neemt de regel dan niet mee, of vult hem eerst in het vorige seizoen aan.
  if (regel.bron.starttijd === null) {
    fouten.starttijd = 'Deze activiteit had geen starttijd. Neem hem niet mee, of vul hem eerst aan.';
  }
  if (regel.bron.locatie === null || regel.bron.locatie.trim() === '') {
    fouten.locatie = 'Deze activiteit had geen locatie. Neem hem niet mee, of vul hem eerst aan.';
  }
  return fouten;
}

export function kopieSamenvatting(
  regels: KopieRegel[],
  seizoen: number,
): { aantal: number; metFouten: number } {
  let aantal = 0;
  let metFouten = 0;
  for (const regel of regels) {
    if (!regel.meenemen) continue;
    aantal += 1;
    if (Object.keys(controleerKopie(regel, seizoen)).length > 0) metFouten += 1;
  }
  return { aantal, metFouten };
}

/** Een regel zoals activiteiten_bulk_aanmaken hem leest. */
export interface KopieServerRegel {
  naam: string;
  datum: string;
  starttijd: string;
  locatie: string;
  verzameltijd?: string;
  eindtijd?: string;
  bus_vertrektijd?: string;
  bus_locatie?: string;
  notitie?: string;
  afmeld_deadline?: string;
  min_aanwezigen?: number;
  groepen?: string[];
  plekken?: { rol_type: string; aantal: number }[];
}

/** De regels voor de database: alleen wat meegenomen wordt, met lege velden weggelaten, en `nummers` de nummers van de regels. */
export function naarKopieServerregels(
  regels: KopieRegel[],
  seizoen: number,
): { regels: KopieServerRegel[]; nummers: number[] } {
  const uit: KopieServerRegel[] = [];
  const nummers: number[] = [];
  for (const regel of regels) {
    if (!regel.meenemen) continue;
    const datum = leesInvoerDatum(regel.datum, seizoen);
    const start = tijd(regel.bron.starttijd);
    const locatie = regel.bron.locatie?.trim();
    if (datum === null || start === null || !locatie) continue; // de controle laat dit niet door
    const server: KopieServerRegel = { naam: regel.bron.naam, datum, starttijd: start, locatie };
    const verzamel = tijd(regel.bron.verzameltijd);
    if (verzamel) server.verzameltijd = verzamel;
    const eind = tijd(regel.bron.eindtijd);
    if (eind) server.eindtijd = eind;
    const bus = tijd(regel.bron.bus_vertrektijd);
    if (bus) server.bus_vertrektijd = bus;
    if (regel.bron.bus_locatie) server.bus_locatie = regel.bron.bus_locatie;
    if (regel.bron.notitie && regel.bron.notitie.trim() !== '') server.notitie = regel.bron.notitie;
    const deadline = nieuweDeadline(regel.bron.datum, regel.bron.afmeld_deadline, datum);
    if (deadline) server.afmeld_deadline = deadline;
    if (regel.bron.min_aanwezigen !== null) server.min_aanwezigen = regel.bron.min_aanwezigen;
    if (regel.bron.groepen.length > 0) server.groepen = regel.bron.groepen;
    if (regel.bron.plekken.length > 0) server.plekken = regel.bron.plekken;
    uit.push(server);
    nummers.push(regel.nr);
  }
  return { regels: uit, nummers };
}

/** De rij van een activiteit zoals de pagina hem uit de database leest (met de plekken en de doelgroep erbij). */
export interface BronRij {
  id: string;
  naam: string;
  datum: string;
  verzameltijd: string | null;
  starttijd: string | null;
  eindtijd: string | null;
  locatie: string | null;
  bus_vertrektijd: string | null;
  bus_locatie: string | null;
  notitie: string | null;
  afmeld_deadline: string | null;
  min_aanwezigen: number | null;
  rol_slots: { rol_type: string }[];
  activiteit_groep: { groep_id: string }[];
}

/**
 * De plekken per soort werk, in vaste volgorde, alleen soorten die de database mag aanmaken (`toevoegbaar`): de
 * eindverantwoordelijke en de bak horen daar niet bij.
 */
export function bronUitRij(
  rij: BronRij,
  toevoegbaar: ReadonlySet<string>,
  volgorde: readonly string[],
): BronActiviteit {
  const aantallen = new Map<string, number>();
  for (const slot of rij.rol_slots) {
    if (toevoegbaar.has(slot.rol_type)) aantallen.set(slot.rol_type, (aantallen.get(slot.rol_type) ?? 0) + 1);
  }
  const plekken = [...aantallen.entries()]
    .sort((a, b) => volgorde.indexOf(a[0]) - volgorde.indexOf(b[0]))
    .map(([rol_type, aantal]) => ({ rol_type, aantal }));
  return {
    id: rij.id,
    naam: rij.naam,
    datum: rij.datum,
    verzameltijd: rij.verzameltijd,
    starttijd: rij.starttijd,
    eindtijd: rij.eindtijd,
    locatie: rij.locatie,
    bus_vertrektijd: rij.bus_vertrektijd,
    bus_locatie: rij.bus_locatie,
    notitie: rij.notitie,
    afmeld_deadline: rij.afmeld_deadline,
    min_aanwezigen: rij.min_aanwezigen,
    groepen: rij.activiteit_groep.map((groep) => groep.groep_id),
    plekken,
  };
}
