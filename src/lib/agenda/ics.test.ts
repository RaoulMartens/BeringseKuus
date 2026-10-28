// Tests voor het agendabestand (proefroute 1). ical.js (de agenda-code van Thunderbird) is de onafhankelijke
// parser uit het Fase-0-plan: leest hij het bestand goed, dan kunnen agenda-apps het ook.
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

describe('agendabestand: het formaat (RFC 5545)', () => {
  it('scheidt regels met CRLF, nooit met een losse LF', () => {
    expect(agenda.endsWith('\r\n')).toBe(true);
    expect(agenda.replaceAll('\r\n', '')).not.toContain('\n');
  });

  it('houdt elke regel op hooguit 75 bytes, ook met letters als é', () => {
    for (const regel of agenda.split('\r\n')) expect(octetten(regel)).toBeLessThanOrEqual(75);
    const lang = `DESCRIPTION:${'é'.repeat(60)}`;
    const gevouwen = vouwRegel(lang);
    for (const regel of gevouwen.split('\r\n')) expect(octetten(regel)).toBeLessThanOrEqual(75);
    expect(gevouwen.replaceAll('\r\n ', '')).toBe(lang);
  });

  it('ontsnapt komma, puntkomma, backslash en regeleinde in tekst', () => {
    expect(escapeTekst('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('geeft dezelfde afspraak altijd dezelfde UID, zodat een agenda-app hem bijwerkt in plaats van dubbel toont', () => {
    expect(maakAgenda('x', [BONTE_AVOND], new Date())).toContain(`UID:${BONTE_AVOND.uid}\r\n`);
  });
});

describe('agendabestand: gelezen door een onafhankelijke parser (ical.js)', () => {
  const kalender = new ICAL.Component(ICAL.parse(agenda) as unknown[]);
  const zone = kalender.getFirstSubcomponent('vtimezone');
  if (zone) ICAL.TimezoneService.register(zone);
  const vevent = kalender.getFirstSubcomponent('vevent');
  if (!vevent) throw new Error('geen VEVENT');
  const afspraak = new ICAL.Event(vevent);

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
    const k = new ICAL.Component(ICAL.parse(zomer) as unknown[]);
    const z = k.getFirstSubcomponent('vtimezone');
    if (z) ICAL.TimezoneService.register(z);
    const e = k.getFirstSubcomponent('vevent');
    if (!e) throw new Error('geen VEVENT');
    expect(new ICAL.Event(e).startDate.toJSDate().toISOString()).toBe('2027-07-01T18:00:00.000Z');
  });
});
