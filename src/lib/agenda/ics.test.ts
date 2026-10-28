// Tests voor het agendabestand (proefroute 1). ical.js (de agenda-code van Thunderbird) is de onafhankelijke
// parser uit het Fase-0-plan. Hij is soepel (review PR11-05): ook een bestand met fouten leest hij vaak. Daarom
// toetsen de eigen tests de strenge regels (CRLF, 75 bytes, verplichte velden), en ical.js de betekenis.
import ICAL from 'ical.js';
import { describe, expect, it } from 'vitest';

import { type Afspraak, escapeTekst, maakAgenda, vouwRegel } from './ics';

const BONTE_AVOND: Afspraak = {
  uid: 'proef-bonte-avond-2027-01-15@ledenplatform',
  titel: 'Bonte Avond',
  begin: '2027-01-15T20:11',
  einde: '2027-01-16T01:11',
  locatie: 'Gemeenschapshuis, Kerkstraat 12',
  omschrijving: 'Verzamelen 19:30; bus vertrekt 19:45, vanaf de kerk.\nJouw dienst: drankhaler. Café open.',
};
const GEMAAKT = new Date(Date.UTC(2026, 9, 28, 12, 0, 0));
const agenda = maakAgenda('Ledenplatform (proef)', [BONTE_AVOND], GEMAAKT);
const octetten = (tekst: string): number => new TextEncoder().encode(tekst).length;
const regels = agenda.split('\r\n');

/** Leest een bestand met ical.js; de tijdzone moet erin staan (anders zou de tijd "zwevend" worden). */
function leesEerste(tekst: string): ICAL.Event {
  const kalender = new ICAL.Component(ICAL.parse(tekst) as unknown[]);
  const zone = kalender.getFirstSubcomponent('vtimezone');
  expect(zone, 'VTIMEZONE in het bestand').not.toBeNull();
  if (zone) ICAL.TimezoneService.register(zone);
  const vevent = kalender.getFirstSubcomponent('vevent');
  if (!vevent) throw new Error('geen VEVENT');
  return new ICAL.Event(vevent);
}

describe('agendabestand: het formaat (RFC 5545)', () => {
  it('scheidt regels met CRLF, nooit met een losse LF of CR', () => {
    expect(agenda.endsWith('\r\n')).toBe(true);
    expect(agenda).not.toMatch(/(?<!\r)\n/);
    expect(agenda).not.toMatch(/\r(?!\n)/);
  });

  it('houdt elke regel op hooguit 75 bytes, ook met letters als é', () => {
    for (const regel of regels) expect(octetten(regel)).toBeLessThanOrEqual(75);
    const lang = `DESCRIPTION:${'é'.repeat(60)}`;
    const gevouwen = vouwRegel(lang);
    for (const regel of gevouwen.split('\r\n')) expect(octetten(regel)).toBeLessThanOrEqual(75);
    expect(gevouwen.replaceAll('\r\n ', '')).toBe(lang);
  });

  it('bevat de verplichte velden, met DTSTAMP in UTC', () => {
    expect(regels).toContain('VERSION:2.0');
    expect(regels.some((regel) => regel.startsWith('PRODID:'))).toBe(true);
    expect(regels).toContain('DTSTAMP:20261028T120000Z');
    expect(regels).toContain(`UID:${BONTE_AVOND.uid}`);
  });

  it('vraagt agenda-apps elk uur te verversen', () => {
    expect(regels).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT1H');
    expect(regels).toContain('X-PUBLISHED-TTL:PT1H');
  });

  it('ontsnapt komma, puntkomma, backslash en regeleinde in tekst', () => {
    expect(escapeTekst('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  // Review PR11-02: een losse CR (bijvoorbeeld geplakt uit Word) kon een nep-afspraak invoegen.
  it('maakt van elk soort regeleinde \\n en haalt stuurtekens weg', () => {
    expect(escapeTekst('a\rb\r\nc\nd')).toBe('a\\nb\\nc\\nd');
    expect(escapeTekst('a\u0000b\u000bc\u007fd\te')).toBe('abcd\te');
    const aanval = maakAgenda(
      'x',
      [{ ...BONTE_AVOND, titel: 'Bonte Avond\rEND:VEVENT\rBEGIN:VEVENT\rSUMMARY:Ingevoegd' }],
      GEMAAKT,
    );
    expect(aanval).not.toMatch(/\r(?!\n)/);
    expect(aanval.match(/^BEGIN:VEVENT$/gm)).toHaveLength(1);
  });

  it('weigert een tijd in een andere vorm dan JJJJ-MM-DDTUU:MM, in plaats van stil een fout bestand te maken', () => {
    expect(() => maakAgenda('x', [{ ...BONTE_AVOND, einde: 'onzin' }], GEMAAKT)).toThrow();
    expect(() => maakAgenda('x', [{ ...BONTE_AVOND, begin: '2027-1-5T8:00' }], GEMAAKT)).toThrow();
  });
});

describe('agendabestand: gelezen door een onafhankelijke parser (ical.js)', () => {
  const afspraak = leesEerste(agenda);

  it('leest titel, plaats en omschrijving terug zoals bedoeld', () => {
    expect(afspraak.summary).toBe('Bonte Avond');
    expect(afspraak.location).toBe(BONTE_AVOND.locatie);
    expect(afspraak.description).toBe(BONTE_AVOND.omschrijving);
    expect(afspraak.uid).toBe(BONTE_AVOND.uid);
  });

  it('zet de tijden in Europe/Amsterdam, met een eindtijd na middernacht', () => {
    expect(afspraak.startDate.zone.tzid).toBe('Europe/Amsterdam');
    // In januari is Amsterdam UTC+1: 20:11 daar is 19:11 UTC, en 01:11 de volgende dag is 00:11 UTC.
    expect(afspraak.startDate.toJSDate().toISOString()).toBe('2027-01-15T19:11:00.000Z');
    expect(afspraak.endDate.toJSDate().toISOString()).toBe('2027-01-16T00:11:00.000Z');
  });

  it('houdt rekening met zomertijd (UTC+2)', () => {
    const zomer = maakAgenda(
      'x',
      [{ ...BONTE_AVOND, begin: '2027-07-01T20:00', einde: '2027-07-01T23:00' }],
      GEMAAKT,
    );
    expect(leesEerste(zomer).startDate.toJSDate().toISOString()).toBe('2027-07-01T18:00:00.000Z');
  });
});
