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
 * Voegt dingen op opeenvolgende dagen samen tot één reeks: dezelfde sleutel (bijvoorbeeld naam, status, tijd en plaats) op
 * drie of meer dagen na elkaar (MIN_REEKS). Een reeks staat op de plek van zijn eerste dag; de overige dagen verdwijnen uit de
 * lijst (ze zitten in de reeks). Een ander ding tussendoor breekt de reeks niet: die telt per sleutel. Algemeen, zodat het
 * programma en het beheeroverzicht dezelfde regels gebruiken.
 */
export function groepeerOpeenvolgend<T extends { id: string }>(
  lijst: T[],
  sleutel: (item: T) => string,
  datum: (item: T) => string,
): Array<{ soort: 'enkel'; item: T } | { soort: 'reeks'; items: T[] }> {
  const perSleutel = new Map<string, T[]>();
  for (const item of lijst) {
    const k = sleutel(item);
    perSleutel.set(k, [...(perSleutel.get(k) ?? []), item]);
  }

  const reeksVanEerste = new Map<string, T[]>();
  const inReeks = new Set<string>();
  for (const groep of perSleutel.values()) {
    const opDatum = [...groep].sort((x, y) => (datum(x) < datum(y) ? -1 : datum(x) > datum(y) ? 1 : 0));
    let lopend: T[] = [];
    const sluit = () => {
      const eerste = lopend[0];
      if (lopend.length >= MIN_REEKS && eerste) {
        reeksVanEerste.set(eerste.id, lopend);
        for (const item of lopend) inReeks.add(item.id);
      }
      lopend = [];
    };
    for (const item of opDatum) {
      const vorige = lopend[lopend.length - 1];
      if (vorige && dagenTussen(datum(vorige), datum(item)) !== 1) sluit();
      lopend.push(item);
    }
    sluit();
  }

  const uit: Array<{ soort: 'enkel'; item: T } | { soort: 'reeks'; items: T[] }> = [];
  for (const item of lijst) {
    const reeks = reeksVanEerste.get(item.id);
    if (reeks) uit.push({ soort: 'reeks', items: reeks });
    else if (!inReeks.has(item.id)) uit.push({ soort: 'enkel', item });
  }
  return uit;
}

/**
 * Voegt dezelfde activiteit op opeenvolgende dagen samen tot één rij. Dezelfde activiteit is: dezelfde naam, status, starttijd
 * en locatie.
 */
export function groepeerReeksen(lijst: ProgrammaActiviteit[]): ProgrammaItem[] {
  return groepeerOpeenvolgend(
    lijst,
    (a) => [a.naam, a.status, a.starttijd ?? '', a.locatie ?? ''].join('\u0000'),
    (a) => a.datum,
  ).map((rij): ProgrammaItem => {
    if (rij.soort === 'enkel') return { soort: 'enkel', activiteit: rij.item };
    const eerste = rij.items[0];
    if (!eerste) throw new Error('lege reeks');
    return { soort: 'reeks', reeks: { naam: eerste.naam, status: eerste.status, activiteiten: rij.items } };
  });
}

/**
 * De periode van twee dagen, zoals een schermlezer het hoort: "ma 4 t/m vr 8 januari". Een periode die de maandgrens kruist
 * krijgt de maand twee keer.
 */
export function periodeTekst(eerste: string, laatste: string): string {
  const van = dagTekst(eerste);
  const tot = dagTekst(laatste);
  const maand = (lang: string) => lang.split(' ').slice(2).join(' ');
  const vanTekst = maand(van.lang) === maand(tot.lang) ? `${van.weekdag} ${van.dag}` : van.lang;
  return `${vanTekst} t/m ${tot.lang}`;
}

/**
 * De periode van een reeks voor een schermlezer: "ma 4 t/m vr 8 januari". Zichtbaar staat de periode in het datumblok
 * ("4–8", "MA–VR"); in de tekst herhalen we haar niet.
 */
export function reeksDatum(reeks: Reeks): string {
  const eerste = reeks.activiteiten[0];
  const laatste = reeks.activiteiten[reeks.activiteiten.length - 1];
  if (!eerste || !laatste) throw new Error('lege reeks');
  return periodeTekst(eerste.datum, laatste.datum);
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
