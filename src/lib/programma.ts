// Het programma van het seizoen: de activiteiten per maand, de komende bovenaan en wat geweest is eronder (wireframe
// programma, docs/ux-flows). Alles hier is zuivere logica zonder database, zodat de grenzen (vandaag, het jaarwissel, een
// activiteit zonder tijd) met tests vast te leggen zijn.
//
// Een datum is een kalenderdag als tekst (YYYY-MM-DD), zoals de database hem geeft; "vandaag" is de dag in Nederland
// (Europe/Amsterdam), niet in UTC: een lid dat om 00:30 kijkt, ziet de nieuwe dag.

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

/**
 * Deelt het programma in: de komende (vandaag en later, op volgorde) en wat geweest is (het laatste eerst, zoals in het
 * ontwerp). Een geannuleerde activiteit blijft zichtbaar met zijn label. Vandaag telt als komend; wanneer iets voorbij is,
 * beslist later de eindtijd (R16), hier de dag.
 */
export function maakProgramma(activiteiten: ProgrammaActiviteit[], vandaag: string): Programma {
  if (!DATUM.test(vandaag)) throw new Error('ongeldige datum');
  const gesorteerd = [...activiteiten].sort(vergelijk);
  const komende = gesorteerd.filter((a) => a.datum >= vandaag);
  const geweest = gesorteerd.filter((a) => a.datum < vandaag).reverse();
  return { komende: perMaand(komende), geweest: perMaand(geweest), aantalKomende: komende.length };
}
