// Tests voor de route van de agenda-feed, zonder Worker: een aanvraag erin, kijken wat eruit komt.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const TOKEN = 'c'.repeat(64);
const vraag = (url: string): Promise<Response> => {
  const bestand = new URL(url).pathname.split('/').pop() ?? '';
  return GET(new Request(url), { params: Promise.resolve({ bestand }) });
};

beforeEach(() => {
  vi.stubEnv('PROEF_AGENDA_TOKEN', TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('agenda-feed: alleen over https (review PR11-01)', () => {
  it('geeft de agenda over https', async () => {
    const antwoord = await vraag(`https://site.test/proef/agenda/${TOKEN}.ics`);
    expect(antwoord.status).toBe(200);
    expect(await antwoord.text()).toContain('BEGIN:VCALENDAR');
  });

  it('weigert gewoon http met hetzelfde kale antwoord, ook met het juiste token', async () => {
    const http = await vraag(`http://site.test/proef/agenda/${TOKEN}.ics`);
    const onbekend = await vraag(`https://site.test/proef/agenda/${'d'.repeat(64)}.ics`);
    expect(http.status).toBe(404);
    expect(await http.text()).toBe(await onbekend.text());
  });

  it('staat http toe op de eigen computer (de browsertests draaien op http://127.0.0.1)', async () => {
    expect((await vraag(`http://127.0.0.1:3100/proef/agenda/${TOKEN}.ics`)).status).toBe(200);
    expect((await vraag(`http://localhost:3000/proef/agenda/${TOKEN}.ics`)).status).toBe(200);
  });
});
