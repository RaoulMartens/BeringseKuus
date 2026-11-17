// De taken-Worker (ledenplatform-taken): alleen geplande taken, zonder de Next-app (Bouwbesluiten 3.1, review
// PR12-01). Alleen deze Worker krijgt de geheime sleutel van Supabase en de sleutel van Postmark. In één Worker met de app
// zou de hele app die sleutel via process.env kunnen lezen, en die sleutel gaat om alle rechten heen.
//
// De taak: berichten per mail (O-1). De database zet bij een wijziging van een gepubliceerde activiteit regels klaar in
// `berichten` (migratie 20261117120000); deze Worker haalt de wachtende regels op, voegt ze per lid en activiteit samen tot
// één mail, verstuurt die via Postmark en zet ze op "verstuurd". Gaat het mis, dan blijft de regel staan voor de volgende
// run, tot MAX_POGINGEN keer. Zijn de geheimen niet gezet, dan gebeurt er niets (de regels blijven staan tot ze verlopen).
//
// Geheimen (type Secret, bij déze Worker): SUPABASE_URL, SUPABASE_SECRET_KEY, POSTMARK_TOKEN. Gewone variabelen: BERICHT_AFZENDER
// (het afzenderadres, "Naam <adres>"), BERICHT_ONDERTEKENING en SITE_URL; en voor de proef BERICHT_TEST_ADRES (alle mail gaat dan naar dat ene adres). Uitleg: docs/bouw/Berichten.md.
//
// Geen fetch-handler: deze Worker heeft geen adres (workers_dev staat uit in taken/wrangler.jsonc). In de logs staan alleen
// aantallen en foutcodes, geen namen, adressen of berichttekst.

import { groepeer, isVerlopen, maakMail, MAX_POGINGEN, type Berichtregel, type Groep } from './berichten.ts';

interface Omgeving {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  POSTMARK_TOKEN?: string;
  BERICHT_AFZENDER?: string;
  BERICHT_ONDERTEKENING?: string;
  SITE_URL?: string;
  /** Alleen voor de proef: staat dit gezet, dan gaat elke mail naar dit adres (met [TEST] in het onderwerp) en niet naar het lid. */
  BERICHT_TEST_ADRES?: string;
}

/** Hoeveel wachtende regels één run verwerkt: de rest volgt de volgende minuut. */
const PER_RUN = 300;

function kolommen(...namen: string[]): string {
  return namen.join(',');
}

async function supabase(
  omgeving: Required<Pick<Omgeving, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>>,
  pad: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${omgeving.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/${pad}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      apikey: omgeving.SUPABASE_SECRET_KEY,
      authorization: `Bearer ${omgeving.SUPABASE_SECRET_KEY}`,
      ...init?.headers,
    },
  });
}

/** Zet berichten op een nieuwe status. Een mislukte schrijfactie wordt gemeld, niet verzwegen: anders gaat dezelfde mail dubbel. */
async function zetStatus(
  omgeving: Required<Pick<Omgeving, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>>,
  ids: number[],
  velden: Record<string, unknown>,
): Promise<void> {
  if (ids.length === 0) return;
  const antwoord = await supabase(omgeving, `berichten?id=in.(${ids.join(',')})`, {
    method: 'PATCH',
    body: JSON.stringify(velden),
    headers: { prefer: 'return=minimal' },
  });
  if (!antwoord.ok) throw new Error(`berichten bijwerken mislukt: ${antwoord.status}`);
}

async function leesRijen<T>(
  omgeving: Required<Pick<Omgeving, 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY'>>,
  pad: string,
): Promise<T[]> {
  const antwoord = await supabase(omgeving, pad);
  if (!antwoord.ok) throw new Error(`lezen mislukt: ${antwoord.status}`);
  return (await antwoord.json()) as T[];
}

