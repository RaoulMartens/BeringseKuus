// Wat een lid van een activiteit ziet (UC-001, wireframes welkom, welkom-leeg, welkom-twee en activiteit-optocht): welke
// activiteit(en) het welkomscherm toont, de tijdlijn van de avond, de rolbezetting zoals een lid die ziet en wat er over
// jouw eigen plek staat. Alles hier is zuivere logica zonder database, zodat de grenzen (vandaag, twee activiteiten op één
// dag, een activiteit zonder bus) met tests vast te leggen zijn.

import { isGeweest, langeDag, tijdTekst, type ActiviteitStatus } from '@/lib/programma';

/** Een activiteit zoals een lid hem leest (de view mijn_activiteiten). */
export interface LedenActiviteit {
  id: string;
  naam: string;
  /** YYYY-MM-DD */
  datum: string;
  verzameltijd: string | null;
  starttijd: string | null;
  eindtijd: string | null;
  locatie: string | null;
  busVertrektijd: string | null;
  busLocatie: string | null;
  notitie: string | null;
  status: ActiviteitStatus;
  /** Het eindmoment als tijdstip met tijdzone (R16). */
  eindigtOm: string;
}

/** Een kalenderdag verder, als YYYY-MM-DD (rekenen op de kalender, niet op een tijdstip: de zomertijd telt dus niet mee). */
export function volgendeDag(datum: string): string {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * De activiteiten van het welkomscherm: alle gepubliceerde van vandaag die nog niet geweest zijn, op tijd; is dat er geen,
 * dan alle van de eerstvolgende dag waarop er iets is (UC-001 stap 1 en AF-8). Een afgelopen activiteit verdwijnt, ook als
 * hij vandaag was (R16). Concepten en geannuleerde activiteiten telt het scherm niet mee (R15).
 */
export function kiesWelkom(activiteiten: LedenActiviteit[], vandaag: string, nu: Date): LedenActiviteit[] {
  const komende = activiteiten
    .filter((a) => a.status === 'gepubliceerd' && !isGeweest(a, nu))
    .sort((a, b) => {
      if (a.datum !== b.datum) return a.datum < b.datum ? -1 : 1;
      const ta = a.starttijd ?? a.verzameltijd ?? '99:99';
      const tb = b.starttijd ?? b.verzameltijd ?? '99:99';
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.naam.localeCompare(b.naam, 'nl');
    });
  const eerste = komende.find((a) => a.datum >= vandaag);
  return eerste ? komende.filter((a) => a.datum === eerste.datum) : [];
}

function hoofdletter(tekst: string): string {
  return tekst.charAt(0).toUpperCase() + tekst.slice(1);
}

/** Het label boven de naam: "Vandaag, vrijdag 22 januari", "Morgen, vrijdag 22 januari" of "Zaterdag 6 februari". */
export function dagLabel(datum: string, vandaag: string): string {
  const lang = langeDag(datum);
  if (datum === vandaag) return `Vandaag, ${lang}`;
  if (datum === volgendeDag(vandaag)) return `Morgen, ${lang}`;
  return hoofdletter(lang);
}

export interface Stop {
  /** HH:MM */
  tijd: string;
  wat: string;
  /** Wie een icoon naast de naam wil (de bus). */
  icoon?: 'bus';
  /** De plaats bij deze stop: waar je verzamelt of waar de bus vertrekt. */
  plek?: string;
}

/**
 * De tijdlijn van de avond, in volgorde van gebeuren: verzamelen, bus vertrekt, begint, is afgelopen. Alleen wat is
 * ingevuld (ontwerpregel). De locatie hangt aan verzamelen, want daar verzamel je (een vraag aan de opdrachtgever, voorlopig een aanname); zonder
 * verzameltijd hangt ze aan de eerste stop die er is.
 */
export function maakTijdlijn(a: LedenActiviteit): Stop[] {
  const stops: Stop[] = [];
  const voeg = (tijd: string | null, wat: string, extra: Partial<Stop> = {}) => {
    const tekst = tijdTekst(tijd);
    if (tekst) stops.push({ tijd: tekst, wat, ...extra });
  };
  voeg(a.verzameltijd, 'Verzamelen');
  voeg(a.busVertrektijd, 'Bus vertrekt', { icoon: 'bus', ...(a.busLocatie ? { plek: a.busLocatie } : {}) });
  voeg(a.starttijd, `${a.naam} begint`);
  voeg(a.eindtijd, `${a.naam} is afgelopen`);

  const locatie = a.locatie?.trim();
  const eerste = stops[0];
  if (locatie && eerste && !eerste.plek) eerste.plek = locatie;
  return stops;
}

/**
 * Wat er nog niet is ingevuld, in woorden, in plaats van stilzwijgend weg te laten (UC-001 AF-7): de bus en de notitie
 * "belangrijk om te weten" liggen bij een activiteit verderop in het seizoen vaak nog niet vast.
 */
export function nogNietIngevuld(a: Pick<LedenActiviteit, 'busVertrektijd' | 'notitie'>): string | null {
  const geenBus = !a.busVertrektijd;
  const geenNotitie = !a.notitie?.trim();
  if (geenBus && geenNotitie)
    return 'Busvertrek en de notitie “belangrijk om te weten” zijn nog niet ingevuld.';
  if (geenBus) return 'Busvertrek is nog niet ingevuld.';
  if (geenNotitie) return 'De notitie “belangrijk om te weten” is nog niet ingevuld.';
  return null;
}

// ===== Rolbezetting =====

/** De volgorde en de naam van de rollen op het scherm van een lid. */
const ROLLEN: { rol: string; label: string }[] = [
  { rol: 'eindverantwoordelijke', label: 'Eindverantwoordelijke' },
  { rol: 'bob', label: 'BOB' },
  { rol: 'werker', label: 'Werker' },
  { rol: 'drankhaler', label: 'Drankhaler' },
  { rol: 'fotograaf', label: 'Fotograaf' },
];

export function rolLabel(rol: string): string | null {
  return ROLLEN.find((r) => r.rol === rol)?.label ?? null;
}

/** Een bezette plek, zoals een lid hem leest: een lege plek ziet een lid niet (R13). */
export interface BezettePlek {
  rol: string;
  lidId: string;
  naam: string;
}

export interface Rolgroep {
  rol: string;
  label: string;
  namen: { lidId: string; naam: string; jij: boolean }[];
}

/** De bezette plekken per rol, in de volgorde van het scherm; een rol zonder namen en een rol die we niet kennen (de bak) komen er niet in. */
export function groepeerRollen(plekken: BezettePlek[], eigenLidId: string): Rolgroep[] {
  return ROLLEN.flatMap(({ rol, label }) => {
    const namen = plekken
      .filter((plek) => plek.rol === rol)
      .map((plek) => ({ lidId: plek.lidId, naam: plek.naam, jij: plek.lidId === eigenLidId }));
    return namen.length > 0 ? [{ rol, label, namen }] : [];
  });
}

/** Staat er behalve de eindverantwoordelijke niemand op de plekken? Dan is de indeling nog niet gemaakt (UC-001 AF-7). */
export function isNogNietIngedeeld(groepen: Rolgroep[]): boolean {
  return groepen.every((groep) => groep.rol === 'eindverantwoordelijke');
}

// ===== Jouw status =====

/**
 * Wat er over jou bij deze activiteit staat: afgemeld, of aanwezig met je rol(len) of zonder dienst. Een mens heeft hooguit
 * een plek per activiteit (geen dubbelboeking), maar de lijst staat open voor meer.
 */
export interface Jouwstatus {
  naam: string;
  afgemeld: boolean;
  /** "werker", "drankhaler": de rollen waarin je staat; leeg als je geen dienst hebt. */
  rollen: string[];
}

export function maakJouwstatus(naam: string, groepen: Rolgroep[], afgemeld: boolean): Jouwstatus {
  const rollen = groepen.flatMap((groep) =>
    groep.namen.some((n) => n.jij) ? [groep.label.toLowerCase()] : [],
  );
  return { naam, afgemeld, rollen };
}

/** De zin van het statuspaneel: "Je staat op aanwezig als werker.", "Je staat op aanwezig, zonder dienst." of "Je bent afgemeld." */
export function statusZin(status: Jouwstatus): { soort: 'aanwezig' | 'afgemeld'; tekst: string } {
  if (status.afgemeld) return { soort: 'afgemeld', tekst: 'Je bent afgemeld.' };
  if (status.rollen.length === 0) return { soort: 'aanwezig', tekst: 'Je staat op aanwezig, zonder dienst.' };
  return { soort: 'aanwezig', tekst: `Je staat op aanwezig als ${status.rollen.join(' en ')}.` };
}
