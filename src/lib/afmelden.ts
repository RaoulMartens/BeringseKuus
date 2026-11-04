// Afmelden en je afmelding intrekken (UC-003, Datamodel-fase-3.md): wat de schermen zeggen en wanneer de knoppen er staan.
// Alles hier is zuivere logica zonder database, zodat de grenzen met tests vast te leggen zijn. De database beslist (meld_af,
// trek_afmelding_in); dit bepaalt alleen wat een lid ervan ziet en leest.

import { leesDetail } from '@/lib/activiteitformulier';

/** Wat een formulier van afmelden of intrekken teruggeeft bij een fout; bij succes stuurt de server door naar een andere pagina. */
export interface AfmeldStaat {
  melding: string | null;
}

/** Een serveractie van afmelden of intrekken, zoals de formulieren hem aanroepen. */
export type AfmeldActie = (vorige: AfmeldStaat, formulier: FormData) => Promise<AfmeldStaat>;

/** Waar een lid na een afmelding of intrekking heen gaat. */
export const afmeldenHref = (id: string): string => `/afmelden/${id}`;
export const afgemeldHref = (id: string): string => `/afmelden/${id}/gelukt`;
export const ingetrokkenHref = (id: string): string => `/afmelden/${id}/ingetrokken`;

/** Ruimte voor een toelichting. De database kapt op 500 tekens af; het veld laat er meer niet toe. */
export const MAX_TOELICHTING = 500;

/** Rollen die het lid niet zelf kan wijzigen of overdragen (R4): alleen het bestuur. */
const ADMINROLLEN = new Set(['bob', 'eindverantwoordelijke']);

/**
 * Wat het paneel "Jouw status" aanbiedt voor één activiteit. Afmelden kan alleen voor een gepubliceerde activiteit die nog
 * niet is geweest (R15), en alleen zonder dienst: met een dienst is het eerst overdragen (R7), en dat scherm volgt in stap D.
 * Een afmelding intrekken kan zolang de activiteit nog niet is geweest (R9).
 */
export interface Aanbod {
  afmelden: boolean;
  intrekken: boolean;
  /** Een korte uitleg als er geen knop is terwijl een lid er een zou verwachten. */
  hulp: string | null;
}

export function maakAanbod(
  activiteit: { status: string; eindigtOm: string },
  nu: Date,
  afgemeld: boolean,
  rollen: string[],
): Aanbod {
  const open =
    activiteit.status === 'gepubliceerd' && new Date(activiteit.eindigtOm).getTime() > nu.getTime();
  if (!open) return { afmelden: false, intrekken: false, hulp: null };
  if (afgemeld) return { afmelden: false, intrekken: true, hulp: null };
  if (rollen.some((rol) => ADMINROLLEN.has(rol))) {
    return {
      afmelden: false,
      intrekken: false,
      hulp: 'Deze rol wijzigt alleen het bestuur. Kun je niet komen, neem dan contact op met de eindverantwoordelijke.',
    };
  }
  if (rollen.length > 0) {
    return {
      afmelden: false,
      intrekken: false,
      hulp: 'Afmelden en je dienst overdragen kunnen hier nog niet. Kun je niet komen, regel het dan met de eindverantwoordelijke.',
    };
  }
  return { afmelden: true, intrekken: false, hulp: null };
}

const MAANDEN = [
  'januari',
  'februari',
  'maart',
  'april',
  'mei',
  'juni',
  'juli',
  'augustus',
  'september',
  'oktober',
  'november',
  'december',
];

/** "21 januari, 14:32" in de tijd van Nederland, voor het moment van een afmelding of een deadline. */
export function momentTekst(iso: string): string {
  const deel = new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const waarde = (soort: string): string => deel.find((d) => d.type === soort)?.value ?? '';
  const maand = MAANDEN[Number(waarde('month')) - 1] ?? '';
  return `${waarde('day')} ${maand}, ${waarde('hour')}:${waarde('minute')}`;
}

/** De regel "Afmeld-deadline" van de bevestigingspagina. Op het deadline-moment zelf mag je nog vrij afmelden (R8). */
export function deadlineTekst(deadline: string | null, nu: Date): string {
  if (!deadline) return 'Geen deadline: je kunt je vrij afmelden';
  const verstreken = nu.getTime() > new Date(deadline).getTime();
  return `${momentTekst(deadline)} (${verstreken ? 'verstreken' : 'nog niet verstreken'})`;
}

// ===== Foutcodes in woorden =====

export interface Ondergrens {
  min: number;
  nu: number;
  na: number;
}

/** De cijfers uit de `detail` van onder_ondergrens, of niets als ze niet te lezen zijn. */
export function ondergrensUitDetail(tekst: unknown): Ondergrens | null {
  const detail = leesDetail(tekst);
  if (typeof detail !== 'object' || detail === null) return null;
  const rij = detail as Record<string, unknown>;
  const min = rij.min;
  const nu = rij.aanwezigen_nu;
  const na = rij.aanwezigen_na;
  return [min, nu, na].every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < 100_000)
    ? { min: min as number, nu: nu as number, na: na as number }
    : null;
}

