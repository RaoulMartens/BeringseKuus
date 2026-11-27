// De taken-Worker (ledenplatform-taken): alleen geplande taken, zonder de Next-app (Bouwbesluiten 3.1, review
// PR12-01). Alleen deze Worker krijgt de geheime sleutel van Supabase en de sleutel van Postmark. In één Worker met de app
// zou de hele app die sleutel via process.env kunnen lezen, en die sleutel gaat om alle rechten heen.
//
// De taak: berichten per mail (O-1). De database zet bij een wijziging van een gepubliceerde activiteit regels klaar in
// `berichten` (migratie 20261117120000). Deze Worker pakt ze op met `claim_berichten` (atomair: twee runs tegelijk krijgen
// nooit dezelfde regels, en het aantal pogingen telt vóór het versturen), controleert vlak voor het versturen nog eens of het
// lid en de activiteit kloppen, voegt de regels per lid en activiteit samen tot één mail, verstuurt die via Postmark en zet
// ze op "verstuurd". Eén mislukte mail stopt de rest van de run niet. Zijn de geheimen niet gezet, dan gebeurt er niets.
//
// Geheimen (type Secret, bij déze Worker): SUPABASE_URL, SUPABASE_SECRET_KEY, POSTMARK_TOKEN. Gewone instellingen, ook als
// Secret: BERICHT_AFZENDER (het afzenderadres, "Naam <adres>"), BERICHT_ONDERTEKENING en SITE_URL; en voor de proef
// BERICHT_TEST_ADRES (alle mail gaat dan naar dat ene adres). Uitleg: docs/bouw/Berichten.md.
//
// Geen fetch-handler: deze Worker heeft geen adres (workers_dev staat uit in taken/wrangler.jsonc). In de logs staan alleen
// aantallen en foutcodes, geen namen, adressen of berichttekst.

import { maakHerinnering, maakUitnodiging } from '../scripts/uitnodiging.ts';
import {
  groepeer,
  inStukken,
  maakMail,
  moetOverslaan,
  type ActiviteitStand,
  type Berichtregel,
  type Groep,
  type LidStand,
} from './berichten.ts';

interface Omgeving {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  POSTMARK_TOKEN?: string;
  BERICHT_AFZENDER?: string;
  BERICHT_ONDERTEKENING?: string;
  SITE_URL?: string;
  /** Alleen voor de proef: staat dit gezet, dan gaat elke mail naar dit adres (met [TEST] in het onderwerp), niet naar het lid. */
  BERICHT_TEST_ADRES?: string;
}

interface Db {
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
}

/** Hoeveel groepen (lid en activiteit) één run oppakt: de rest volgt de volgende minuut. */
const GROEPEN_PER_RUN = 100;
/** Hoeveel id's in één adres van een leesopdracht (een UUID is 36 tekens; de gateway weigert een te lange URL). */
const ID_PER_AANVRAAG = 40;

