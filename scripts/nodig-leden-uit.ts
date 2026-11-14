// De uitnodiging aan de leden versturen (docs/bouw/Pilotleden.md, "De uitnodiging sturen"): eerst één testmail naar jezelf, daarna naar
// iedereen die kan inloggen. Draait vanaf de computer van de bouwer, net als leden:zet: de sleutels staan in je eigen terminal,
// nooit in een bestand of de repository.
//
//   npm run leden:uitnodigen -- --van <afzender> --ondertekening "<naam, functie>" --test <jouw adres>
//   npm run leden:uitnodigen -- --van <afzender> --ondertekening "<naam, functie>" --alle          (alleen een telling)
//   npm run leden:uitnodigen -- --van <afzender> --ondertekening "<naam, functie>" --alle --ja     (versturen)
//
// Persoonsgegevens: de uitvoer noemt aantallen, volgnummers en foutcodes, nooit een naam of adres. De Postmark-sleutel en de
// Supabase-sleutel komen nergens in een log.

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../src/lib/supabase/database.types.ts';

import {
  kiesOntvangers,
  leesArgumenten,
  maakUitnodiging,
  type LidVoorUitnodiging,
  type Opdracht,
} from './uitnodiging.ts';
import { leesOnlineDoel } from './zet-leden.ts';

const POSTMARK = 'https://api.postmarkapp.com/email';

export type Verstuurder = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/** Eén mail via Postmark. Geeft null bij succes, anders een korte reden zonder adres of tekst. */
export async function verstuurMail(
  naar: string,
  mail: { onderwerp: string; tekst: string; html: string },
  opdracht: Pick<Opdracht, 'van' | 'antwoordAan'>,
  token: string,
  verstuurder: Verstuurder,
): Promise<string | null> {
  const antwoord = await verstuurder(POSTMARK, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': token,
    },
    body: JSON.stringify({
      From: opdracht.van,
      To: naar,
      ...(opdracht.antwoordAan ? { ReplyTo: opdracht.antwoordAan } : {}),
      Subject: mail.onderwerp,
      TextBody: mail.tekst,
      HtmlBody: mail.html,
      MessageStream: 'outbound',
      // Geen tracking: een herschreven link of een telpixel maakt een mail van een nieuwe afzender verdachter.
      TrackOpens: false,
      TrackLinks: 'None',
      Tag: 'uitnodiging',
    }),
  });
  if (antwoord.ok) return null;
  const gegevens = (await antwoord.json().catch(() => ({}))) as { ErrorCode?: number; Message?: string };
  return `Postmark ${antwoord.status}${gegevens.ErrorCode !== undefined ? ` (code ${gegevens.ErrorCode})` : ''}`;
}

async function leesLeden(url: string, sleutel: string): Promise<LidVoorUitnodiging[]> {
  const klant = createClient<Database>(url, sleutel, { auth: { persistSession: false } });
  const [leden, prive] = await Promise.all([
    klant.from('leden').select('id, voornaam, type, actief, auth_user_id, alleen_beheer'),
    klant.from('leden_prive').select('lid_id, email'),
  ]);
  if (leden.error) throw new Error(`leden niet te lezen: ${leden.error.code ?? 'onbekend'}`);
  if (prive.error) throw new Error(`ledengegevens niet te lezen: ${prive.error.code ?? 'onbekend'}`);
  if (leden.data.length >= 1000)
    throw new Error('meer dan 1000 leden: dit script leest er maar 1000 per keer; gestopt.');
  const adressen = new Map(prive.data.map((regel) => [regel.lid_id, regel.email]));
  return leden.data.flatMap((lid) => {
    const email = adressen.get(lid.id);
    return email
      ? [
          {
            voornaam: lid.voornaam,
            email,
            type: lid.type,
            actief: lid.actief,
            heeftAccount: lid.auth_user_id !== null,
            alleenBeheer: lid.alleen_beheer,
          },
        ]
      : [];
  });
}

async function hoofd(): Promise<number> {
  const opdracht = leesArgumenten(process.argv.slice(2));
  if ('fout' in opdracht) {
    console.error(`leden:uitnodigen: ${opdracht.fout}`);
    return 1;
  }
  const token = process.env.POSTMARK_SERVER_TOKEN?.trim();
  const verstuurder: Verstuurder = (url, init) => fetch(url, init);

  // ===== Eén testmail naar jezelf =====
  if (opdracht.test !== null) {
    if (!token) {
      console.error('leden:uitnodigen: zet POSTMARK_SERVER_TOKEN in je eigen terminal.');
      return 1;
    }
    const mail = maakUitnodiging({
      voornaam: opdracht.voornaam,
      ondertekening: opdracht.ondertekening,
      site: opdracht.site,
      test: true,
    });
    const reden = await verstuurMail(opdracht.test, mail, opdracht, token, verstuurder);
    if (reden) {
      console.error(`leden:uitnodigen: de testmail is niet verstuurd (${reden}).`);
      return 1;
    }
    console.log(
      'leden:uitnodigen: testmail verstuurd naar het opgegeven adres. Kijk in Postmark, Activity, of hij op Delivered staat.',
    );
    return 0;
  }

  // ===== Alle leden =====
  const doel = leesOnlineDoel(process.env);
  if ('fout' in doel) {
    console.error(`leden:uitnodigen: ${doel.fout}`);
    return 1;
  }
  const ontvangers = kiesOntvangers(await leesLeden(doel.url, doel.sleutel));
  console.log(
    `leden:uitnodigen: online project "${doel.project}"; ${ontvangers.length} lid/leden kunnen de uitnodiging krijgen.`,
  );
  if (!opdracht.doorvoeren) {
    console.log('leden:uitnodigen: dit was een telling. Voeg --ja toe om te versturen.');
    return 0;
  }
  if (!token) {
    console.error('leden:uitnodigen: zet POSTMARK_SERVER_TOKEN in je eigen terminal.');
    return 1;
  }
  if (ontvangers.length === 0) {
    console.error('leden:uitnodigen: er is niemand om naartoe te sturen; gestopt.');
    return 1;
  }
  const vraag = createInterface({ input: process.stdin, output: process.stdout });
  const verwacht = `VERSTUUR ${ontvangers.length}`;
  const antwoord = (
    await vraag.question(`Typ "${verwacht}" om ${ontvangers.length} mails te versturen: `)
  ).trim();
  vraag.close();
  if (antwoord !== verwacht) {
    console.error('leden:uitnodigen: niet bevestigd; er is niets verstuurd.');
    return 1;
  }

  let gelukt = 0;
  const mislukt: string[] = [];
  for (const [index, ontvanger] of ontvangers.entries()) {
    const mail = maakUitnodiging({
      voornaam: ontvanger.voornaam,
      ondertekening: opdracht.ondertekening,
      site: opdracht.site,
    });
    const reden = await verstuurMail(ontvanger.email, mail, opdracht, token, verstuurder);
    if (reden) mislukt.push(`nummer ${index + 1}: ${reden}`);
    else gelukt += 1;
    await new Promise((klaar) => setTimeout(klaar, 300));
  }
  console.log(`leden:uitnodigen: ${gelukt} van ${ontvangers.length} verstuurd.`);
  for (const regel of mislukt) console.error(`leden:uitnodigen: ${regel}`);
  return mislukt.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  hoofd().then(
    (code) => process.exit(code),
    (fout: unknown) => {
      console.error(`leden:uitnodigen: ${fout instanceof Error ? fout.message : 'onbekende fout'}`);
      process.exit(1);
    },
  );
}
