// Maakt een eenmalige inloglink voor een lid van het ONLINE project, zonder dat er een mail voor nodig is. Bedoeld voor de
// tijd dat de mailserver nog niet naar leden mag sturen (Resend zonder eigen domein: alleen naar het adres van het eigen
// account), bijvoorbeeld om de opdrachtgever het platform te laten zien. De link geeft de ontvanger een sessie als dit lid.
// Stuur hem dus alleen privé naar die ene persoon (bijvoorbeeld een berichtje), nooit in een groep of een mail.
//
//   node scripts/maak-inloglink.ts naam@voorbeeld.nl
//
// Het programma vraagt zelf om het adres van het project, het adres van de site en de geheime sleutel. De sleutel typ je
// verborgen in en komt nergens terecht: niet in een bestand, niet in de geschiedenis van je terminal, niet in de uitvoer.
// Het lid moet al bestaan (Authentication, Users, Add user, met Auto Confirm); dit programma maakt geen leden.
//
// De link werkt één keer en een uur. Daarna logt het lid in op dat apparaat en blijft ingelogd, net als na een mail.

import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { normaliseerEmailadres } from '../src/lib/inloggen/email.ts';

/** Een https-adres zonder pad: https://iets.voorbeeld.nl. Alleen dat; geen http, geen pad, geen gebruikersnaam. */
export function leesAdres(waarde: string, wat: string): string {
  let url: URL;
  try {
    url = new URL(waarde.trim());
  } catch {
    throw new Error(`${wat} is geen adres`);
  }
  if (url.protocol !== 'https:') throw new Error(`${wat} moet met https:// beginnen`);
  if (url.username || url.password) throw new Error(`${wat} mag geen gebruikersnaam of wachtwoord bevatten`);
  if (url.pathname !== '/' || url.search || url.hash)
    throw new Error(`${wat} moet een adres zonder pad zijn`);
  return url.origin;
}

/** Het adres van een Supabase-project: https://<ref>.supabase.co, en niets anders (geen lokaal of vreemd adres). */
export function leesProjectAdres(waarde: string): string {
  const adres = leesAdres(waarde, 'Het adres van het project');
  if (!/^https:\/\/[a-z0-9]{10,40}\.supabase\.co$/.test(adres)) {
    throw new Error('Het adres van het project hoort https://<code>.supabase.co te zijn');
  }
  return adres;
}

/** De link die het lid opent: de bevestigpagina van de site met de sleutel uit de mail-sjabloon (zelfde als de mail). */
export function maakLink(site: string, hashedToken: string): string {
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(hashedToken))
    throw new Error('de sleutel van de link ziet er niet goed uit');
  return `${site}/auth/bevestigen?token_hash=${encodeURIComponent(hashedToken)}`;
}

interface AdminAntwoord {
  hashed_token?: unknown;
  properties?: { hashed_token?: unknown };
  msg?: unknown;
  message?: unknown;
}

/** Vraagt Supabase om een inloglink voor een bestaand lid. Geeft alleen de sleutel terug; de rest van het antwoord niet. */
export async function vraagSleutel(project: string, geheim: string, email: string): Promise<string> {
  const antwoord = await fetch(`${project}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: geheim, authorization: `Bearer ${geheim}` },
    body: JSON.stringify({ type: 'magiclink', email }),
  });
  const tekst = await antwoord.text();
  let data: AdminAntwoord = {};
  try {
    data = JSON.parse(tekst) as AdminAntwoord;
  } catch {
    // een antwoord dat geen JSON is, valt hieronder in de foutmelding
  }
  if (!antwoord.ok) {
    // De melding van Supabase mag erin, het adres en de sleutel niet.
    const reden =
      typeof data.msg === 'string' ? data.msg : typeof data.message === 'string' ? data.message : '';
    throw new Error(`Supabase weigert (${antwoord.status}) ${reden}`.trim());
  }
  const sleutel = data.hashed_token ?? data.properties?.hashed_token;
  if (typeof sleutel !== 'string') throw new Error('Supabase gaf geen sleutel terug');
  return sleutel;
}

function vraag(vraagTekst: string, verborgen = false): Promise<string> {
  // Bij verborgen invoer gaat wat je typt niet naar het scherm.
  const uit = verborgen
    ? new Writable({
        write(_stuk, _codering, klaar) {
          klaar();
        },
      })
    : process.stdout;
  const regel = createInterface({ input: process.stdin, output: uit, terminal: true });
  return new Promise((klaar) => {
    process.stdout.write(vraagTekst);
    regel.question('', (antwoord) => {
      regel.close();
      if (verborgen) process.stdout.write('\n');
      klaar(antwoord);
    });
  });
}

async function hoofd(): Promise<void> {
  const email = normaliseerEmailadres(process.argv[2]);
  if (!email) throw new Error('Gebruik: node scripts/maak-inloglink.ts naam@voorbeeld.nl');

  const project = leesProjectAdres(await vraag('Adres van het Supabase-project (https://….supabase.co): '));
  const site = leesAdres(
    await vraag('Adres van de site (https://ledenplatform.….workers.dev): '),
    'Het adres van de site',
  );
  const geheim = (await vraag('Geheime sleutel (sb_secret_…, je ziet niets terwijl je typt): ', true)).trim();
  if (!/^sb_secret_[A-Za-z0-9_-]{10,}$/.test(geheim))
    throw new Error('Dat is geen geheime sleutel (sb_secret_…)');

  const link = maakLink(site, await vraagSleutel(project, geheim, email));
  process.stdout.write(
    `\nDe link voor ${email.replace(/^(.).*(@.*)$/, '$1…$2')} (werkt één keer en een uur; stuur hem alleen privé naar die persoon):\n\n${link}\n\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  hoofd().catch((fout: unknown) => {
    process.stderr.write(`maak-inloglink: ${fout instanceof Error ? fout.message : 'onbekende fout'}\n`);
    process.exitCode = 1;
  });
}