/** De cijfers in het adres van de pagina "Afmelden kan nu niet" (geen persoonsgegevens: alleen aantallen). */
export function ondergrensQuery(o: Ondergrens): string {
  return `min=${o.min}&nu=${o.nu}`;
}

/** Leest de cijfers terug uit het adres; ontbreken of kloppen ze niet, dan toont de pagina de tekst zonder cijfers. */
export function leesOndergrensQuery(zoek: { min?: string | string[]; nu?: string | string[] }): {
  min: number;
  nu: number;
} | null {
  const getal = (waarde: string | string[] | undefined): number | null => {
    if (typeof waarde !== 'string' || !/^\d{1,5}$/.test(waarde)) return null;
    return Number(waarde);
  };
  const min = getal(zoek.min);
  const nu = getal(zoek.nu);
  return min === null || nu === null ? null : { min, nu };
}

/** De blokkade van R8, in precies de woorden van het ontwerp (UC-003 AF-3). */
export const ONDERGRENS_TEKST =
  'Meld je bij de eindverantwoordelijke, afmelden gaat nu niet i.v.m. laag aantal aanwezigen.';

/** De uitkomst van een afmelding die niet doorgaat: een melding op de bevestigingspagina, of een andere pagina. */
export type AfmeldUitkomst =
  | { soort: 'melding'; tekst: string }
  | { soort: 'ondergrens'; ondergrens: Ondergrens | null }
  | { soort: 'afgemeld' }
  | { soort: 'inloggen' };

const ALGEMEEN = 'Het afmelden is niet gelukt. Probeer het nog eens; blijft het misgaan, laat het dan weten.';

export function vertaalAfmeldfout(code: string, detail: unknown): AfmeldUitkomst {
  switch (code) {
    case 'geen_lid':
      return { soort: 'inloggen' };
    case 'al_afgemeld':
      // Dubbel geklikt of in een tweede tabblad: het staat al zo, dus gewoon het resultaat tonen.
      return { soort: 'afgemeld' };
    case 'onder_ondergrens':
      return { soort: 'ondergrens', ondergrens: ondergrensUitDetail(detail) };
    case 'heeft_adminrol':
      return {
        soort: 'melding',
        tekst:
          'Deze rol wijzigt alleen het bestuur. Kun je niet komen, neem dan contact op met de eindverantwoordelijke.',
      };
    case 'heeft_ruilbare_rol':
      return {
        soort: 'melding',
        tekst:
          'Je hebt bij deze activiteit nog een dienst, en die moet eerst over naar iemand anders. Dat kan hier nog niet; regel het met de eindverantwoordelijke.',
      };
    case 'activiteit_niet_open':
      return { soort: 'melding', tekst: openTekst(leesDetail(detail)) };
    default:
      return { soort: 'melding', tekst: ALGEMEEN };
  }
}

function redenUit(detail: unknown): unknown {
  return typeof detail === 'object' && detail !== null ? (detail as Record<string, unknown>).reden : null;
}

function openTekst(detail: unknown): string {
  const reden = redenUit(detail);
  if (reden === 'afgelopen') return 'Deze activiteit is al geweest; afmelden kan niet meer.';
  if (reden === 'geannuleerd') return 'Deze activiteit is geannuleerd; afmelden hoeft niet meer.';
  return 'Deze activiteit is niet meer open voor afmeldingen.';
}

export type IntrekUitkomst =
  { soort: 'melding'; tekst: string } | { soort: 'aanwezig' } | { soort: 'inloggen' };

export function vertaalIntrekfout(code: string, detail: unknown): IntrekUitkomst {
  switch (code) {
    case 'geen_lid':
      return { soort: 'inloggen' };
    case 'niet_afgemeld':
      // Al ingetrokken (dubbel geklikt): je staat op aanwezig, en dat is wat het lid wilde.
      return { soort: 'aanwezig' };
    case 'activiteit_voorbij':
      return {
        soort: 'melding',
        tekst: 'Deze activiteit is al geweest; je afmelding kan niet meer worden ingetrokken.',
      };
    case 'activiteit_niet_open':
      return {
        soort: 'melding',
        tekst:
          redenUit(leesDetail(detail)) === 'geannuleerd'
            ? 'Deze activiteit is geannuleerd; je afmelding hoeft niet meer te worden ingetrokken.'
            : 'Deze activiteit is niet meer open.',
      };
    default:
      return {
        soort: 'melding',
        tekst: 'Het intrekken is niet gelukt. Probeer het nog eens; blijft het misgaan, laat het dan weten.',
      };
  }
}
