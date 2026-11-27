// Leden beheren in de app (UC-013, wireframes admin-leden en de schermen eromheen): wat de lijst zegt, hoe een regel eruitziet, het lid zoals
// de database het geeft, en de foutcodes in woorden. Alles hier is zuivere logica zonder database. De regels zelf staan in de database
// (migratie 20261126100000: leden_beheer_lijst, lid_beheer_lezen, lid_opslaan, lid_inactief_zetten, lid_actief_zetten); dit is de vertaling
// naar woorden.

import { z } from 'zod';

import { rolLabel } from '@/lib/rollen';

/** De rij zoals de database hem geeft (public.leden_beheer_lijst()). */
export interface LedenRij {
  lid_id: string;
  voornaam: string;
  achternaam: string;
  actief: boolean;
  groepen: string[];
  is_beheerder: boolean;
  ooit_ingelogd: boolean;
  account_sinds: string | null;
  inactief_sinds: string | null;
}

export interface Lidregel {
  lidId: string;
  voornaam: string;
  achternaam: string;
  naam: string;
  actief: boolean;
  groepen: string[];
  isBeheerder: boolean;
  ooitIngelogd: boolean;
  accountSinds: string | null;
  inactiefSinds: string | null;
  /** De laatste uitnodiging (leden_uitnodigingen); leeg als het platform er nog geen heeft gestuurd (bijvoorbeeld door de bouwer uitgenodigd). */
  uitnodiging?: Uitnodiging | null;
}

export interface Uitnodiging {
  status: 'wacht' | 'verstuurd' | 'mislukt';
  verstuurdOp: string | null;
}

/** Voornaam en achternaam als één naam; de achternaam mag leeg zijn. */
export function lidNaam(voornaam: string, achternaam: string): string {
  return `${voornaam} ${achternaam}`.trim();
}

export function leesLeden(rijen: LedenRij[]): Lidregel[] {
  return rijen.map((rij) => ({
    lidId: rij.lid_id,
    voornaam: rij.voornaam,
    achternaam: rij.achternaam,
    naam: lidNaam(rij.voornaam, rij.achternaam),
    actief: rij.actief,
    groepen: rij.groepen,
    isBeheerder: rij.is_beheerder,
    ooitIngelogd: rij.ooit_ingelogd,
    accountSinds: rij.account_sinds,
    inactiefSinds: rij.inactief_sinds,
  }));
}

/**
 * Het overzicht in drie blokken, zoals het activiteitenoverzicht: wat aandacht vraagt (een actief lid dat nog nooit is ingelogd), alle
 * actieve leden, en wie inactief is. Wie aandacht vraagt staat ook in de lijst met alle actieve leden: het is een taak, geen apart soort lid.
 */
export function maakLedenoverzicht(leden: Lidregel[]): {
  aandacht: Lidregel[];
  actief: Lidregel[];
  inactief: Lidregel[];
} {
  const opNaam = (a: Lidregel, b: Lidregel) => a.naam.localeCompare(b.naam, 'nl');
  const actief = leden.filter((l) => l.actief).sort(opNaam);
  return {
    aandacht: actief.filter((l) => !l.ooitIngelogd),
    actief,
    inactief: leden.filter((l) => !l.actief).sort(opNaam),
  };
}

/** De regel op de zijkaart "Leden" in het activiteitenoverzicht: de taak in woorden, anders een uitnodiging. */
export function ledenIngangTekst(nogNietIngelogd: number): string {
  if (nogNietIngelogd === 0) return 'Leden bekijken';
  return nogNietIngelogd === 1 ? '1 nog niet ingelogd' : `${nogNietIngelogd} nog niet ingelogd`;
}

const NL = 'nl-NL';
const TIJDZONE = 'Europe/Amsterdam';

/** "14 november", in de tijd van Nederland. */
export function dagMaand(iso: string): string {
  return new Intl.DateTimeFormat(NL, { day: 'numeric', month: 'long', timeZone: TIJDZONE }).format(
    new Date(iso),
  );
}

