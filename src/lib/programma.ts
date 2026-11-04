// Het programma van het seizoen: de activiteiten per maand, de komende bovenaan en wat geweest is eronder (wireframe
// programma, docs/ux-flows). Alles hier is zuivere logica zonder database, zodat de grenzen (vandaag, het jaarwissel, een
// activiteit zonder tijd) met tests vast te leggen zijn.
//
// Een datum is een kalenderdag als tekst (YYYY-MM-DD), zoals de database hem geeft; "vandaag" is de dag in Nederland
// (Europe/Amsterdam), niet in UTC: een lid dat om 00:30 kijkt, ziet de nieuwe dag. Of een activiteit geweest is, bepaalt
// niet de dag maar het eindmoment (R16): de Bonte Avond van vrijdag eindigt om 01:11 en is om 00:30 nog niet geweest.
// Dat moment komt uit de database (de kolom eindigt_om, één formule met de tests rond middernacht en de zomertijd);
// hier wordt het alleen vergeleken met het moment van nu (Datamodel-fase-2.md punt 5).

export type ActiviteitStatus = 'concept' | 'gepubliceerd' | 'geannuleerd';

export interface ProgrammaActiviteit {
  id: string;
  naam: string;
  /** YYYY-MM-DD */
  datum: string;
  /** HH:MM of HH:MM:SS, zoals de database het geeft; leeg als de tijd nog niet bekend is. */
  starttijd: string | null;
  locatie: string | null;
  status: ActiviteitStatus;
  /** Het eindmoment als tijdstip met tijdzone (de kolom eindigt_om); vanaf dit moment is de activiteit geweest. */
  eindigtOm: string;
}

export interface Maand {
  /** YYYY-MM */
  sleutel: string;
  /** "Januari 2027" */
  titel: string;
  activiteiten: ProgrammaActiviteit[];
}

export interface Programma {
  komende: Maand[];
  geweest: Maand[];
  aantalKomende: number;
}

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

export function isActiviteitStatus(waarde: unknown): waarde is ActiviteitStatus {
  return waarde === 'concept' || waarde === 'gepubliceerd' || waarde === 'geannuleerd';
}

/** De kalenderdag in Nederland, als YYYY-MM-DD. */
export function vandaagInNederland(nu: Date): string {
  // sv-SE schrijft een datum als YYYY-MM-DD.
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(nu);
}

function alsDatum(datum: string): Date {
  if (!DATUM.test(datum)) throw new Error('ongeldige datum');
  return new Date(`${datum}T12:00:00Z`);
}

const WEEKDAG = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', timeZone: 'UTC' });
const WEEKDAG_LANG = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', timeZone: 'UTC' });
const DAG = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', timeZone: 'UTC' });
const MAAND_LANG = new Intl.DateTimeFormat('nl-NL', { month: 'long', timeZone: 'UTC' });
const MAAND_EN_JAAR = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** De delen van een datum voor het datumblok en de regel: "vr", "22", "vr 22 januari". */
export function dagTekst(datum: string): { weekdag: string; dag: string; lang: string } {
  const d = alsDatum(datum);
  const weekdag = WEEKDAG.format(d).replace('.', '');
  const dag = DAG.format(d);
  return { weekdag, dag, lang: `${weekdag} ${dag} ${MAAND_LANG.format(d)}` };
}

/** De dag voluit, voor een kop: "zaterdag 6 februari". */
export function langeDag(datum: string): string {
  const d = alsDatum(datum);
  return `${WEEKDAG_LANG.format(d)} ${DAG.format(d)} ${MAAND_LANG.format(d)}`;
}

/** "Januari 2027". */
export function maandTitel(datum: string): string {
  const tekst = MAAND_EN_JAAR.format(alsDatum(datum));
  return tekst.charAt(0).toUpperCase() + tekst.slice(1);
}

/** "18:30" uit "18:30:00"; leeg als er geen tijd is. */
export function tijdTekst(tijd: string | null): string | null {
  if (!tijd) return null;
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(tijd);
  if (!m) throw new Error('ongeldige tijd');
  return `${m[1]}:${m[2]}`;
}

/** De regel onder de naam: tijd en plaats, alleen wat is ingevuld (ontwerpregel: toon alleen wat er is). */
export function regelOnderNaam(a: Pick<ProgrammaActiviteit, 'starttijd' | 'locatie'>): string {
  return [tijdTekst(a.starttijd), a.locatie].filter((deel): deel is string => Boolean(deel)).join(' · ');
}

function vergelijk(a: ProgrammaActiviteit, b: ProgrammaActiviteit): number {
  if (a.datum !== b.datum) return a.datum < b.datum ? -1 : 1;
  // zonder tijd achteraan; gelijk: op naam, zodat de volgorde nooit van de database afhangt
  const ta = a.starttijd ?? '99:99';
  const tb = b.starttijd ?? '99:99';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.naam.localeCompare(b.naam, 'nl');
}

function perMaand(lijst: ProgrammaActiviteit[]): Maand[] {
  const maanden: Maand[] = [];
  for (const activiteit of lijst) {
    const sleutel = activiteit.datum.slice(0, 7);
    const laatste = maanden[maanden.length - 1];
    if (laatste?.sleutel === sleutel) laatste.activiteiten.push(activiteit);
    else maanden.push({ sleutel, titel: maandTitel(activiteit.datum), activiteiten: [activiteit] });
  }
  return maanden;
}

/** Is de activiteit geweest op dit moment? Het exacte eindmoment telt als geweest (R16). */
export function isGeweest(activiteit: Pick<ProgrammaActiviteit, 'eindigtOm'>, nu: Date): boolean {
  const einde = Date.parse(activiteit.eindigtOm);
  if (Number.isNaN(einde) || Number.isNaN(nu.getTime())) throw new Error('ongeldig moment');
  return einde <= nu.getTime();
}

/**
 * Deelt het programma in: de komende (nog niet voorbij, op volgorde) en wat geweest is (het laatste eerst, zoals in het
 * ontwerp). Een geannuleerde activiteit blijft zichtbaar met zijn label. Wat geweest is, beslist het eindmoment (R16).
 */
export function maakProgramma(activiteiten: ProgrammaActiviteit[], nu: Date): Programma {
  const gesorteerd = [...activiteiten].sort(vergelijk);
  const komende = gesorteerd.filter((a) => !isGeweest(a, nu));
  const geweest = gesorteerd.filter((a) => isGeweest(a, nu)).reverse();
  return { komende: perMaand(komende), geweest: perMaand(geweest), aantalKomende: komende.length };
}

/**
 * Waar een rij in het programma naartoe gaat. Een lid opent de activiteit zoals een lid hem ziet. Het bestuur ziet ook wat een lid
 * niet ziet: een concept, of een gepubliceerde activiteit voor een groep waar de beheerder zelf niet bij hoort. Die opent in
 * beheer, anders zou de link een 404 geven (CR-12).
 */
export function programmaLink(
  activiteit: Pick<ProgrammaActiviteit, 'id' | 'status'>,
  zichtbaarAlsLid: boolean,
): string {
  return activiteit.status === 'concept' || !zichtbaarAlsLid
    ? `/beheer/activiteiten/${activiteit.id}`
    : `/programma/${activiteit.id}`;
}
