import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { haalBeheerstatus } from '@/lib/beheer';
import { CODE_GELDIG_UUR, CODE_MELDINGEN, routeVoorBeheerstatus } from '@/lib/mfa';
import { maakSupabase } from '@/lib/supabase/server';
import { Eenvoudig } from '@/components/eenvoudig/eenvoudig';

import { bevestigCode } from '../acties';

export const metadata: Metadata = { title: 'Code voor beheer – Ledenplatform' };

type Zoekparameters = Promise<Record<string, string | string[] | undefined>>;

// De code bij elke beheersessie (wireframes mfa-code, mfa-code-fout en mfa-opnieuw). Wie hier komt zonder dat een code
// nodig is, gaat door naar waar hij heen moet; de beheerstatus uit de database beslist.
export default async function CodeVoorBeheer({ searchParams }: { searchParams: Zoekparameters }) {
  const status = await haalBeheerstatus();
  if (status === null) redirect('/inloggen');
  if (status !== 'code_nodig') redirect(routeVoorBeheerstatus(status) ?? '/beheer');

  const zoek = await searchParams;
  const fout = zoek.fout === 'code' || zoek.fout === 'druk' || zoek.fout === 'sessie' ? zoek.fout : null;

  // Een sessie die al aal2 was en toch een code vraagt, heeft de 12 uur overschreden: dat is geen storing, en dat zeggen we.
  const supabase = await maakSupabase();
  const niveau = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const opnieuw = niveau.data?.currentLevel === 'aal2';

  return (
    <Eenvoudig>
      <main>
        <p>
          <Link href="/">← Terug naar start</Link>
        </p>
        <h1>{opnieuw ? 'Vul opnieuw je code in' : 'Code voor beheer'}</h1>
        {opnieuw && (
          <p>
            Beheer vraagt elke {CODE_GELDIG_UUR} uur om een nieuwe code, ook als je ingelogd blijft. Dat is
            geen storing. Alles voor leden werkt gewoon door.
          </p>
        )}
        <h2>Vul de code uit je app in</h2>
        <p>
          Open je authenticator-app en typ de 6 cijfers die bij De Beringse Kuus staan. De code verandert elke
          halve minuut.
        </p>
        <form action={bevestigCode}>
          <p>
            <label htmlFor="code">Code uit de app</label>
            <br />
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              required
              aria-invalid={fout ? true : undefined}
              aria-describedby={fout ? 'code-fout' : 'code-hulp'}
            />
            <br />
            <small id="code-hulp">6 cijfers</small>
          </p>
          {fout && (
            <p id="code-fout" role="alert">
              {CODE_MELDINGEN[fout]}
            </p>
          )}
          {fout === 'code' && (
            <p>Blijft het misgaan? Controleer of de tijd op je telefoon automatisch staat ingesteld.</p>
          )}
          <p>
            <button type="submit">Verder naar beheer</button>
          </p>
        </form>
        <p>
          <Link href="/mfa/toestel-kwijt">Nieuwe telefoon of telefoon kwijt? Lees wat je dan doet →</Link>
        </p>
      </main>
    </Eenvoudig>
  );
}