/** De regel onder de naam bij "Vraagt aandacht": wat er aan de hand is. */
export function aandachtRegel(lid: Lidregel): string {
  const uitnodiging = lid.uitnodiging;
  if (uitnodiging?.status === 'wacht') return 'Nog niet ingelogd · uitnodiging wordt verstuurd';
  if (uitnodiging?.status === 'mislukt') return 'Nog niet ingelogd · uitnodiging versturen is mislukt';
  if (uitnodiging?.status === 'verstuurd' && uitnodiging.verstuurdOp) {
    return `Nog niet ingelogd · uitgenodigd ${dagMaand(uitnodiging.verstuurdOp)}`;
  }
  return lid.accountSinds
    ? `Nog niet ingelogd · account sinds ${dagMaand(lid.accountSinds)}`
    : 'Nog niet ingelogd';
}

/** De groepen als één regel onder de naam, met Beheerder erbij: "Bestuur · Beheerder". */
export function groepenRegel(lid: Pick<Lidregel, 'groepen' | 'isBeheerder'>): string {
  const delen = [...lid.groepen, ...(lid.isBeheerder ? ['Beheerder'] : [])];
  return delen.length > 0 ? delen.join(' · ') : 'Geen groep';
}

/** De regel in de lijst met inactieve leden: sinds wanneer, als dat bekend is. */
export function inactiefRegel(lid: Lidregel): string {
  return lid.inactiefSinds ? `Inactief sinds ${dagMaand(lid.inactiefSinds)}` : 'Inactief';
}

/** Wat de kaart Gegevens zegt over de uitnodiging van een lid; null als er (nog) niets te zeggen is. */
export function uitnodigingTekst(uitnodiging: Uitnodiging | null | undefined): string | null {
  if (!uitnodiging) return null;
  if (uitnodiging.status === 'wacht') return 'Wordt verstuurd';
  if (uitnodiging.status === 'mislukt') return 'Versturen is mislukt: stuur hem opnieuw';
  return uitnodiging.verstuurdOp ? `Verstuurd op ${dagMaand(uitnodiging.verstuurdOp)}` : 'Verstuurd';
}

// ===== één lid =====

const KomendeDienst = z.object({
  activiteit_id: z.uuid(),
  naam: z.string(),
  datum: z.string(),
  rol: z.string(),
  status: z.enum(['concept', 'gepubliceerd']),
});

const LidBeheer = z.object({
  lid: z.object({
    id: z.uuid(),
    voornaam: z.string(),
    achternaam: z.string(),
    actief: z.boolean(),
    email: z.string(),
    telefoon: z.string().nullable(),
    mag_bob: z.boolean(),
    mag_eindverantw: z.boolean(),
    is_beheerder: z.boolean(),
    is_ik: z.boolean(),
    laatst_ingelogd: z.string().nullable(),
  }),
  groepen: z.array(z.object({ id: z.uuid(), naam: z.string(), aantal: z.number(), gekozen: z.boolean() })),
  diensten: z.array(KomendeDienst),
});

export interface LidBeheerGegevens {
  lidId: string;
  voornaam: string;
  achternaam: string;
  naam: string;
  actief: boolean;
  email: string;
  telefoon: string | null;
  magBob: boolean;
  magEindverantwoordelijke: boolean;
  isBeheerder: boolean;
  isIk: boolean;
  laatstIngelogd: string | null;
  groepen: { id: string; naam: string; aantal: number; gekozen: boolean }[];
  diensten: {
    activiteitId: string;
    naam: string;
    datum: string;
    rol: string;
    status: 'concept' | 'gepubliceerd';
  }[];
}

/** Het antwoord van lid_beheer_lezen(); een vorm die we niet kennen is een fout, geen stille aanname. */
export function leesLid(json: unknown): LidBeheerGegevens {
  const g = LidBeheer.parse(json);
  return {
    lidId: g.lid.id,
    voornaam: g.lid.voornaam,
    achternaam: g.lid.achternaam,
    naam: lidNaam(g.lid.voornaam, g.lid.achternaam),
    actief: g.lid.actief,
    email: g.lid.email,
    telefoon: g.lid.telefoon,
    magBob: g.lid.mag_bob,
    magEindverantwoordelijke: g.lid.mag_eindverantw,
    isBeheerder: g.lid.is_beheerder,
    isIk: g.lid.is_ik,
    laatstIngelogd: g.lid.laatst_ingelogd,
    groepen: g.groepen,
    diensten: g.diensten.map((d) => ({
      activiteitId: d.activiteit_id,
      naam: d.naam,
      datum: d.datum,
      rol: d.rol,
      status: d.status,
    })),
  };
}

