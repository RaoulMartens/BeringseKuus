// Het formulier voor een activiteit (UC-004): wat de beheerder invult, gecontroleerd met Zod (besluit 2.4 in
// Fase-1-plan.md), omgezet naar wat public.activiteit_opslaan verwacht, en de foutcodes van de database terug in woorden
// bij het veld of bovenaan. Alles hier is zuivere logica zonder database, zodat de grenzen met tests vast te leggen zijn.
//
// Het formulier controleert voor de gebruiker (snel, bij het veld); de database controleert nog een keer en blijft de
// baas (DM-13): een waarde die hier doorkomt en daar niet, komt als foutcode terug en wordt ook in woorden gezet.
// De teksten staan zoals in de wireframes (docs/ux-flows): "Vul een eindtijd in."

import { z } from 'zod';

const TIJD = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const TIJDSTIP = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

/** Rollen die de beheerder zelf toevoegt; de eindverantwoordelijke is er altijd en de bak komt later. */
export const TOEVOEGBARE_ROLLEN = ['werker', 'drankhaler', 'fotograaf', 'bob'] as const;
export type ToevoegbareRol = (typeof TOEVOEGBARE_ROLLEN)[number];

export const TEKENS_NAAM = 200;
export const TEKENS_NOTITIE = 2000;

export type Wijziging =
  | { handeling: 'plek_toevoegen'; rol_type: ToevoegbareRol; tijdelijk_id: string }
  | { handeling: 'plek_weghalen'; rol_slot_id: string }
  /** Iemand op een bestaande plek zetten; `verwachte_bezetter` is wie de beheerder er zag staan (UC-005 AF-8). */
  | { handeling: 'toewijzen'; rol_slot_id: string; lid_id: string; verwachte_bezetter: string | null }
  /** Iemand op een plek zetten die in dezelfde aanroep is toegevoegd (of de eindverantwoordelijke van een nieuwe activiteit). */
  | { handeling: 'toewijzen'; tijdelijk_id: string; lid_id: string; verwachte_bezetter: null }
  | { handeling: 'leegmaken'; rol_slot_id: string; verwachte_bezetter: string };

/** De waarde van de keuzelijst bij een bezette plek: de plek leegmaken, of leegmaken en weghalen ("Truus eraf halen"). */
export const PLEK_LEEGMAKEN = '__leeg';
export const PLEK_WEGHALEN = '__weg';

export interface ActiviteitVelden {
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
  groepen: string[];
}

export type Uitkomst =
  | { ok: true; velden: ActiviteitVelden; wijzigingen: Wijziging[] }
  | { ok: false; fouten: Record<string, string> };

/** Een lege invoer is "niet ingevuld" (null), niet een lege tekst. */
const leeg = (waarde: unknown): unknown =>
  typeof waarde === 'string' && waarde.trim() === '' ? null : waarde;

function geldigeDatum(tekst: string): boolean {
  if (!DATUM.test(tekst)) return false;
  const dag = new Date(`${tekst}T12:00:00Z`);
  const jaar = dag.getUTCFullYear();
  return (
    !Number.isNaN(dag.getTime()) && dag.toISOString().slice(0, 10) === tekst && jaar >= 2000 && jaar <= 2100
  );
}

const optioneleTekst = (max: number) =>
  z.preprocess(leeg, z.string().trim().max(max, `Maximaal ${max} tekens.`).nullable());

const optioneleTijd = z.preprocess(leeg, z.string().regex(TIJD, 'Vul een tijd in zoals 14:00.').nullable());

const SCHEMA = z.object({
  naam: z.string().trim().min(1, 'Vul een naam in.').max(TEKENS_NAAM, `Maximaal ${TEKENS_NAAM} tekens.`),
  datum: z.preprocess(
    (waarde) => (typeof waarde === 'string' ? waarde.trim() : waarde),
    z.string().min(1, 'Vul een datum in.').refine(geldigeDatum, 'Dit is geen datum.'),
  ),
  verzameltijd: optioneleTijd,
  starttijd: optioneleTijd,
  eindtijd: optioneleTijd,
  locatie: optioneleTekst(200),
  bus_vertrektijd: optioneleTijd,
  bus_locatie: optioneleTekst(200),
  notitie: optioneleTekst(TEKENS_NOTITIE),
  afmeld_deadline: z.preprocess(
    leeg,
    z
      .string()
      .regex(TIJDSTIP, 'Vul een datum en tijd in.')
      .refine((tekst) => geldigeDatum(tekst.slice(0, 10)), 'Dit is geen datum.')
      .nullable(),
  ),
  min_aanwezigen: z.preprocess((waarde) => {
    const schoon = leeg(waarde);
    return schoon === null ? null : typeof schoon === 'string' ? Number(schoon) : schoon;
  }, z.number('Vul een getal van 1 of meer in.').int('Vul een heel getal in.').min(1, 'Vul een getal van 1 of meer in.').max(100000, 'Dit getal is te groot.').nullable()),
  groepen: z.array(z.uuid('Kies een groep uit de lijst.')),
});

