// Proefroute 1 (Fase-0-plan 4): de agenda-feed als .ics, van de Worker in workerd.
import { expect, test } from '@playwright/test';
import ICAL from 'ical.js';

import { TEST_AGENDA_TOKEN } from './agenda-token.ts';

const pad = (token: string): string => `/proef/agenda/${token}.ics`;

/** Nooit in een gedeelde cache. Next.js maakt er zelf een langere, nog strengere waarde van; die is ook goed. */
function nietBewaren(cacheControl: string | undefined): void {
  const delen = (cacheControl ?? '').split(',').map((deel) => deel.trim());
  expect(delen).toContain('private');
  expect(delen).toContain('no-store');
}

test.describe('agenda-feed (proefroute 1)', () => {
  test('geeft met het juiste token een agendabestand dat een parser kan lezen', async ({ request }) => {
    const antwoord = await request.get(pad(TEST_AGENDA_TOKEN));
    expect(antwoord.status()).toBe(200);
    expect(antwoord.headers()['content-type']).toBe('text/calendar; charset=utf-8');
    nietBewaren(antwoord.headers()['cache-control']);

    const tekst = await antwoord.text();
    expect(tekst.replaceAll('\r\n', '')).not.toContain('\n');
    const kalender = new ICAL.Component(ICAL.parse(tekst) as unknown[]);
    const afspraken = kalender.getAllSubcomponents('vevent');
    expect(afspraken).toHaveLength(1);
  });

  test('geeft bij een onbekend of vreemd token steeds hetzelfde antwoord, zonder gegevens', async ({
    request,
  }) => {
    const antwoorden = await Promise.all(
      [
        pad('onbekend-token-van-voldoende-lengte-0123456789'),
        pad('kort'),
        pad(`${TEST_AGENDA_TOKEN}x`),
        `/proef/agenda/${TEST_AGENDA_TOKEN}`,
        `/proef/agenda/${TEST_AGENDA_TOKEN}.txt`,
      ].map((p) => request.get(p)),
    );
    const vormen = await Promise.all(
      antwoorden.map(async (a) => ({
        status: a.status(),
        type: a.headers()['content-type'],
        cache: a.headers()['cache-control'],
        tekst: await a.text(),
      })),
    );
    for (const vorm of vormen) expect(vorm).toEqual(vormen[0]);
    expect(vormen[0]?.status).toBe(404);
    nietBewaren(vormen[0]?.cache);
    expect(vormen[0]?.tekst).not.toContain('VCALENDAR');
  });
});