/** "Voor het laatst op 15 november", of dat het lid nog niet is ingelogd. */
export function ingelogdTekst(laatstIngelogd: string | null): string {
  return laatstIngelogd ? `Voor het laatst op ${dagMaand(laatstIngelogd)}` : 'Nog niet ingelogd';
}

/** Een komende dienst als regel: "werker · concept". De datum staat apart. */
export function dienstRegel(d: { rol: string; status: 'concept' | 'gepubliceerd' }): string {
  return `${rolLabel(d.rol).toLowerCase()} · ${d.status}`;
}

// ===== opslaan: wat het formulier verstuurt =====

/** De rollen die een lid mag doen als aangekruist: de waarden van het formulier. */
export const AANMERKINGEN = [
  { waarde: 'bob', label: 'Mag BOB zijn' },
  { waarde: 'eindverantwoordelijke', label: 'Mag eindverantwoordelijke zijn' },
] as const;

/** Het aantal wijzigingen tussen het begin en nu, voor "N wijzigingen nog niet opgeslagen". */
export function telWijzigingen(
  begin: { telefoon: string; groepen: string[]; aanmerkingen: string[] },
  nu: { telefoon: string; groepen: string[]; aanmerkingen: string[] },
): number {
  const verschil = (a: string[], b: string[]) =>
    a.filter((x) => !b.includes(x)).length + b.filter((x) => !a.includes(x)).length;
  const telefoon = begin.telefoon.trim() === nu.telefoon.trim() ? 0 : 1;
  return telefoon + verschil(begin.groepen, nu.groepen) + verschil(begin.aanmerkingen, nu.aanmerkingen);
}

export function wijzigingenTekst(aantal: number): string {
  if (aantal === 0) return 'Niets gewijzigd';
  return aantal === 1 ? '1 wijziging nog niet opgeslagen' : `${aantal} wijzigingen nog niet opgeslagen`;
}

// ===== foutcodes in woorden =====

export interface Ledenfout {
  tekst: string;
  /** Bij email_bestaat: het lid dat dit adres al heeft. */
  bestaand?: { lidId: string; naam: string; actief: boolean };
  /** Bij dienst_blokkeert: de activiteiten waar het lid een plek heeft. */
  activiteiten?: { naam: string; datum: string }[];
}

/** De foutcode van een handeling als tekst voor de pagina. */
export function vertaalLedenfout(code: string, detail?: unknown): Ledenfout {
  switch (code) {
    case 'lid_onbekend':
      return { tekst: 'Dit lid bestaat niet (meer) of is geen lid om hier te beheren.' };
    case 'zelf':
      return { tekst: 'Jezelf kun je niet op inactief zetten. Een andere beheerder kan het wel.' };
    case 'is_beheerder':
      return { tekst: 'Een beheerder kan niet op inactief. Trek eerst de beheerrechten in bij Beheerders.' };
    case 'al_inactief':
      return { tekst: 'Dit lid is al inactief. Er is niets gewijzigd.' };
    case 'al_actief':
      return { tekst: 'Dit lid is al actief. Er is niets gewijzigd.' };
    case 'telefoon_ongeldig':
      return { tekst: 'Dit telefoonnummer klopt niet. Begin met 0 of +, bijvoorbeeld 06 12 34 56 78.' };
    case 'groep_nodig':
      return { tekst: 'Kies minstens één groep: een lid zonder groep ziet geen enkele activiteit.' };
    case 'groep_onbekend':
      return { tekst: 'Een van de gekozen groepen bestaat niet (meer). Open de pagina opnieuw.' };
    case 'email_bestaat': {
      const gelezen = z.object({ lid_id: z.uuid(), naam: z.string(), actief: z.boolean() }).safeParse(detail);
      if (!gelezen.success) return { tekst: 'Dit e-mailadres hoort al bij een lid.' };
      return {
        tekst: `Dit e-mailadres hoort al bij ${gelezen.data.naam}.`,
        bestaand: { lidId: gelezen.data.lid_id, naam: gelezen.data.naam, actief: gelezen.data.actief },
      };
    }
    case 'email_ongeldig':
      return { tekst: 'Dit e-mailadres klopt niet. Controleer het: er moet een @ en een punt in staan.' };
    case 'veld_ontbreekt':
      return { tekst: 'Vul voornaam, achternaam en e-mailadres in.' };
    case 'veld_ongeldig':
      return { tekst: 'Een naam is te lang (hooguit 100 tekens).' };
    case 'al_ingelogd':
      return {
        tekst:
          'Dit lid is al ingelogd. Het e-mailadres kun je dan niet meer wijzigen en een uitnodiging is niet nodig.',
      };
    case 'te_snel':
      return {
        tekst: 'Er is net al een uitnodiging verstuurd. Wacht even tot het over tien minuten nog eens kan.',
      };
    case 'lid_inactief':
      return { tekst: 'Dit lid is inactief. Maak het eerst weer actief.' };
    case 'adres_ongewijzigd':
      return { tekst: 'Dit is hetzelfde e-mailadres als nu. Er is niets gewijzigd.' };
    case 'import_fout':
      return { tekst: 'Er staat een regel in het bestand die niet klopt. Er is niemand toegevoegd.' };
    case 'te_veel_regels':
      return { tekst: 'Er staan te veel regels in het bestand (hooguit 200). Er is niemand toegevoegd.' };
    case 'dienst_blokkeert': {
      const lijst = leesBlokkade(detail);
      return {
        tekst:
          'Deze groepen kunnen niet: het lid heeft nog een plek bij een activiteit die dan niet meer voor het lid is. Vul die plek eerst anders in.',
        activiteiten: lijst,
      };
    }
    default:
      return { tekst: 'Het is niet gelukt. Probeer het nog eens; blijft het misgaan, laat het dan weten.' };
  }
}