const TOEVOEGEN = z.object({
  rol: z.enum(TOEVOEGBARE_ROLLEN),
  tijdelijk: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
});

const PLEKFOUT = 'Er klopt iets niet met de plekken. Laad de pagina opnieuw.';
const KEUZE = z.union([z.literal(''), z.literal(PLEK_LEEGMAKEN), z.literal(PLEK_WEGHALEN), z.uuid()]);
const WAS = z.union([z.literal(''), z.uuid()]);
const BESTAANDE_PLEK = /^plek_([0-9a-fA-F-]{36})$/;
const NIEUWE_PLEK = /^plek_nieuw_([A-Za-z0-9_-]{1,40})$/;

/**
 * De plekken uit het formulier als handelingen voor activiteit_opslaan, in een volgorde die klopt: eerst nieuwe plekken
 * (anders bestaat er nog niets om in te delen), dan leegmaken, dan weghalen (een bezette plek wordt eerst leeg), en als
 * laatste indelen. Per bestaande plek is er een keuze (`plek_<id>`) en wie er stond toen het scherm werd getoond
 * (`plek_was_<id>`): dat laatste gaat mee als `verwachte_bezetter`, zodat een ander die intussen iemand indeelde niet
 * ongemerkt wordt overschreven. Een fout komt als `plekken` in `fouten`.
 */
function leesPlekken(formulier: FormData, fouten: Record<string, string>): Wijziging[] {
  const mis = (): void => {
    fouten.plekken = PLEKFOUT;
  };
  const toevoegen: Wijziging[] = [];
  const tijdelijk = new Set<string>();
  for (const waarde of formulier.getAll('plek_toevoegen')) {
    const [rol, naam] = typeof waarde === 'string' ? waarde.split(':') : [];
    const plek = TOEVOEGEN.safeParse({ rol, tijdelijk: naam });
    if (!plek.success || tijdelijk.has(plek.data.tijdelijk)) {
      mis();
      continue;
    }
    tijdelijk.add(plek.data.tijdelijk);
    toevoegen.push({
      handeling: 'plek_toevoegen',
      rol_type: plek.data.rol,
      tijdelijk_id: plek.data.tijdelijk,
    });
  }

  const weghalen = new Set<string>();
  for (const waarde of formulier.getAll('plek_weghalen')) {
    const id = z.uuid().safeParse(waarde);
    if (id.success) weghalen.add(id.data);
    else mis();
  }

  const leegmaken: Wijziging[] = [];
  const indelen: Wijziging[] = [];
  for (const [naam, waarde] of formulier.entries()) {
    const bestaand = BESTAANDE_PLEK.exec(naam);
    if (bestaand) {
      const id = z.uuid().safeParse(bestaand[1]);
      const keuze = KEUZE.safeParse(waarde);
      const was = WAS.safeParse(formulier.get(`plek_was_${bestaand[1]}`));
      if (!id.success || !keuze.success || !was.success) {
        mis();
        continue;
      }
      const voorheen = was.data === '' ? null : was.data;
      if (keuze.data === '') {
        // Een bezette plek heeft geen lege keuze: dit komt niet van ons formulier.
        if (voorheen !== null) mis();
      } else if (keuze.data === PLEK_LEEGMAKEN || keuze.data === PLEK_WEGHALEN) {
        if (voorheen !== null) {
          leegmaken.push({ handeling: 'leegmaken', rol_slot_id: id.data, verwachte_bezetter: voorheen });
        }
        if (keuze.data === PLEK_WEGHALEN) weghalen.add(id.data);
      } else if (keuze.data !== voorheen) {
        indelen.push({
          handeling: 'toewijzen',
          rol_slot_id: id.data,
          lid_id: keuze.data,
          verwachte_bezetter: voorheen,
        });
      }
      continue;
    }

    // Een nieuwe plek, of de eindverantwoordelijke van een nieuwe activiteit: er is nog geen id, alleen een naam.
    const nieuw = NIEUWE_PLEK.exec(naam);
    const naamVanPlek =
      nieuw?.[1] ?? (naam === 'plek_eindverantwoordelijke' ? 'eindverantwoordelijke' : null);
    if (naamVanPlek !== null) {
      const lid = z.union([z.literal(''), z.uuid()]).safeParse(waarde);
      if (!lid.success || (nieuw && !tijdelijk.has(naamVanPlek))) {
        mis();
        continue;
      }
      if (lid.data !== '') {
        indelen.push({
          handeling: 'toewijzen',
          tijdelijk_id: naamVanPlek,
          lid_id: lid.data,
          verwachte_bezetter: null,
        });
      }
    }
  }

  return [
    ...toevoegen,
    ...leegmaken,
    ...[...weghalen].map((id): Wijziging => ({ handeling: 'plek_weghalen', rol_slot_id: id })),
    ...indelen,
  ];
}