async function supabase(db: Db, pad: string, init?: RequestInit): Promise<Response> {
  return fetch(`${db.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/${pad}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      apikey: db.SUPABASE_SECRET_KEY,
      authorization: `Bearer ${db.SUPABASE_SECRET_KEY}`,
      ...init?.headers,
    },
  });
}

async function leesRijen<T>(db: Db, pad: string): Promise<T[]> {
  const antwoord = await supabase(db, pad);
  if (!antwoord.ok) throw new Error(`lezen mislukt: ${antwoord.status}`);
  return (await antwoord.json()) as T[];
}

/** Leest rijen voor een lijst id's, in stukken zodat het adres kort blijft. */
async function leesVoorIds<T>(
  db: Db,
  tabel: string,
  kolom: string,
  ids: string[],
  select: string,
): Promise<T[]> {
  const resultaat: T[] = [];
  for (const stuk of inStukken(ids, ID_PER_AANVRAAG)) {
    resultaat.push(...(await leesRijen<T>(db, `${tabel}?${kolom}=in.(${stuk.join(',')})&select=${select}`)));
  }
  return resultaat;
}

/** Zet berichten op een nieuwe stand. Een mislukte schrijfactie gooit een fout; de aanroeper vangt hem per groep op. */
async function zetStand(db: Db, ids: number[], velden: Record<string, unknown>): Promise<void> {
  if (ids.length === 0) return;
  const antwoord = await supabase(db, `berichten?id=in.(${ids.join(',')})`, {
    method: 'PATCH',
    body: JSON.stringify(velden),
    headers: { prefer: 'return=minimal' },
  });
  if (!antwoord.ok) throw new Error(`berichten bijwerken mislukt: ${antwoord.status}`);
}

export interface Uitkomst {
  verstuurd: number;
  mislukt: number;
  overgeslagen: number;
}

export async function verstuurBerichten(env: Omgeving, nu: Date = new Date()): Promise<Uitkomst> {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY, POSTMARK_TOKEN, BERICHT_AFZENDER } = env;
  const uitkomst: Uitkomst = { verstuurd: 0, mislukt: 0, overgeslagen: 0 };
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !POSTMARK_TOKEN || !BERICHT_AFZENDER) {
    console.log('berichten: geheimen of afzender ontbreken, niets verstuurd');
    return uitkomst;
  }
  const db: Db = { SUPABASE_URL, SUPABASE_SECRET_KEY };

  // Oppakken: atomair, in hele groepen, en het aantal pogingen telt hier al (de database ruimt ook te oude en te vaak
  // geprobeerde berichten op).
  const claim = await supabase(db, 'rpc/claim_berichten', {
    method: 'POST',
    body: JSON.stringify({ p_max_groepen: GROEPEN_PER_RUN }),
  });
  if (!claim.ok) throw new Error(`oppakken mislukt: ${claim.status}`);
  const opgepakt = (await claim.json()) as Berichtregel[];
  const groepen = groepeer(opgepakt);
  if (groepen.length === 0) return uitkomst;

  const lidIds = [...new Set(groepen.map((groep) => groep.lidId))];
  const activiteitIds = [
    ...new Set(groepen.flatMap((groep) => (groep.activiteitId ? [groep.activiteitId] : []))),
  ];
  const [leden, prive, activiteiten] = await Promise.all([
    leesVoorIds<LidStand & { id: string; voornaam: string }>(
      db,
      'leden',
      'id',
      lidIds,
      'id,voornaam,actief,type,alleen_beheer',
    ),
    leesVoorIds<{ lid_id: string; email: string }>(db, 'leden_prive', 'lid_id', lidIds, 'lid_id,email'),
    leesVoorIds<ActiviteitStand & { id: string }>(
      db,
      'activiteiten',
      'id',
      activiteitIds,
      'id,status,eindigt_om',
    ),
  ]);
  const ledenPerId = new Map(leden.map((lid) => [lid.id, lid]));
  const adressen = new Map(prive.map((lid) => [lid.lid_id, lid.email]));
  const activiteitenPerId = new Map(activiteiten.map((activiteit) => [activiteit.id, activiteit]));

  const instellingen = {
    siteUrl: env.SITE_URL?.trim() || null,
    ondertekening: env.BERICHT_ONDERTEKENING?.trim() || 'Het ledenplatform',
  };
  const testAdres = env.BERICHT_TEST_ADRES?.trim() || null;

  for (const groep of groepen) {
    try {
      const lid = ledenPerId.get(groep.lidId);
      const reden = moetOverslaan(
        groep,
        lid,
        groep.activiteitId ? activiteitenPerId.get(groep.activiteitId) : undefined,
        nu,
      );
      if (reden !== null) {
        await zetStand(db, groep.ids, { status: 'overgeslagen', fout: reden, claim_tot: null });
        uitkomst.overgeslagen += 1;
        continue;
      }
      const adres = adressen.get(groep.lidId);
      if (!adres) {
        // Geen adres: nooit sturen, ook niet opnieuw proberen.
        await zetStand(db, groep.ids, { status: 'mislukt', fout: 'geen_adres', claim_tot: null });
        uitkomst.mislukt += 1;
        continue;
      }
      const fout = await stuur(
        POSTMARK_TOKEN,
        BERICHT_AFZENDER,
        testAdres ?? adres,
        testAdres !== null,
        groep,
        lid?.voornaam ?? '',
        instellingen,
      );
      if (fout === null) {
        // De mail is weg: leg dat vast, en probeer het één keer opnieuw als het niet lukt (anders gaat hij later nog eens).
        const verstuurd = { status: 'verstuurd', verstuurd_op: nu.toISOString(), fout: null };
        await zetStand(db, groep.ids, verstuurd).catch(() => zetStand(db, groep.ids, verstuurd));
        uitkomst.verstuurd += 1;
      } else {
        // Het aantal pogingen telde al bij het oppakken. De groep komt na het verlopen van de vergrendeling terug, of is
        // na vijf pogingen mislukt (de database beslist).
        await zetStand(db, groep.ids, { fout });
        uitkomst.mislukt += 1;
      }
    } catch (fout) {
      // Een mislukte schrijfactie voor één groep stopt de rest niet. De vergrendeling loopt vanzelf af en het aantal
      // pogingen telde al, dus dit kan niet eindeloos herhalen.
      uitkomst.mislukt += 1;
      console.error(`berichten: groep mislukt: ${fout instanceof Error ? fout.message : 'onbekend'}`);
    }
  }

  console.log(
    `berichten: ${uitkomst.verstuurd} verstuurd, ${uitkomst.mislukt} mislukt, ${uitkomst.overgeslagen} overgeslagen`,
  );
  return uitkomst;
}

/** Verstuurt één mail via Postmark. Geeft null bij succes, anders een korte foutcode (zonder adres of tekst). */
async function stuur(
  token: string,
  afzender: string,
  adres: string,
  test: boolean,
  groep: Groep,
  voornaam: string,
  instellingen: { siteUrl: string | null; ondertekening: string },
): Promise<string | null> {
  const mail = maakMail(groep, voornaam, instellingen);
  try {
    const antwoord = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'x-postmark-server-token': token,
      },
      body: JSON.stringify({
        From: afzender,
        To: adres,
        Subject: test ? `[TEST] ${mail.onderwerp}` : mail.onderwerp,
        TextBody: mail.tekst,
        HtmlBody: mail.html,
        MessageStream: 'outbound',
        TrackOpens: false,
        TrackLinks: 'None',
      }),
    });
    if (antwoord.ok) return null;
    return `postmark_${antwoord.status}`;
  } catch {
    return 'postmark_onbereikbaar';
  }
}

interface Uitnodiging {
  id: number;
  lid_id: string;
  soort: 'uitnodiging' | 'herinnering';
  voornaam: string;
  email: string;
  account_id: string | null;
  account_email: string | null;
}

export interface UitnodigingUitkomst {
  verstuurd: number;
  mislukt: number;
}

async function auth(db: Db, pad: string, init: RequestInit): Promise<Response> {
  return fetch(`${db.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/${pad}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      apikey: db.SUPABASE_SECRET_KEY,
      authorization: `Bearer ${db.SUPABASE_SECRET_KEY}`,
    },
  });
}

