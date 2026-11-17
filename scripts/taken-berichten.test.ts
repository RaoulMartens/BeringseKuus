import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { groepeer, isVerlopen, leesbareDatum, maakMail, type Berichtregel } from '../taken/berichten.ts';
import { verstuurBerichten } from '../taken/worker.ts';

const NU = new Date('2027-01-20T12:00:00Z');

function regel(over: Partial<Berichtregel> & { id: number }): Berichtregel {
  return {
    lid_id: 'lid-1',
    activiteit_id: 'act-1',
    activiteit_naam: 'Bonte Avond',
    activiteit_datum: '2027-01-22',
    tekst: 'Begint: nu 19:30 (was 20:00).',
    pogingen: 0,
    aangemaakt: '2027-01-20T11:59:00Z',
    ...over,
  };
}

test('leesbareDatum: dag en maand in het Nederlands', () => {
  assert.equal(leesbareDatum('2027-01-22'), 'vrijdag 22 januari');
  assert.equal(leesbareDatum('2027-12-05'), 'zondag 5 december');
  assert.equal(leesbareDatum('onzin'), 'onzin');
});

test('groepeer: één groep per lid en activiteit, regels in volgorde en zonder dubbelen', () => {
  const groepen = groepeer([
    regel({ id: 3, tekst: 'Locatie: nu Zaal (was Hal).' }),
    regel({ id: 1, tekst: 'Begint: nu 19:30 (was 20:00).\nLocatie: nu Zaal (was Hal).' }),
    regel({ id: 2, lid_id: 'lid-2' }),
    regel({ id: 4, activiteit_id: 'act-2', activiteit_naam: 'Optocht' }),
  ]);
  assert.equal(groepen.length, 3);
  const eerste = groepen[0];
  assert.deepEqual(eerste?.regels, ['Begint: nu 19:30 (was 20:00).', 'Locatie: nu Zaal (was Hal).']);
  assert.deepEqual(eerste?.ids, [1, 3]);
});

test('groepeer: een activiteit die niet meer bestaat (geen id) groepeert op naam en datum', () => {
  const groepen = groepeer([
    regel({ id: 1, activiteit_id: null, tekst: 'Deze activiteit gaat niet door.' }),
    regel({ id: 2, activiteit_id: null, tekst: 'Deze activiteit gaat niet door.' }),
  ]);
  assert.equal(groepen.length, 1);
  assert.deepEqual(groepen[0]?.regels, ['Deze activiteit gaat niet door.']);
});

test('isVerlopen: na 24 uur wordt er niets meer verstuurd', () => {
  assert.equal(isVerlopen({ aangemaakt: '2027-01-19T13:00:00Z' }, NU), false);
  assert.equal(isVerlopen({ aangemaakt: '2027-01-19T11:00:00Z' }, NU), true);
});

test('maakMail: tekst en HTML met de regels, zonder volglinks, en HTML-tekens veilig', () => {
  const groep = groepeer([
    regel({ id: 1, activiteit_naam: 'Bal <b>&</b>', tekst: 'Locatie: nu "Zaal" (was Hal).' }),
  ])[0];
  assert.ok(groep);
  const mail = maakMail(groep, 'Mark', {
    siteUrl: 'https://voorbeeld.example/',
    ondertekening: 'Het bestuur',
  });
  assert.equal(mail.onderwerp, 'Verandering bij Bal <b>&</b> (vrijdag 22 januari)');
  assert.match(mail.tekst, /^Hoi Mark,/);
  assert.match(mail.tekst, /- Locatie: nu "Zaal" \(was Hal\)\./);
  assert.match(mail.tekst, /https:\/\/voorbeeld\.example\n/);
  assert.match(mail.html, /Bal &lt;b&gt;&amp;&lt;\/b&gt;/);
  assert.match(mail.html, /&quot;Zaal&quot;/);
  assert.ok(!mail.html.includes('<b>&</b>'));
  assert.ok(!/utm_|track/i.test(mail.html));
});

test('maakMail: zonder siteadres geen link', () => {
  const groep = groepeer([regel({ id: 1 })])[0];
  assert.ok(groep);
  const mail = maakMail(groep, 'Mark', { siteUrl: null, ondertekening: 'Het bestuur' });
  assert.ok(!mail.tekst.includes('http'));
  assert.ok(!mail.html.includes('href'));
});

// ===== De run, met een nagebootste fetch =====

interface Aanroep {
  url: string;
  methode: string;
  body: unknown;
  headers: Record<string, string>;
}

const echteFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = echteFetch;
});