function tekstVan(formulier: FormData, naam: string): string {
  const waarde = formulier.get(naam);
  return typeof waarde === 'string' ? waarde : '';
}

/** Leest het formulier. Een fout komt per veld terug (de eerste per veld), met de tekst voor bij het veld. */
export function leesFormulier(formulier: FormData): Uitkomst {
  const invoer = {
    naam: tekstVan(formulier, 'naam'),
    datum: tekstVan(formulier, 'datum'),
    verzameltijd: tekstVan(formulier, 'verzameltijd'),
    starttijd: tekstVan(formulier, 'starttijd'),
    eindtijd: tekstVan(formulier, 'eindtijd'),
    locatie: tekstVan(formulier, 'locatie'),
    bus_vertrektijd: tekstVan(formulier, 'bus_vertrektijd'),
    bus_locatie: tekstVan(formulier, 'bus_locatie'),
    notitie: tekstVan(formulier, 'notitie'),
    afmeld_deadline: tekstVan(formulier, 'afmeld_deadline'),
    min_aanwezigen: tekstVan(formulier, 'min_aanwezigen'),
    groepen: formulier.getAll('groep').filter((waarde): waarde is string => typeof waarde === 'string'),
  };
  const velden = SCHEMA.safeParse(invoer);
  const fouten: Record<string, string> = {};
  if (!velden.success) {
    for (const probleem of velden.error.issues) {
      const veld = String(probleem.path[0] ?? 'formulier');
      fouten[veld] ??= probleem.message;
    }
  } else if (velden.data.starttijd !== null && velden.data.starttijd === velden.data.eindtijd) {
    fouten.eindtijd = 'De eindtijd kan niet gelijk zijn aan de starttijd.';
  }

  const wijzigingen = leesPlekken(formulier, fouten);

  if (Object.keys(fouten).length > 0 || !velden.success) return { ok: false, fouten };
  return { ok: true, velden: velden.data, wijzigingen };
}

// ===== Foutcodes van de database in woorden =====

export interface Fouttekst {
  /** Bij het veld; de sleutel is de veldnaam (of "groepen" of "plekken"). */
  fouten: Record<string, string>;
  /** Bovenaan het formulier, voor wat niet bij één veld hoort. */
  melding: string | null;
}

const VELD_MET_LIDWOORD: Record<string, string> = {
  naam: 'een naam',
  datum: 'een datum',
  starttijd: 'een starttijd',
  eindtijd: 'een eindtijd',
  locatie: 'een locatie',
};

const ALGEMEEN = 'Het opslaan is niet gelukt. Probeer het nog eens; blijft het misgaan, laat het dan weten.';

function lijstUit(detail: unknown, sleutel: string): string[] {
  if (typeof detail !== 'object' || detail === null) return [];
  const waarde: unknown = (detail as Record<string, unknown>)[sleutel];
  return Array.isArray(waarde) ? waarde.filter((deel): deel is string => typeof deel === 'string') : [];
}

function veldUit(detail: unknown): string | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const waarde: unknown = (detail as Record<string, unknown>).veld;
  return typeof waarde === 'string' ? waarde : null;
}

function tekstUit(detail: unknown, sleutel: string): string | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const waarde: unknown = (detail as Record<string, unknown>)[sleutel];
  return typeof waarde === 'string' ? waarde : null;
}

/** De detailtekst van de database (JSON als tekst) als object; wat er niet in past, wordt een leeg object. */
export function leesDetail(tekst: unknown): unknown {
  if (typeof tekst !== 'string') return {};
  try {
    return JSON.parse(tekst) as unknown;
  } catch {
    return {};
  }
}

export type OpslagDoel =
  | { soort: 'nieuw' }
  | { soort: 'bewerken'; id: string; versie: number }
  | { soort: 'fout'; reden: 'modus' | 'id' | 'versie' };