/**
 * Leden die in de app zijn toegevoegd (of een nieuw adres kregen) krijgen hier hun inlogaccount en de uitnodiging (BA-11). De app
 * kan geen account maken (de geheime sleutel hoort alleen hier). Per opdracht: het account aanmaken, of het nieuwe adres zetten als
 * dat niet meer klopt; dan de mail; dan het resultaat vastleggen. Een fout laat de opdracht staan voor een volgende run (tot vijf
 * pogingen); één mislukte opdracht stopt de rest niet.
 */
export async function stuurUitnodigingen(env: Omgeving): Promise<UitnodigingUitkomst> {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY, POSTMARK_TOKEN, BERICHT_AFZENDER } = env;
  const uitkomst: UitnodigingUitkomst = { verstuurd: 0, mislukt: 0 };
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !POSTMARK_TOKEN || !BERICHT_AFZENDER) {
    console.log('uitnodigingen: geheimen of afzender ontbreken, niets verstuurd');
    return uitkomst;
  }
  const db: Db = { SUPABASE_URL, SUPABASE_SECRET_KEY };
  const claim = await supabase(db, 'rpc/claim_uitnodigingen', {
    method: 'POST',
    body: JSON.stringify({ p_max: 20 }),
  });
  if (!claim.ok) throw new Error(`uitnodigingen oppakken mislukt: ${claim.status}`);
  const opdrachten = (await claim.json()) as Uitnodiging[];

  for (const opdracht of opdrachten) {
    let accountId = opdracht.account_id;
    let fout: string | null = null;
    try {
      if (!accountId) {
        const gemaakt = await auth(db, 'admin/users', {
          method: 'POST',
          body: JSON.stringify({ email: opdracht.email, email_confirm: true }),
        });
        if (gemaakt.ok) accountId = ((await gemaakt.json()) as { id: string }).id;
        else fout = `account_${gemaakt.status}`;
      } else if (opdracht.account_email?.toLowerCase() !== opdracht.email) {
        const gewijzigd = await auth(db, `admin/users/${accountId}`, {
          method: 'PUT',
          body: JSON.stringify({ email: opdracht.email, email_confirm: true }),
        });
        if (!gewijzigd.ok) fout = `adres_${gewijzigd.status}`;
      }
      if (!fout) {
        const maak = opdracht.soort === 'herinnering' ? maakHerinnering : maakUitnodiging;
        const mail = maak({
          voornaam: opdracht.voornaam,
          ondertekening: env.BERICHT_ONDERTEKENING ?? 'Het bestuur',
          site: (env.SITE_URL ?? 'https://beringsekuus.crispy-concepts.nl').replace(/\/+$/, ''),
          test: Boolean(env.BERICHT_TEST_ADRES),
          ...(opdracht.soort === 'herinnering' ? {} : { metProef: false }),
        });
        const antwoord = await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            'x-postmark-server-token': POSTMARK_TOKEN,
          },
          body: JSON.stringify({
            From: BERICHT_AFZENDER,
            To: env.BERICHT_TEST_ADRES || opdracht.email,
            Subject: mail.onderwerp,
            TextBody: mail.tekst,
            HtmlBody: mail.html,
            MessageStream: 'outbound',
            TrackOpens: false,
            TrackLinks: 'None',
          }),
        });
        if (!antwoord.ok) fout = `postmark_${antwoord.status}`;
      }
    } catch {
      fout = 'onbereikbaar';
    }
    const afgerond = await supabase(db, 'rpc/uitnodiging_afronden', {
      method: 'POST',
      body: JSON.stringify({
        p_id: opdracht.id,
        p_status: fout ? 'wacht' : 'verstuurd',
        p_auth_user_id: accountId,
        p_fout: fout,
      }),
    });
    if (!afgerond.ok) console.error(`uitnodigingen: vastleggen mislukt: ${afgerond.status}`);
    if (fout) {
      uitkomst.mislukt += 1;
      console.error(`uitnodigingen: opdracht ${opdracht.id} mislukt: ${fout}`);
    } else {
      uitkomst.verstuurd += 1;
    }
  }
  if (opdrachten.length > 0)
    console.log(`uitnodigingen: ${uitkomst.verstuurd} verstuurd, ${uitkomst.mislukt} mislukt`);
  return uitkomst;
}

