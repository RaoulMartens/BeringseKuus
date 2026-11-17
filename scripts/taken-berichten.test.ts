import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  groepeer,
  inStukken,
  leesbareDatum,
  maakMail,
  moetOverslaan,
  type Berichtregel,
} from '../taken/berichten.ts';
import { verstuurBerichten } from '../taken/worker.ts';

const NU = new Date('2027-01-20T12:00:00Z');

function regel(over: Partial<Berichtregel> & { id: number }): Berichtregel {
  return {
    lid_id: 'lid-1',
    activiteit_id: 'act-1',
    activiteit_naam: 'Bonte Avond',
    activiteit_datum: '2027-01-22',
    tekst: 'Begint: nu 19:30 (was 20:00).',
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
  assert.deepEqual(groepen[0]?.regels, ['Begint: nu 19:30 (was 20:00).', 'Locatie: nu Zaal (was Hal).']);
  assert.deepEqual(groepen[0]?.ids, [1, 3]);
});

test('groepeer: een activiteit die niet meer bestaat (geen id) groepeert op naam en datum', () => {
  const groepen = groepeer([
    regel({ id: 1, activiteit_id: null, tekst: 'Deze activiteit gaat niet door.' }),
    regel({ id: 2, activiteit_id: null, tekst: 'Deze activiteit gaat niet door.' }),
  ]);
  assert.equal(groepen.length, 1);
  assert.deepEqual(groepen[0]?.regels, ['Deze activiteit gaat niet door.']);
});

test('groepeer: onderwerp en kop volgen de nieuwste naam en datum (B-08)', () => {
  const groepen = groepeer([
    regel({ id: 1, tekst: 'Locatie: nu Zaal (was Hal).' }),
    regel({
      id: 2,
      activiteit_naam: 'Bonte Avond (extra)',
      activiteit_datum: '2027-01-23',
      tekst: 'Datum: nu zaterdag 23 januari (was vrijdag 22 januari).',
    }),
  ]);
  assert.equal(groepen[0]?.activiteitDatum, '2027-01-23');
  assert.equal(groepen[0]?.activiteitNaam, 'Bonte Avond (extra)');
  assert.deepEqual(groepen[0]?.regels, [
    'Locatie: nu Zaal (was Hal).',
    'Datum: nu zaterdag 23 januari (was vrijdag 22 januari).',
  ]);
});