const ID_TEKST = z.uuid();
const VERSIE_TEKST = z.coerce.number().int().min(1).max(2_000_000_000);

/**
 * Wat het formulier wil: een nieuwe activiteit maken, of een bestaande bewerken. Dat staat er uitdrukkelijk in (`modus`), want
 * de database maakt van een aanroep zonder id altijd een nieuwe activiteit: een bewerking zonder id of versie mag dus nooit
 * stilletjes een nieuw concept worden (CR-06). Bij bewerken zijn id én versie verplicht; bij nieuw mogen ze er niet zijn.
 */
export function leesOpslagDoel(formulier: FormData): OpslagDoel {
  const modus = formulier.get('modus');
  const idTekst = formulier.get('activiteit_id');
  if (modus === 'nieuw') {
    const leeg = (waarde: FormDataEntryValue | null) => waarde === null || waarde === '';
    return leeg(idTekst) && leeg(formulier.get('versie'))
      ? { soort: 'nieuw' }
      : { soort: 'fout', reden: 'modus' };
  }
  if (modus !== 'bewerken') return { soort: 'fout', reden: 'modus' };
  const id = ID_TEKST.safeParse(idTekst);
  if (!id.success) return { soort: 'fout', reden: 'id' };
  const versie = VERSIE_TEKST.safeParse(formulier.get('versie'));
  if (!versie.success) return { soort: 'fout', reden: 'versie' };
  return { soort: 'bewerken', id: id.data, versie: versie.data };
}

/** Vertaalt de foutcode van activiteit_opslaan naar teksten bij het veld of bovenaan. */
export function vertaalOpslagfout(code: string, detail: unknown): Fouttekst {
  switch (code) {
    case 'veld_ontbreekt': {
      const fouten: Record<string, string> = {};
      for (const veld of lijstUit(detail, 'velden')) {
        const naam = VELD_MET_LIDWOORD[veld];
        if (naam) fouten[veld] = `Vul ${naam} in.`;
      }
      return Object.keys(fouten).length > 0 ? { fouten, melding: null } : { fouten, melding: ALGEMEEN };
    }
    case 'veld_ongeldig': {
      const veld = veldUit(detail);
      if (veld === 'eindtijd') {
        return { fouten: { eindtijd: 'De eindtijd kan niet gelijk zijn aan de starttijd.' }, melding: null };
      }
      return veld && veld !== 'velden' && veld !== 'verwachte_versie'
        ? { fouten: { [veld]: 'Dit klopt niet. Controleer wat je hebt ingevuld.' }, melding: null }
        : { fouten: {}, melding: ALGEMEEN };
    }
    case 'versie_verouderd':
      return {
        fouten: {},
        melding:
          'Iemand anders heeft deze activiteit net gewijzigd. Je wijzigingen zijn niet opgeslagen. Laad de pagina opnieuw en probeer het nog eens.',
      };
    case 'activiteit_onbekend':
      return { fouten: {}, melding: 'Deze activiteit bestaat niet meer.' };
    case 'activiteit_niet_open':
      return { fouten: {}, melding: 'Deze activiteit staat niet meer open voor wijzigingen.' };
    case 'groep_onbekend':
      return {
        fouten: { groepen: 'Een van de gekozen groepen bestaat niet meer. Laad de pagina opnieuw.' },
        melding: null,
      };
    case 'slot_gewijzigd':
    case 'plek_onbekend':
    case 'plek_niet_leeg':
      return {
        fouten: {},
        melding:
          'Deze plek is inmiddels gewijzigd. Terwijl je bezig was, is hij door iemand anders aangepast. Je wijzigingen zijn niet opgeslagen, zodat je niet ongemerkt overschrijft wat een ander net heeft geregeld. Laad de pagina opnieuw en kies opnieuw.',
      };
    case 'lid_buiten_doelgroep':
      return {
        fouten: {
          plekken:
            'Iemand die je hebt ingedeeld, hoort niet bij de groep voor wie deze activiteit is. Kies iemand anders of pas "Voor wie" aan.',
        },
        melding: null,
      };
    case 'doelgroep_conflict':
      return {
        fouten: {
          groepen:
            'Er staan nog leden ingedeeld die niet bij de gekozen groepen horen. Haal ze eerst van hun plek.',
        },
        melding: null,
      };
    case 'lid_inactief':
      return {
        fouten: { plekken: 'Iemand die je hebt gekozen, is geen actief lid meer. Kies iemand anders.' },
        melding: null,
      };
    case 'lid_afgemeld':
      return {
        fouten: {
          plekken:
            'Iemand die je hebt gekozen, heeft zich voor deze activiteit afgemeld. Kies iemand anders.',
        },
        melding: null,
      };
    case 'extern_niet_toegestaan':
      return {
        fouten: { plekken: 'Een externe helper kan geen BOB of eindverantwoordelijke zijn. Kies een lid.' },
        melding: null,
      };
    case 'dubbelboeking':
      return {
        fouten: { plekken: 'Iemand staat op twee plekken. Kies voor elke plek een ander.' },
        melding: null,
      };
    case 'eindverantwoordelijke_verplicht':
      // Een gepubliceerde activiteit houdt zijn eindverantwoordelijke, en leden moeten hem kunnen bellen (R21, R10).
      return {
        fouten: {
          plekken:
            tekstUit(detail, 'reden') === 'telefoon'
              ? 'De eindverantwoordelijke heeft geen telefoonnummer, en leden moeten hem kunnen bellen. Kies iemand met een telefoonnummer.'
              : 'De eindverantwoordelijke kan niet worden weggehaald; kies iemand anders.',
        },
        melding: null,
      };
    default:
      return { fouten: {}, melding: ALGEMEEN };
  }
}

