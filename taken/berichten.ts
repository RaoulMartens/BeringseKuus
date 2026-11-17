// Berichten per mail (O-1): wat de taken-Worker van de klaargezette regels in `berichten` maakt. Zuivere logica, zonder
// netwerk en zonder database, zodat de regels met tests vast te leggen zijn (scripts/taken-berichten.test.ts). Alleen eigen
// bestanden en geen pakketten: de uitroljob installeert er geen (scripts/controleer-poort.ts).
//
// Eén mail per lid per activiteit: wie in één opslag drie dingen wijzigt, krijgt één mail met drie regels, en een regel die
// twee keer klaarstaat komt er één keer in. Geen afbeeldingen en geen volglinks; een tekstversie naast de HTML.

export interface Berichtregel {
  id: number;
  lid_id: string;
  activiteit_id: string | null;
  activiteit_naam: string;
  /** JJJJ-MM-DD */
  activiteit_datum: string;
  /** Eén of meer regels, gescheiden door een regeleinde. */
  tekst: string;
}

/** Wat samen in één mail gaat. */
export interface Groep {
  lidId: string;
  activiteitId: string | null;
  /** Naam en datum van de laatste regel: als de activiteit tussendoor is hernoemd of verplaatst, staat de nieuwste in de kop. */
  activiteitNaam: string;
  activiteitDatum: string;
  regels: string[];
  /** De id's van de berichten in deze mail, om na het versturen op "verstuurd" te zetten. */
  ids: number[];
}

/** Voegt de berichten van één lid over één activiteit samen, in de volgorde waarin ze klaarstonden. */
export function groepeer(berichten: readonly Berichtregel[]): Groep[] {
  const groepen = new Map<string, Groep>();
  for (const bericht of [...berichten].sort((a, b) => a.id - b.id)) {
    const sleutel = `${bericht.lid_id}|${bericht.activiteit_id ?? `${bericht.activiteit_naam}|${bericht.activiteit_datum}`}`;
    let groep = groepen.get(sleutel);
    if (!groep) {
      groep = {
        lidId: bericht.lid_id,
        activiteitId: bericht.activiteit_id,
        activiteitNaam: bericht.activiteit_naam,
        activiteitDatum: bericht.activiteit_datum,
        regels: [],
        ids: [],
      };
      groepen.set(sleutel, groep);
    }
    groep.activiteitNaam = bericht.activiteit_naam;
    groep.activiteitDatum = bericht.activiteit_datum;
    groep.ids.push(bericht.id);
    for (const regel of bericht.tekst.split('\n')) {
      const schoon = regel.trim();
      if (schoon !== '' && !groep.regels.includes(schoon)) groep.regels.push(schoon);
    }
  }
  return [...groepen.values()];
}

/** Wat de Worker vlak vóór het versturen nog eens controleert (de database controleerde het bij het klaarzetten). */
export interface LidStand {
  actief: boolean;
  type: string;
  alleen_beheer: boolean;
}
export interface ActiviteitStand {
  status: string;
  /** ISO-tijdstip. */
  eindigt_om: string;
}

/**
 * Waarom een bericht toch niet meer verstuurd wordt, of null als het kan. Een lid dat sinds het klaarzetten inactief is
 * geworden krijgt niets, en een bericht over een activiteit die nu niet meer gepubliceerd is of is afgelopen ook niet. Een
 * bericht over een activiteit die er niet meer is (verwijderd, `activiteit_id` leeg) gaat wel uit: dat is de melding zelf.
 */
export function moetOverslaan(
  groep: Pick<Groep, 'activiteitId'>,
  lid: LidStand | undefined,
  activiteit: ActiviteitStand | undefined,
  nu: Date,
): string | null {
  if (!lid || !lid.actief || lid.type !== 'lid' || lid.alleen_beheer) return 'lid_niet_meer_actief';
  if (groep.activiteitId !== null) {
    if (
      !activiteit ||
      activiteit.status !== 'gepubliceerd' ||
      new Date(activiteit.eindigt_om).getTime() < nu.getTime()
    ) {
      return 'activiteit_voorbij';
    }
  }
  return null;
}

/** Een lijst in stukken, voor adressen met een lijst id's: een te lange URL wordt door de gateway geweigerd (HTTP 414). */
export function inStukken<T>(lijst: readonly T[], grootte: number): T[][] {
  const stukken: T[][] = [];
  for (let i = 0; i < lijst.length; i += grootte) stukken.push(lijst.slice(i, i + grootte));
  return stukken;
}

const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'] as const;
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
] as const;

/** "2027-01-22" wordt "vrijdag 22 januari". Rekent op een vaste middag in UTC, zodat de tijdzone van de Worker niet uitmaakt. */
export function leesbareDatum(datum: string): string {
  const delen = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum);
  if (!delen) return datum;
  const d = new Date(Date.UTC(Number(delen[1]), Number(delen[2]) - 1, Number(delen[3]), 12));
  return `${DAGEN[d.getUTCDay()]} ${d.getUTCDate()} ${MAANDEN[d.getUTCMonth()]}`;
}

export interface MailInstellingen {
  /** Het vaste adres van de site, voor de link naar het platform. Leeg: geen link. */
  siteUrl: string | null;
  /** De afzendernaam onderaan de mail, bijvoorbeeld de naam van de vereniging. */
  ondertekening: string;
}

export interface Mail {
  onderwerp: string;
  tekst: string;
  html: string;
}

function html(tekst: string): string {
  return tekst
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** De mail voor één lid over één activiteit. */
export function maakMail(groep: Groep, voornaam: string, instellingen: MailInstellingen): Mail {
  const dag = leesbareDatum(groep.activiteitDatum);
  const kop = `${groep.activiteitNaam}, ${dag}`;
  const onderwerp = `Verandering bij ${groep.activiteitNaam} (${dag})`;
  const link = instellingen.siteUrl ? instellingen.siteUrl.replace(/\/+$/, '') : null;
  const slot = link
    ? `Zie de actuele stand in het ledenplatform: ${link}`
    : 'Zie de actuele stand in het ledenplatform.';

  const tekst = [
    `Hoi ${voornaam},`,
    '',
    `Er is iets veranderd bij ${kop}:`,
    '',
    ...groep.regels.map((regel) => `- ${regel}`),
    '',
    slot,
    '',
    'Groet,',
    instellingen.ondertekening,
    '',
  ].join('\n');

  const lijst = groep.regels.map((regel) => `<li>${html(regel)}</li>`).join('');
  const knop = link ? `<p><a href="${html(link)}">Open het ledenplatform</a></p>` : '';
  const hoofdtekst =
    `<p>Hoi ${html(voornaam)},</p>` +
    `<p>Er is iets veranderd bij <strong>${html(kop)}</strong>:</p>` +
    `<ul>${lijst}</ul>` +
    knop +
    `<p>Groet,<br>${html(instellingen.ondertekening)}</p>`;
  return {
    onderwerp,
    tekst,
    html: `<!doctype html><html lang="nl"><body style="font-family:sans-serif;line-height:1.5;color:#222">${hoofdtekst}</body></html>`,
  };
}
