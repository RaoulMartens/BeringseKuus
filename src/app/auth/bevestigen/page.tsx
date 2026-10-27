import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { bevestigInloggen } from './acties';

export const metadata: Metadata = { title: 'Inloggen bevestigen – Ledenplatform' };

type Zoekparameters = Promise<Record<string, string | string[] | undefined>>;

// Hier komt de link uit de mail uit. Inloggen gebeurt pas na een klik op de knop: sommige mailprogramma's openen
// elke link vooraf om hem op virussen te controleren, en zouden een link die maar één keer werkt anders opmaken.
// De link bevat zelf alles wat nodig is, dus hij werkt ook op een ander apparaat dan waar hij is aangevraagd
// (aanvragen op de laptop, openen op de telefoon).
export default async function InloggenBevestigen({ searchParams }: { searchParams: Zoekparameters }) {
  const { token_hash: sleutel } = await searchParams;
  if (typeof sleutel !== 'string' || sleutel === '') redirect('/inloggen?fout=link');

  return (
    <main>
      <h1>Inloggen bevestigen</h1>
      <form action={bevestigInloggen}>
        <input type="hidden" name="token_hash" value={sleutel} />
        <p>
          <button type="submit">Inloggen</button>
        </p>
      </form>
    </main>
  );
}