test('inStukken: een lijst in stukken van een vaste grootte', () => {
  assert.deepEqual(inStukken([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(inStukken([], 3), []);
});

test('moetOverslaan: lid en activiteit worden vlak voor het versturen opnieuw getoetst (B-06)', () => {
  const lid = { actief: true, type: 'lid', alleen_beheer: false };
  const open = { status: 'gepubliceerd', eindigt_om: '2027-01-22T22:00:00Z' };
  const groep = { activiteitId: 'act-1' };
  assert.equal(moetOverslaan(groep, lid, open, NU), null);
  assert.equal(moetOverslaan(groep, { ...lid, actief: false }, open, NU), 'lid_niet_meer_actief');
  assert.equal(moetOverslaan(groep, { ...lid, type: 'extern' }, open, NU), 'lid_niet_meer_actief');
  assert.equal(moetOverslaan(groep, { ...lid, alleen_beheer: true }, open, NU), 'lid_niet_meer_actief');
  assert.equal(moetOverslaan(groep, undefined, open, NU), 'lid_niet_meer_actief');
  assert.equal(
    moetOverslaan(groep, lid, { ...open, eindigt_om: '2027-01-20T11:00:00Z' }, NU),
    'activiteit_voorbij',
  );
  assert.equal(moetOverslaan(groep, lid, { ...open, status: 'geannuleerd' }, NU), 'activiteit_voorbij');
  assert.equal(moetOverslaan(groep, lid, undefined, NU), 'activiteit_voorbij');
  // Een activiteit die er niet meer is, is juist waar het bericht over gaat.
  assert.equal(moetOverslaan({ activiteitId: null }, lid, undefined, NU), null);
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
  body: Record<string, unknown> | undefined;
  headers: Record<string, string>;
}

interface Wereld {
  opgepakt: Berichtregel[];
  leden?: Record<string, { voornaam: string; actief: boolean; type: string; alleen_beheer: boolean }>;
  activiteiten?: Record<string, { status: string; eindigt_om: string }>;
  postmarkStatus?: number;
  /** PATCH-verzoeken waarvan de url een van deze id's bevat, mislukken. */
  patchMislukt?: string[];
  claimStatus?: number;
}

const echteFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = echteFetch;
});

const GEWOON_LID = { voornaam: 'Mark', actief: true, type: 'lid', alleen_beheer: false };

function nabootsen(wereld: Wereld): Aanroep[] {
  const aanroepen: Aanroep[] = [];
  const json = (waarde: unknown, status = 200) => new Response(JSON.stringify(waarde), { status });
  globalThis.fetch = (async (invoer: RequestInfo | URL, init?: RequestInit) => {
    const url = String(invoer);
    const methode = init?.method ?? 'GET';
    aanroepen.push({
      url,
      methode,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : undefined,
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
    });
    if (url.endsWith('/rest/v1/rpc/claim_berichten')) {
      return wereld.claimStatus && wereld.claimStatus !== 200
        ? json({}, wereld.claimStatus)
        : json(wereld.opgepakt);
    }
    if (methode === 'PATCH') {
      const mislukt = (wereld.patchMislukt ?? []).some(
        (id) => url.includes(`in.(${id}`) || url.includes(`,${id}`),
      );
      return mislukt ? json({}, 500) : new Response(null, { status: 204 });
    }
    const ids = (/in\.\(([^)]*)\)/.exec(url)?.[1] ?? '').split(',');
    if (url.includes('/rest/v1/leden?')) {
      return json(
        ids
          .map((id) => ({ id, ...(wereld.leden?.[id] ?? GEWOON_LID) }))
          .filter((lid) => wereld.leden?.[lid.id] !== null),
      );
    }
    if (url.includes('/rest/v1/leden_prive?'))
      return json(ids.map((id) => ({ lid_id: id, email: `${id}@example.com` })));
    if (url.includes('/rest/v1/activiteiten?')) {
      return json(
        ids.flatMap((id) => {
          const stand = wereld.activiteiten?.[id] ?? {
            status: 'gepubliceerd',
            eindigt_om: '2027-01-22T22:00:00Z',
          };
          return [{ id, ...stand }];
        }),
      );
    }
    if (url.startsWith('https://api.postmarkapp.com/email')) return json({}, wereld.postmarkStatus ?? 200);
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

const mailsIn = (aanroepen: Aanroep[]) =>
  aanroepen.filter((a) => a.url.startsWith('https://api.postmarkapp.com'));
const patchesIn = (aanroepen: Aanroep[]) => aanroepen.filter((a) => a.methode === 'PATCH');

test('run zonder geheimen: niets opgehaald en niets verstuurd', async () => {
  const aanroepen = nabootsen({ opgepakt: [regel({ id: 1 })] });
  const uitkomst = await verstuurBerichten({}, NU);
  assert.deepEqual(uitkomst, { verstuurd: 0, mislukt: 0, overgeslagen: 0 });
  assert.equal(aanroepen.length, 0);
});

test('run: oppakken gaat via de database (atomair), twee regels van één lid worden één mail, daarna verstuurd gezet', async () => {
  const aanroepen = nabootsen({
    opgepakt: [regel({ id: 1 }), regel({ id: 2, tekst: 'Locatie: nu Zaal (was Hal).' })],
  });
  const uitkomst = await verstuurBerichten(ENV, NU);
  assert.deepEqual(uitkomst, { verstuurd: 1, mislukt: 0, overgeslagen: 0 });

  const claim = aanroepen[0];
  assert.ok(claim?.url.endsWith('/rest/v1/rpc/claim_berichten'));
  assert.equal(claim?.methode, 'POST');
  assert.deepEqual(claim?.body, { p_max_groepen: 100 });

  const mails = mailsIn(aanroepen);
  assert.equal(mails.length, 1);
  const mail = mails[0]?.body ?? {};
  assert.equal(mail.To, 'lid-1@example.com');
  assert.equal(mail.From, 'Platform <platform@example.com>');
  assert.equal(mail.TrackOpens, false);
  assert.equal(mail.TrackLinks, 'None');
  assert.match(String(mail.TextBody), /Begint: nu 19:30/);
  assert.match(String(mail.TextBody), /Locatie: nu Zaal/);
  assert.equal(mails[0]?.headers['x-postmark-server-token'], 'token');

  const patch = patchesIn(aanroepen)[0];
  assert.ok(patch?.url.endsWith('berichten?id=in.(1,2)'));
  assert.equal(patch?.body?.status, 'verstuurd');
});

test('run in testmodus: de mail gaat naar het testadres, met [TEST] in het onderwerp', async () => {
  const aanroepen = nabootsen({ opgepakt: [regel({ id: 1 })] });
  await verstuurBerichten({ ...ENV, BERICHT_TEST_ADRES: 'ik@example.com' }, NU);
  const mail = mailsIn(aanroepen)[0]?.body ?? {};
  assert.equal(mail.To, 'ik@example.com');
  assert.match(String(mail.Subject), /^\[TEST\] Verandering bij Bonte Avond/);
});

test('run: een lid dat sinds het klaarzetten inactief is geworden krijgt niets (B-06)', async () => {
  const aanroepen = nabootsen({
    opgepakt: [regel({ id: 1 })],
    leden: { 'lid-1': { ...GEWOON_LID, actief: false } },
  });
  const uitkomst = await verstuurBerichten(ENV, NU);
  assert.deepEqual(uitkomst, { verstuurd: 0, mislukt: 0, overgeslagen: 1 });
  assert.equal(mailsIn(aanroepen).length, 0);
  assert.deepEqual(patchesIn(aanroepen)[0]?.body, {
    status: 'overgeslagen',
    fout: 'lid_niet_meer_actief',
    claim_tot: null,
  });
});

test('run: een activiteit die ondertussen is afgelopen geeft geen mail (B-06)', async () => {
  const aanroepen = nabootsen({
    opgepakt: [regel({ id: 1 })],
    activiteiten: { 'act-1': { status: 'gepubliceerd', eindigt_om: '2027-01-20T11:00:00Z' } },
  });
  const uitkomst = await verstuurBerichten(ENV, NU);
  assert.deepEqual(uitkomst, { verstuurd: 0, mislukt: 0, overgeslagen: 1 });
  assert.equal(mailsIn(aanroepen).length, 0);
});

test('run: het bericht over een verwijderde activiteit gaat wel uit', async () => {
  const aanroepen = nabootsen({
    opgepakt: [regel({ id: 1, activiteit_id: null, tekst: 'Deze activiteit gaat niet door.' })],
  });
  const uitkomst = await verstuurBerichten(ENV, NU);
  assert.deepEqual(uitkomst, { verstuurd: 1, mislukt: 0, overgeslagen: 0 });
  assert.match(String(mailsIn(aanroepen)[0]?.body?.TextBody), /gaat niet door/);
});

test('run: Postmark weigert, dan blijft de fout bij het bericht en wordt niets als verstuurd gezet', async () => {
  const aanroepen = nabootsen({ opgepakt: [regel({ id: 1 })], postmarkStatus: 500 });
  const uitkomst = await verstuurBerichten(ENV, NU);
  assert.deepEqual(uitkomst, { verstuurd: 0, mislukt: 1, overgeslagen: 0 });
  assert.deepEqual(patchesIn(aanroepen)[0]?.body, { fout: 'postmark_500' });
});

test('run: een mislukte statusupdate stopt de rest van de run niet (B-05)', async () => {
  const aanroepen = nabootsen({
    opgepakt: [regel({ id: 1 }), regel({ id: 2, lid_id: 'lid-2' })],
    patchMislukt: ['1'],
  });
  const uitkomst = await verstuurBerichten(ENV, NU);
  // Eerste groep: de mail ging, de statusupdate bleef falen (ook de herhaling): telt als mislukt. Tweede groep gewoon verstuurd.
  assert.deepEqual(uitkomst, { verstuurd: 1, mislukt: 1, overgeslagen: 0 });
  assert.equal(mailsIn(aanroepen).length, 2);
});

test('run: lees-adressen blijven kort ook met veel leden (B-09)', async () => {
  const regels = Array.from({ length: 300 }, (_, i) =>
    regel({ id: i + 1, lid_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }),
  );
  const aanroepen = nabootsen({ opgepakt: regels });
  const uitkomst = await verstuurBerichten(ENV, NU);
  assert.equal(uitkomst.verstuurd, 300);
  const leesverzoeken = aanroepen.filter((a) => a.methode === 'GET');
  assert.ok(leesverzoeken.length >= 15);
  assert.ok(leesverzoeken.every((a) => a.url.length < 2000));
});

test('run: oppakken mislukt, dan mislukt de run (Cloudflare toont hem als mislukt)', async () => {
  nabootsen({ opgepakt: [], claimStatus: 500 });
  await assert.rejects(verstuurBerichten(ENV, NU), /oppakken mislukt: 500/);
});
