// Een agendabestand (iCalendar, RFC 5545) voor de agenda-feed (bouwgids 4.7, proefroute 1).
//
// Bewust bewaard na de proef (Fase-1-plan stap A): getest en gereviewd (review PR11), en nodig voor de echte feed in
// fase 7. Tot dan gebruiken alleen de tests het.
//
// Agenda-apps zijn streng: regels gescheiden met CRLF, hooguit 75 bytes per regel (daarna "vouwen": CRLF plus een
// spatie), komma, puntkomma, backslash en regeleinde in tekst ontsnapt, en tijden met een tijdzone die in het
// bestand zelf staat (VTIMEZONE). Een vaste UID per afspraak zorgt dat een app een wijziging bijwerkt in plaats van
// een tweede afspraak te tonen.

export interface Afspraak {
  /** Blijft altijd hetzelfde voor dezelfde afspraak. */
  uid: string;
  titel: string;
  /** Plaatselijke tijd in Europe/Amsterdam, als "2027-01-15T20:11". */
  begin: string;
  einde: string;
  locatie?: string;
  omschrijving?: string;
}

const TIJDZONE = 'Europe/Amsterdam';

// Zomertijd van de laatste zondag van maart tot de laatste zondag van oktober, zoals in de EU sinds 1996.
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TIJDZONE}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

// Stuurtekens horen niet in tekst (RFC 5545 3.3.11), behalve de tab. Een losse CR kon in sommige apps een tweede,
// ingevoegde afspraak opleveren (review PR11-02); in fase 1 komt de tekst uit invoer van het bestuur.
const STUURTEKENS = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

export function escapeTekst(tekst: string): string {
  return tekst
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll(/\r\n|\r|\n/g, '\\n')
    .replaceAll(STUURTEKENS, '');
}

/** Vouwt een regel op 75 bytes; een vervolgregel begint met een spatie. Knipt nooit midden in een letter. */
export function vouwRegel(regel: string): string {
  const bytes = (tekst: string): number => new TextEncoder().encode(tekst).length;
  const delen: string[] = [];
  let huidig = '';
  for (const teken of regel) {
    // De eerste regel mag 75 bytes, een vervolgregel 74 plus de spatie ervoor.
    const ruimte = delen.length === 0 ? 75 : 74;
    if (bytes(huidig + teken) > ruimte) {
      delen.push(huidig);
      huidig = '';
    }
    huidig += teken;
  }
  delen.push(huidig);
  return delen.join('\r\n ');
}

/** "2027-01-15T20:11" wordt "20270115T201100". Een andere vorm is een fout, geen stil kapot bestand. */
function lokaleTijd(tijd: string): string {
  const delen = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(tijd);
  if (!delen) throw new Error(`Tijd in een onbekende vorm (verwacht JJJJ-MM-DDTUU:MM): ${tijd}`);
  const [, jaar, maand, dag, uur, minuut] = delen;
  return `${jaar}${maand}${dag}T${uur}${minuut}00`;
}

/** Een moment in UTC, zoals DTSTAMP het vraagt: "20261028T120000Z". */
function utcTijd(moment: Date): string {
  return `${moment.toISOString().replaceAll(/[-:]/g, '').slice(0, 15)}Z`;
}

export function maakAgenda(naam: string, afspraken: Afspraak[], gemaakt: Date): string {
  const regels = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Ledenplatform//Agenda//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeTekst(naam)}`,
    `X-WR-TIMEZONE:${TIJDZONE}`,
    // Vraag agenda-apps elk uur te verversen (RFC 7986, en de oudere naam die Outlook leest). Zonder deze regel kiest
    // elke app zelf, soms pas na uren.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...VTIMEZONE,
    ...afspraken.flatMap((afspraak) => [
      'BEGIN:VEVENT',
      `UID:${afspraak.uid}`,
      `DTSTAMP:${utcTijd(gemaakt)}`,
      `DTSTART;TZID=${TIJDZONE}:${lokaleTijd(afspraak.begin)}`,
      `DTEND;TZID=${TIJDZONE}:${lokaleTijd(afspraak.einde)}`,
      `SUMMARY:${escapeTekst(afspraak.titel)}`,
      ...(afspraak.locatie ? [`LOCATION:${escapeTekst(afspraak.locatie)}`] : []),
      ...(afspraak.omschrijving ? [`DESCRIPTION:${escapeTekst(afspraak.omschrijving)}`] : []),
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ];
  return `${regels.map(vouwRegel).join('\r\n')}\r\n`;
}
