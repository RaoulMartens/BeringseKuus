// Beheerders beheren in de app (wireframes admin-beheerders en de schermen eromheen, ronde 19): wat de lijst zegt, hoe een
// regel eruitziet, en de foutcodes in woorden. Alles hier is zuivere logica zonder database. De regels zelf staan in de
// database (migratie 20261110150000, naast is_beheerder() en beheerstatus()); dit is alleen de vertaling naar woorden.

/**
 * Hoe het met een beheerder staat, zoals public.beheerders_lijst() het zegt:
 *  - wacht_op_app           beheerder gemaakt, maar nog geen app ingesteld
 *  - wacht_op_bevestiging   app ingesteld; een andere beheerder moet de toegang bevestigen
 *  - beheerder              bevestigd
 */
export type BeheerderStatus = 'wacht_op_app' | 'wacht_op_bevestiging' | 'beheerder';

export interface Beheerder {
  lidId: string;
  naam: string;
  status: BeheerderStatus;
  /** Wanneer beheerder_sinds voor het laatst is gezet (de bevestiging telt mee). */
  sinds: string;
  appId: string | null;
  appNaam: string | null;
  appIngesteld: string | null;
  aantalApps: number;
  isIk: boolean;
}

export interface Kandidaat {
  lidId: string;
  naam: string;
}

/** De rij zoals de database hem geeft (public.beheerders_lijst()). */
export interface BeheerderRij {
  lid_id: string;
  voornaam: string;
  achternaam: string;
  status: string;
  beheerder_sinds: string;
  app_id: string | null;
  app_naam: string | null;
  app_ingesteld: string | null;
  aantal_apps: number;
  is_ik: boolean;
}

const STATUSSEN: readonly string[] = ['wacht_op_app', 'wacht_op_bevestiging', 'beheerder'];

function isStatus(waarde: string): waarde is BeheerderStatus {
  return STATUSSEN.includes(waarde);
}

/** Voornaam en achternaam als één naam; de achternaam mag leeg zijn. */
export function volledigeNaam(voornaam: string, achternaam: string): string {
  return `${voornaam} ${achternaam}`.trim();
}

/** De rijen van de database als beheerders. Een status die we niet kennen is een fout, geen stille aanname. */
export function leesBeheerders(rijen: BeheerderRij[]): Beheerder[] {
  return rijen.map((rij) => {
    if (!isStatus(rij.status)) throw new Error('beheerstatus van een lid onbekend');
    return {
      lidId: rij.lid_id,
      naam: volledigeNaam(rij.voornaam, rij.achternaam),
      status: rij.status,
      sinds: rij.beheerder_sinds,
      appId: rij.app_id,
      appNaam: rij.app_naam,
      appIngesteld: rij.app_ingesteld,
      aantalApps: rij.aantal_apps,
      isIk: rij.is_ik,
    };
  });
}

/** Het overzicht in twee blokken, zoals het activiteitenoverzicht: wat jouw aandacht vraagt, en wie beheerder is. */
export function maakBeheerdersoverzicht(beheerders: Beheerder[]): {
  aandacht: Beheerder[];
  beheerders: Beheerder[];
} {
  const opNaam = (a: Beheerder, b: Beheerder) => a.naam.localeCompare(b.naam, 'nl');
  return {
    // Je eigen regel staat nooit bij aandacht: je kunt je eigen toegang niet bevestigen.
    aandacht: beheerders.filter((b) => b.status === 'wacht_op_bevestiging' && !b.isIk).sort(opNaam),
    beheerders: beheerders
      .filter((b) => b.status !== 'wacht_op_bevestiging' || b.isIk)
      .sort((a, b) => Number(b.isIk) - Number(a.isIk) || opNaam(a, b)),
  };
}

/** Het aantal toegangen dat een beheerder nog moet bevestigen. */
export function aantalTeBevestigen(beheerders: Beheerder[]): number {
  return maakBeheerdersoverzicht(beheerders).aandacht.length;
}

