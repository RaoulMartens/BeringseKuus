import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { Veld } from '@/components/veld/veld';
import { haalBeheerstatus } from '@/lib/beheer';
import { CODE_GELDIG_UUR, CODE_MELDINGEN, routeVoorBeheerstatus } from '@/lib/mfa';
import { maakSupabase } from '@/lib/supabase/server';

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
    <Schermkader
      actief="beheer"
      titel={opnieuw ? 'Vul opnieuw je code in' : 'Code voor beheer'}
      terug={{ href: '/', tekst: 'Terug naar start' }}
    >
      {opnieuw && (
        <Melding soort="info">
          Beheer vraagt elke {CODE_GELDIG_UUR} uur om een nieuwe code, ook als je ingelogd blijft. Dat is geen
          storing. Alles voor leden werkt gewoon door.
        </Melding>
      )}
      <Kaart titel="Vul de code uit je app in">
        <p>
          Open je authenticator-app en typ de 6 cijfers die bij De Beringse Kuus staan. De code verandert elke
          halve minuut.
        </p>
        <form action={bevestigCode}>
          <Veld
            id="code"
            name="code"
            label="Code uit de app"
            hulp="6 cijfers"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            required
            fout={fout ? CODE_MELDINGEN[fout] : undefined}
          />
          {fout === 'code' && (
            <p>Blijft het misgaan? Controleer of de tijd op je telefoon automatisch staat ingesteld.</p>
          )}
          <p>
            <Knop type="submit">Verder naar beheer</Knop>
          </p>
        </form>
      </Kaart>
      <Kaart lijst>
        <Lijst zonderKop>
          <Lijstrij href="/mfa/toestel-kwijt">
            Nieuwe telefoon of telefoon kwijt? Lees wat je dan doet
          </Lijstrij>
        </Lijst>
      </Kaart>
    </Schermkader>
  );
}