/** De nachtelijke taak (taken/wrangler.jsonc, 07:00 UTC): leden die na de uitnodiging nog niet zijn ingelogd een herinnering laten sturen. */
export const HERINNERING_CRON = '0 7 * * *';

/** Zet de herinneringen klaar (de database bepaalt wie: 3 en 7 dagen na de uitnodiging, hooguit twee); de uitnodigingstaak verstuurt ze. Geeft het aantal. */
export async function zetHerinneringenKlaar(env: Omgeving): Promise<number> {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.log('herinneringen: geheimen ontbreken, niets klaargezet');
    return 0;
  }
  const antwoord = await supabase({ SUPABASE_URL, SUPABASE_SECRET_KEY }, 'rpc/herinneringen_klaarzetten', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!antwoord.ok) throw new Error(`herinneringen klaarzetten mislukt: ${antwoord.status}`);
  const aantal = Number(await antwoord.json());
  console.log(`herinneringen: ${aantal} klaargezet`);
  return aantal;
}

const takenWorker = {
  async scheduled(gebeurtenis: { cron?: string }, env: Omgeving): Promise<void> {
    // Twee onafhankelijke taken in één run: een storing in de ene houdt de andere niet tegen. Alleen de soort fout in de log, geen
    // inhoud. Faalt er één, dan toont Cloudflare de run als mislukt.
    let mislukt: unknown = null;
    const taken =
      gebeurtenis.cron === HERINNERING_CRON
        ? ([['herinneringen', () => zetHerinneringenKlaar(env)]] as const)
        : ([
            ['berichten', () => verstuurBerichten(env)],
            ['uitnodigingen', () => stuurUitnodigingen(env)],
          ] as const);
    for (const [naam, taak] of taken) {
      try {
        await taak();
      } catch (fout) {
        console.error(`${naam}: run mislukt: ${fout instanceof Error ? fout.message : 'onbekend'}`);
        mislukt = fout;
      }
    }
    if (mislukt) throw mislukt;
  },
};

export default takenWorker;
