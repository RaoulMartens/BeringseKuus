// Het wijzigingenlog bekijken (UC-015, wireframe admin-wijzigingen): wat de database geeft (wijzigingen_lezen), per dag gegroepeerd, met het
// filter en de link naar de activiteit of het lid. Zuivere logica zonder database; de regels (wie het mag, wat er niet in staat) staan in de
// database (migratie 20261127120000).

import { z } from 'zod';

export const PER_PAGINA = 50;

export const SOORTEN = ['alles', 'diensten', 'activiteiten', 'leden', 'beheer'] as const;
export type Soort = (typeof SOORTEN)[number];

export const SOORT_LABEL: Record<Soort, string> = {
  alles: 'Alles',
  diensten: 'Diensten',
  activiteiten: 'Activiteiten',
  leden: 'Leden',
  beheer: 'Beheer',
};

/** Het filter uit de adresbalk; alles wat we niet kennen is "alles". */
export function leesSoort(waarde: unknown): Soort {
  const eerste: unknown = Array.isArray(waarde) ? (waarde[0] as unknown) : waarde;
  return SOORTEN.find((s) => s === eerste) ?? 'alles';
}

export interface Wijziging {
  id: number;
  moment: string;
  door: string;
  omschrijving: string;
  doel: { soort: 'activiteit' | 'lid'; id: string } | null;
}

const Rij = z.object({
  id: z.number(),
  moment: z.string(),
  door: z.string(),
  omschrijving: z.string(),
  doel_soort: z.enum(['activiteit', 'lid']).nullable(),
  doel_id: z.uuid().nullable(),
});

/** Een regel uit de database die technisch is, in woorden (het beheerspoor schrijft de oude en nieuwe tijd van de bevestiging als UTC-tekst). */
export function leesbaar(omschrijving: string): string {
  return /^beheerder_sinds /.test(omschrijving) ? 'Toegang van een beheerder bevestigd' : omschrijving;
}

/** Leest het antwoord van wijzigingen_lezen; een regel die niet klopt valt weg. */
export function leesWijzigingen(json: unknown): Wijziging[] {
  const lijst = z.array(z.unknown()).safeParse(json);
  if (!lijst.success) return [];
  const uit: Wijziging[] = [];
  for (const ruw of lijst.data) {
    const rij = Rij.safeParse(ruw);
    if (!rij.success) continue;
    const r = rij.data;
    uit.push({
      id: r.id,
      moment: r.moment,
      door: r.door,
      omschrijving: leesbaar(r.omschrijving),
      doel: r.doel_soort && r.doel_id ? { soort: r.doel_soort, id: r.doel_id } : null,
    });
  }
  return uit;
}

/** Waar een regel naartoe linkt, als het kan. */
export function doelHref(w: Pick<Wijziging, 'doel'>): string | null {
  if (!w.doel) return null;
  return w.doel.soort === 'activiteit' ? `/beheer/activiteiten/${w.doel.id}` : `/beheer/leden/${w.doel.id}`;
}

/** De pagina met het filter en, om verder terug te bladeren, het id van de laatste regel die je zag. */
export function wijzigingenHref(soort: Soort, voor?: number): string {
  const delen = [
    ...(soort === 'alles' ? [] : [`soort=${soort}`]),
    ...(voor === undefined ? [] : [`voor=${voor}`]),
  ];
  return delen.length > 0 ? `/beheer/wijzigingen?${delen.join('&')}` : '/beheer/wijzigingen';
}

const TIJDZONE = 'Europe/Amsterdam';

function dagSleutel(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIJDZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** "Vandaag", "Gisteren" of "Dinsdag 19 januari", in de tijd van Nederland. */
export function dagKop(moment: string, nu: Date): string {
  const d = new Date(moment);
  const sleutel = dagSleutel(d);
  if (sleutel === dagSleutel(nu)) return 'Vandaag';
  if (sleutel === dagSleutel(new Date(nu.getTime() - 86_400_000))) return 'Gisteren';
  const tekst = new Intl.DateTimeFormat('nl-NL', {
    timeZone: TIJDZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d);
  return tekst.charAt(0).toUpperCase() + tekst.slice(1);
}

/** "14:32". */
export function uurTekst(moment: string): string {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: TIJDZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(moment));
}

/** De regels per dag, in de volgorde waarin ze binnenkomen (nieuw naar oud). */
export function groepeerPerDag(
  regels: Wijziging[],
  nu: Date,
): { kop: string; sleutel: string; regels: Wijziging[] }[] {
  const uit: { kop: string; sleutel: string; regels: Wijziging[] }[] = [];
  for (const regel of regels) {
    const sleutel = dagSleutel(new Date(regel.moment));
    const laatste = uit[uit.length - 1];
    if (laatste && laatste.sleutel === sleutel) laatste.regels.push(regel);
    else uit.push({ kop: dagKop(regel.moment, nu), sleutel, regels: [regel] });
  }
  return uit;
}

/** De foutcode van de database in woorden. */
export function vertaalLogfout(code: string): string {
  return code === 'geen_admin'
    ? 'Je mag dit niet meer. Log opnieuw in met je code.'
    : 'Het log is niet te lezen. Probeer het nog eens; blijft het misgaan, laat het dan weten.';
}