// ===== Van de database naar het formulier =====

/** "14:00" uit "14:00:00"; leeg als er geen tijd is. */
export function tijdVoorVeld(tijd: string | null): string {
  return tijd ? tijd.slice(0, 5) : '';
}

/** Een tijdstip (met tijdzone) als "2027-02-01T20:00" in Amsterdamse tijd, zoals een datum-en-tijdveld het wil. */
export function tijdstipVoorVeld(tijdstip: string | null): string {
  if (!tijdstip) return '';
  const moment = new Date(tijdstip);
  if (Number.isNaN(moment.getTime())) return '';
  const delen = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(moment);
  return delen.replace(' ', 'T');
}

/** Wat er nog nodig is om te publiceren (R21), in woorden voor het statuspaneel. */
export function nogNodigOmTePubliceren(a: {
  starttijd: string | null;
  eindtijd: string | null;
  locatie: string | null;
  heeftEindverantwoordelijke: boolean;
  eindverantwoordelijkeHeeftTelefoon: boolean;
}): string[] {
  const lijst: string[] = [];
  if (!a.starttijd) lijst.push('Starttijd');
  if (!a.eindtijd) lijst.push('Eindtijd');
  if (!a.locatie) lijst.push('Locatie');
  if (!a.heeftEindverantwoordelijke) lijst.push('Eindverantwoordelijke');
  else if (!a.eindverantwoordelijkeHeeftTelefoon) lijst.push('Telefoonnummer van de eindverantwoordelijke');
  return lijst;
}

// ===== Terug in het formulier na een fout =====

/** De tekstvelden van het formulier, in de volgorde van het scherm. */
export const TEKSTVELDEN = [
  'naam',
  'datum',
  'verzameltijd',
  'starttijd',
  'eindtijd',
  'locatie',
  'bus_vertrektijd',
  'bus_locatie',
  'notitie',
  'afmeld_deadline',
  'min_aanwezigen',
] as const;

/** Wat de beheerder had ingevuld, zodat het na een fout terugkomt in het formulier (React leegt het anders). */
export interface Waarden {
  tekst: Record<string, string>;
  groepen: string[];
  plekToevoegen: string[];
  plekWeghalen: string[];
  /** Wat er in de keuzelijsten van de plekken stond, per veldnaam (plek_<id>, plek_nieuw_<naam>, plek_eindverantwoordelijke). */
  plekKeuzes: Record<string, string>;
}

export function leesWaarden(formulier: FormData): Waarden {
  const tekst: Record<string, string> = {};
  for (const veld of TEKSTVELDEN) tekst[veld] = tekstVan(formulier, veld);
  const lijst = (naam: string): string[] =>
    formulier.getAll(naam).filter((waarde): waarde is string => typeof waarde === 'string');
  const plekKeuzes: Record<string, string> = {};
  for (const [naam, waarde] of formulier.entries()) {
    const eigenKeuze = naam.startsWith('plek_') && naam !== 'plek_toevoegen' && naam !== 'plek_weghalen';
    if (eigenKeuze && !naam.startsWith('plek_was_') && typeof waarde === 'string') plekKeuzes[naam] = waarde;
  }
  return {
    tekst,
    groepen: lijst('groep'),
    plekToevoegen: lijst('plek_toevoegen'),
    plekWeghalen: lijst('plek_weghalen'),
    plekKeuzes,
  };
}