function leesBlokkade(detail: unknown): { naam: string; datum: string }[] {
  const gelezen = z
    .object({ activiteiten: z.array(z.object({ naam: z.string(), datum: z.string() })) })
    .safeParse(detail);
  return gelezen.success ? gelezen.data.activiteiten : [];
}

// ===== meldingen =====

export type LedenHandeling =
  'inactief' | 'actief' | 'opgeslagen' | 'toegevoegd' | 'uitgenodigd' | 'geimporteerd';

export function isLedenHandeling(waarde: unknown): waarde is LedenHandeling {
  return (
    waarde === 'inactief' ||
    waarde === 'actief' ||
    waarde === 'opgeslagen' ||
    waarde === 'toegevoegd' ||
    waarde === 'uitgenodigd' ||
    waarde === 'geimporteerd'
  );
}

/** De melding na een handeling, in de woorden van de knop: een vette zin en een vervolg. */
export function ledenMelding(
  handeling: LedenHandeling,
  naam: string,
  plekkenOpen = 0,
): { vet: string; vervolg: string } {
  switch (handeling) {
    case 'inactief':
      return {
        vet: `${naam} staat op inactief.`,
        vervolg:
          plekkenOpen === 0
            ? 'Er waren geen komende plekken. Er is geen bericht gestuurd: zeg het zelf.'
            : `${plekkenOpen === 1 ? '1 plek is' : `${plekkenOpen} plekken zijn`} open gevallen; je ziet ${plekkenOpen === 1 ? 'die' : 'ze'} terug onder Vraagt aandacht in het beheeroverzicht. Er is geen bericht gestuurd: zeg het zelf.`,
      };
    case 'actief':
      return {
        vet: `${naam} is weer actief.`,
        vervolg: 'Het lid kan weer inloggen. De plekken van eerder komen niet terug; die deel je opnieuw in.',
      };
    case 'opgeslagen':
      return { vet: `De wijzigingen voor ${naam} zijn opgeslagen.`, vervolg: '' };
    case 'toegevoegd':
      return {
        vet: `${naam} is toegevoegd.`,
        vervolg:
          'De uitnodiging gaat binnen een minuut per mail. Tot het lid voor het eerst is ingelogd, staat het onder Vraagt aandacht.',
      };
    case 'uitgenodigd':
      return {
        vet: `${naam} is uitgenodigd.`,
        vervolg: 'De mail gaat binnen een minuut naar het adres van het lid.',
      };
    case 'geimporteerd':
      return {
        vet: plekkenOpen === 1 ? '1 lid is toegevoegd.' : `${plekkenOpen} leden zijn toegevoegd.`,
        vervolg:
          'De uitnodigingen gaan binnen een paar minuten weg. Wie nog niet is ingelogd, staat onder Vraagt aandacht.',
      };
  }
}
