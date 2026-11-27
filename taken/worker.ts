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

/** De nachtelijke taak (taken/wrangler.jsonc, 03:00 UTC): oud papier voor de komende 12 maanden als concept aanmaken (UC-014). */
export const OUD_PAPIER_CRON = '0 3 * * *';

/** Roept `oud_papier_aanmaken` aan; de database bepaalt wat er ontbreekt en maakt nooit dubbel. Geeft het aantal nieuwe concepten. */
export async function maakOudPapier(env: Omgeving): Promise<number> {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.log('oud papier: geheimen ontbreken, niets aangemaakt');
    return 0;
  }
  const antwoord = await supabase({ SUPABASE_URL, SUPABASE_SECRET_KEY }, 'rpc/oud_papier_aanmaken', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!antwoord.ok) throw new Error(`oud papier aanmaken mislukt: ${antwoord.status}`);
  const aantal = Number(await antwoord.json());
  console.log(`oud papier: ${aantal} concepten aangemaakt`);
  return aantal;
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

const takenWorker = {
  async scheduled(gebeurtenis: { cron?: string }, env: Omgeving): Promise<void> {
    try {
      if (gebeurtenis.cron === OUD_PAPIER_CRON) await maakOudPapier(env);
      else await verstuurBerichten(env);
    } catch (fout) {
      // Alleen de soort fout, geen inhoud. Cloudflare toont de run dan als mislukt.
      console.error(`berichten: run mislukt: ${fout instanceof Error ? fout.message : 'onbekend'}`);
      throw fout;
    }
  },
};

export default takenWorker;