/** De regel op de zijkaart "Beheerders" in het activiteitenoverzicht: de taak in woorden, anders een uitnodiging. */
export function ingangTekst(aantal: number): string {
  if (aantal === 0) return 'Beheerders bekijken';
  return aantal === 1 ? '1 toegang bevestigen' : `${aantal} toegangen bevestigen`;
}

const NL = 'nl-NL';
const TIJDZONE = 'Europe/Amsterdam';

/** "29 oktober", in de tijd van Nederland. Zonder jaar: voor beheerder_sinds is het jaar zelden nodig. */
export function dagMaand(iso: string): string {
  return new Intl.DateTimeFormat(NL, { day: 'numeric', month: 'long', timeZone: TIJDZONE }).format(
    new Date(iso),
  );
}

/** "21 januari 2027 om 14:05", in de tijd van Nederland. Voor het moment waarop een app is ingesteld. */
export function datumEnTijd(iso: string): string {
  const d = new Date(iso);
  const dag = new Intl.DateTimeFormat(NL, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TIJDZONE,
  }).format(d);
  const tijd = new Intl.DateTimeFormat(NL, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: TIJDZONE,
  }).format(d);
  return `${dag} om ${tijd}`;
}

/** De regel onder de naam in de lijst. */
export function regelOnderNaam(b: Beheerder): string {
  switch (b.status) {
    case 'wacht_op_bevestiging':
      return `Toegang bevestigen · app ingesteld op ${b.appIngesteld ? datumEnTijd(b.appIngesteld) : 'onbekend moment'}`;
    case 'wacht_op_app':
      return 'Moet nog een app instellen';
    case 'beheerder':
      return `Beheerder sinds ${dagMaand(b.sinds)}`;
  }
}

/** De foutcode van een handeling als tekst voor de bevestigingspagina. */
export function vertaalBeheerderfout(code: string): string {
  switch (code) {
    case 'lid_onbekend':
      return 'Dit lid kan geen beheerder worden of bestaat niet meer.';
    case 'lid_geen_account':
      return 'Dit lid heeft nog geen inlogaccount en kan daarom geen beheerder worden.';
    case 'al_beheerder':
      return 'Dit lid is al beheerder.';
    case 'geen_beheerder':
      return 'Dit lid is geen beheerder (meer). Er is niets gewijzigd.';
    case 'zelf':
      return 'Je kunt dit niet voor jezelf doen. Een andere beheerder kan het wel.';
    case 'niets_te_bevestigen':
      return 'Er is niets te bevestigen: dit lid heeft geen nieuwe app ingesteld.';
    case 'app_onduidelijk':
      return 'Dit lid heeft meer dan één app ingesteld, en dan weet je niet welke van het lid zelf is. Trek de beheerrechten in en laat het lid opnieuw beginnen met één app.';
    case 'app_gewijzigd':
      return 'De app van dit lid is intussen veranderd. Er is niets bevestigd. Open de pagina opnieuw en lees de gegevens na.';
    default:
      return 'Het is niet gelukt. Probeer het nog eens; blijft het misgaan, laat het dan weten.';
  }
}

/** Welke melding bovenaan het overzicht staat na een handeling, in de woorden van de knop. */
export type BeheerderHandeling = 'toegevoegd' | 'bevestigd' | 'ingetrokken';

export function isHandeling(waarde: unknown): waarde is BeheerderHandeling {
  return waarde === 'toegevoegd' || waarde === 'bevestigd' || waarde === 'ingetrokken';
}

/** De melding na een handeling: een vette zin en een vervolg. */
export function meldingTekst(handeling: BeheerderHandeling, naam: string): { vet: string; vervolg: string } {
  switch (handeling) {
    case 'toegevoegd':
      return {
        vet: `${naam} is beheerder gemaakt.`,
        vervolg: 'Die moet nog een app instellen. Er is geen bericht gestuurd: zeg het zelf.',
      };
    case 'bevestigd':
      return { vet: `De toegang van ${naam} is bevestigd.`, vervolg: 'Die kan nu bij Beheer.' };
    case 'ingetrokken':
      return {
        vet: `${naam} is geen beheerder meer.`,
        vervolg: 'Die blijft lid; diensten en groepen blijven staan.',
      };
  }
}