export async function verstuurBerichten(
  env: Omgeving,
  nu: Date = new Date(),
): Promise<{ verstuurd: number; mislukt: number; verlopen: number }> {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY, POSTMARK_TOKEN, BERICHT_AFZENDER } = env;
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !POSTMARK_TOKEN || !BERICHT_AFZENDER) {
    console.log('berichten: geheimen of afzender ontbreken, niets verstuurd');
    return { verstuurd: 0, mislukt: 0, verlopen: 0 };
  }
  const db = { SUPABASE_URL, SUPABASE_SECRET_KEY };

  const wachtend = await leesRijen<Berichtregel>(
    db,
    `berichten?status=eq.wacht&order=id.asc&limit=${PER_RUN}&select=${kolommen('id', 'lid_id', 'activiteit_id', 'activiteit_naam', 'activiteit_datum', 'tekst', 'pogingen', 'aangemaakt')}`,
  );
  if (wachtend.length === 0) return { verstuurd: 0, mislukt: 0, verlopen: 0 };

  const verlopen = wachtend.filter((regel) => isVerlopen(regel, nu));
  await zetStatus(
    db,
    verlopen.map((regel) => regel.id),
    { status: 'mislukt', fout: 'verlopen' },
  );
  const te_sturen = wachtend.filter((regel) => !isVerlopen(regel, nu));
  const groepen = groepeer(te_sturen);
  if (groepen.length === 0) return { verstuurd: 0, mislukt: 0, verlopen: verlopen.length };

  const lidIds = [...new Set(groepen.map((groep) => groep.lidId))];
  const lijst = lidIds.join(',');
  const [leden, prive] = await Promise.all([
    leesRijen<{ id: string; voornaam: string }>(db, `leden?id=in.(${lijst})&select=id,voornaam`),
    leesRijen<{ lid_id: string; email: string }>(db, `leden_prive?lid_id=in.(${lijst})&select=lid_id,email`),
  ]);
  const voornamen = new Map(leden.map((lid) => [lid.id, lid.voornaam]));
  const adressen = new Map(prive.map((lid) => [lid.lid_id, lid.email]));

  const instellingen = {
    siteUrl: env.SITE_URL?.trim() || null,
    ondertekening: env.BERICHT_ONDERTEKENING?.trim() || 'Het ledenplatform',
  };
  const testAdres = env.BERICHT_TEST_ADRES?.trim() || null;
  let verstuurd = 0;
  let mislukt = 0;

  for (const groep of groepen) {
    const adres = adressen.get(groep.lidId);
    if (!adres) {
      // Geen adres (bijvoorbeeld een externe helper): nooit sturen, ook niet opnieuw proberen.
      await zetStatus(db, groep.ids, { status: 'mislukt', fout: 'geen_adres' });
      mislukt += 1;
      continue;
    }
    const fout = await stuur(
      POSTMARK_TOKEN,
      BERICHT_AFZENDER,
      testAdres ?? adres,
      testAdres !== null,
      groep,
      voornamen.get(groep.lidId) ?? '',
      instellingen,
    );
    if (fout === null) {
      await zetStatus(db, groep.ids, { status: 'verstuurd', verstuurd_op: nu.toISOString(), fout: null });
      verstuurd += 1;
      continue;
    }
    mislukt += 1;
    // Per regel het aantal pogingen ophogen; bij te veel pogingen opgeven. Eén PATCH per poging-niveau.
    const perPogingen = new Map<number, number[]>();
    for (const regel of te_sturen.filter((r) => groep.ids.includes(r.id))) {
      const lijstje = perPogingen.get(regel.pogingen) ?? [];
      lijstje.push(regel.id);
      perPogingen.set(regel.pogingen, lijstje);
    }
    for (const [pogingen, ids] of perPogingen) {
      const nieuw = pogingen + 1;
      await zetStatus(db, ids, {
        pogingen: nieuw,
        fout,
        status: nieuw >= MAX_POGINGEN ? 'mislukt' : 'wacht',
      });
    }
  }

  console.log(`berichten: ${verstuurd} verstuurd, ${mislukt} mislukt, ${verlopen.length} verlopen`);
  return { verstuurd, mislukt, verlopen: verlopen.length };
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
  async scheduled(_gebeurtenis: unknown, env: Omgeving): Promise<void> {
    try {
      await verstuurBerichten(env);
    } catch (fout) {
      // Alleen de soort fout, geen inhoud. Cloudflare toont de run dan als mislukt.
      console.error(`berichten: run mislukt: ${fout instanceof Error ? fout.message : 'onbekend'}`);
      throw fout;
    }
  },
};

export default takenWorker;
