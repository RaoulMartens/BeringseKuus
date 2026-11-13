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

/**
 * Een reeks: dezelfde activiteit op meerdere opeenvolgende dagen, zoals het verkopen van donateurskaarten van maandag tot
 * en met vrijdag. Zo'n reeks is in het programma één rij, met de losse dagen eronder. Zonder dit staat dezelfde naam
 * vijf keer onder elkaar en lijkt het programma een lijst met fouten.
 */
export interface Reeks {
  naam: string;
  status: ActiviteitStatus;
  /** Op volgorde van datum, minstens MIN_REEKS. */
  activiteiten: ProgrammaActiviteit[];
}

/** Een rij in het programma: een enkele activiteit, of een reeks. */
export type ProgrammaItem =
  { soort: 'enkel'; activiteit: ProgrammaActiviteit } | { soort: 'reeks'; reeks: Reeks };

/**
 * Vanaf hoeveel opeenvolgende dagen het een reeks is. Twee dagen (een vrijdag en een zaterdag met dezelfde naam) zijn twee
 * avonden die elk hun eigen rij verdienen; bij drie of meer is het één terugkerende activiteit.
 */
export const MIN_REEKS = 3;

function dagenTussen(van: string, tot: string): number {
  return Math.round((alsDatum(tot).getTime() - alsDatum(van).getTime()) / 86_400_000);
}

/**
 * Voegt dezelfde activiteit op opeenvolgende dagen samen tot één rij. Dezelfde activiteit is: dezelfde naam, status, starttijd
 * en locatie. Een reeks staat op de plek van zijn eerste dag; de overige dagen verdwijnen uit de lijst (ze zitten in de reeks).
 * Een andere activiteit tussendoor (een vergadering op dag 2) breekt de reeks niet: die telt per soort activiteit.
 */
export function groepeerReeksen(lijst: ProgrammaActiviteit[]): ProgrammaItem[] {
  const perSoort = new Map<string, ProgrammaActiviteit[]>();
  for (const a of lijst) {
    const sleutel = [a.naam, a.status, a.starttijd ?? '', a.locatie ?? ''].join('\u0000');
    perSoort.set(sleutel, [...(perSoort.get(sleutel) ?? []), a]);
  }

  const reeksVanEerste = new Map<string, ProgrammaActiviteit[]>();
  const inReeks = new Set<string>();
  for (const groep of perSoort.values()) {
    const opDatum = [...groep].sort((x, y) => (x.datum < y.datum ? -1 : x.datum > y.datum ? 1 : 0));
    let lopend: ProgrammaActiviteit[] = [];
    const sluit = () => {
      if (lopend.length >= MIN_REEKS && lopend[0]) {
        reeksVanEerste.set(lopend[0].id, lopend);
        for (const a of lopend) inReeks.add(a.id);
      }
      lopend = [];
    };
    for (const a of opDatum) {
      const vorige = lopend[lopend.length - 1];
      if (vorige && dagenTussen(vorige.datum, a.datum) !== 1) sluit();
      lopend.push(a);
    }
    sluit();
  }

  const items: ProgrammaItem[] = [];
  for (const a of lijst) {
    const reeks = reeksVanEerste.get(a.id);
    if (reeks) items.push({ soort: 'reeks', reeks: { naam: a.naam, status: a.status, activiteiten: reeks } });
    else if (!inReeks.has(a.id)) items.push({ soort: 'enkel', activiteit: a });
  }
  return items;
}

/**
 * De periode van een reeks voor een schermlezer: "ma 4 t/m vr 8 januari". Zichtbaar staat de periode in het datumblok
 * ("4–8", "MA–VR"); in de tekst herhalen we haar niet.
 */
export function reeksDatum(reeks: Reeks): string {
  const eerste = reeks.activiteiten[0];
  const laatste = reeks.activiteiten[reeks.activiteiten.length - 1];
  if (!eerste || !laatste) throw new Error('lege reeks');
  const van = dagTekst(eerste.datum);
  const tot = dagTekst(laatste.datum);
  const maand = tot.lang.split(' ').slice(2).join(' ');
  // Dezelfde maand: "ma 4 t/m vr 8 januari"; een reeks die de maandgrens kruist krijgt de maand twee keer.
  const vanTekst = van.lang.split(' ').slice(2).join(' ') === maand ? `${van.weekdag} ${van.dag}` : van.lang;
  return `${vanTekst} t/m ${tot.lang}`;
}

/**
 * De regel onder de naam van een reeks: tijd en plaats, zoals bij elke andere rij. Die zijn voor alle dagen gelijk (anders was
 * het geen reeks). Het aantal dagen staat niet in de tekst: het datumblok toont de periode ("4–8"). Leeg als er geen tijd en
 * plaats zijn.
 */
export function reeksRegel(reeks: Reeks): string {
  const eerste = reeks.activiteiten[0];
  if (!eerste) throw new Error('lege reeks');
  return regelOnderNaam(eerste);
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