function nabootsen(wachtend: Berichtregel[], postmarkStatus = 200): Aanroep[] {
  const aanroepen: Aanroep[] = [];
  globalThis.fetch = (async (invoer: RequestInfo | URL, init?: RequestInit) => {
    const url = String(invoer);
    aanroepen.push({
      url,
      methode: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
    });
    const json = (waarde: unknown, status = 200) => new Response(JSON.stringify(waarde), { status });
    if (url.includes('/rest/v1/berichten?status=eq.wacht')) return json(wachtend);
    if (url.includes('/rest/v1/leden?')) return json([{ id: 'lid-1', voornaam: 'Mark' }]);
    if (url.includes('/rest/v1/leden_prive?')) return json([{ lid_id: 'lid-1', email: 'mark@example.com' }]);
    if (url.includes('/rest/v1/berichten?id=in.')) return new Response(null, { status: 204 });
    if (url.startsWith('https://api.postmarkapp.com/email')) return json({}, postmarkStatus);
    return json({}, 404);
  }) as typeof fetch;
  return aanroepen;
}

const ENV = {
  SUPABASE_URL: 'https://db.example',
  SUPABASE_SECRET_KEY: 'geheim',
  POSTMARK_TOKEN: 'token',
  BERICHT_AFZENDER: 'Platform <platform@example.com>',
  SITE_URL: 'https://voorbeeld.example',
};

test('run zonder geheimen: niets opgehaald en niets verstuurd', async () => {
  const aanroepen = nabootsen([regel({ id: 1 })]);
  const uitkomst = await verstuurBerichten({}, NU);
  assert.deepEqual(uitkomst, { verstuurd: 0, mislukt: 0, verlopen: 0 });
  assert.equal(aanroepen.length, 0);
});

test('run: twee regels van één lid worden één mail, zonder tracking, daarna verstuurd gezet', async () => {
  const aanroepen = nabootsen([regel({ id: 1 }), regel({ id: 2, tekst: 'Locatie: nu Zaal (was Hal).' })]);
  const uitkomst = await verstuurBerichten(ENV, NU);
  assert.deepEqual(uitkomst, { verstuurd: 1, mislukt: 0, verlopen: 0 });

  const mails = aanroepen.filter((a) => a.url.startsWith('https://api.postmarkapp.com'));
  assert.equal(mails.length, 1);
  const mail = mails[0]?.body as Record<string, unknown>;
  assert.equal(mail.To, 'mark@example.com');
  assert.equal(mail.From, 'Platform <platform@example.com>');
  assert.equal(mail.TrackOpens, false);
  assert.equal(mail.TrackLinks, 'None');
  assert.match(String(mail.TextBody), /Begint: nu 19:30/);
  assert.match(String(mail.TextBody), /Locatie: nu Zaal/);
  assert.equal(mails[0]?.headers['x-postmark-server-token'], 'token');

  const bijgewerkt = aanroepen.find((a) => a.methode === 'PATCH');
  assert.ok(bijgewerkt?.url.endsWith('berichten?id=in.(1,2)'));
  assert.equal((bijgewerkt?.body as Record<string, unknown>).status, 'verstuurd');
});

test('run in testmodus: de mail gaat naar het testadres, met [TEST] in het onderwerp', async () => {
  const aanroepen = nabootsen([regel({ id: 1 })]);
  await verstuurBerichten({ ...ENV, BERICHT_TEST_ADRES: 'ik@example.com' }, NU);
  const mail = aanroepen.find((a) => a.url.startsWith('https://api.postmarkapp.com'))?.body as Record<
    string,
    unknown
  >;
  assert.equal(mail.To, 'ik@example.com');
  assert.match(String(mail.Subject), /^\[TEST\] Verandering bij Bonte Avond/);
});

test('run: een te oud bericht wordt niet verstuurd maar op mislukt (verlopen) gezet', async () => {
  const aanroepen = nabootsen([regel({ id: 7, aangemaakt: '2027-01-18T10:00:00Z' })]);
  const uitkomst = await verstuurBerichten(ENV, NU);
  assert.deepEqual(uitkomst, { verstuurd: 0, mislukt: 0, verlopen: 1 });
  assert.equal(aanroepen.filter((a) => a.url.startsWith('https://api.postmarkapp.com')).length, 0);
  const patch = aanroepen.find((a) => a.methode === 'PATCH');
  assert.deepEqual(patch?.body, { status: 'mislukt', fout: 'verlopen' });
});

test('run: Postmark weigert, dan blijft het bericht wachten met een poging erbij', async () => {
  const aanroepen = nabootsen([regel({ id: 1, pogingen: 1 })], 500);
  const uitkomst = await verstuurBerichten(ENV, NU);
  assert.deepEqual(uitkomst, { verstuurd: 0, mislukt: 1, verlopen: 0 });
  const patch = aanroepen.find((a) => a.methode === 'PATCH');
  assert.deepEqual(patch?.body, { pogingen: 2, fout: 'postmark_500', status: 'wacht' });
});

test('run: bij de vijfde mislukte poging geven we op', async () => {
  const aanroepen = nabootsen([regel({ id: 1, pogingen: 4 })], 500);
  await verstuurBerichten(ENV, NU);
  const patch = aanroepen.find((a) => a.methode === 'PATCH');
  assert.deepEqual(patch?.body, { pogingen: 5, fout: 'postmark_500', status: 'mislukt' });
});
