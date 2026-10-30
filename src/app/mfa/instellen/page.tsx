import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { maakSupabase } from '@/lib/supabase/server';
import { Eenvoudig } from '@/components/eenvoudig/eenvoudig';

import { InstellenFormulier } from './formulier';

export const metadata: Metadata = { title: 'Beheer beveiligen – Ledenplatform' };

/** De sleutel in groepjes van vier, zoals een authenticator-app hem laat zien: KJ7Q 4MZX 5TDB 2WHR. */
function inGroepjes(geheim: string): string {
  return geheim.replace(/\s/g, '').replace(/(.{4})(?=.)/g, '$1 ');
}

// Een authenticator-app instellen (wireframe mfa-instellen). Elk ingelogd lid mag dit: het geeft zelf nog niets, de
// beheerder bevestigt het (Datamodel-fase-1.md punt 3, docs/bouw/Beheerders.md).
export default async function BeheerBeveiligen() {
  const supabase = await maakSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/inloggen');

  const lijst = await supabase.auth.mfa.listFactors();
  if (lijst.error) throw new Error(`apps niet te lezen: ${lijst.error.code ?? lijst.error.name}`);
  // Is er al een bevestigde app, dan is hier niets meer in te stellen (een tweede app vraagt een code, en dat wil GoTrue
  // zelf): door naar de wachtpagina, die kijkt wat er nu geldt (code invoeren, beheer, of wachten op bevestiging).
  if (lijst.data.totp.length > 0) redirect('/mfa/wacht');

  // Een eerdere, nooit bevestigde poging opruimen: elke keer dat deze pagina opent, komt er een nieuwe sleutel.
  for (const oud of lijst.data.all.filter((factor) => factor.status === 'unverified')) {
    await supabase.auth.mfa.unenroll({ factorId: oud.id });
  }
  const ingeschreven = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    issuer: 'De Beringse Kuus',
    friendlyName: `app-${crypto.randomUUID().slice(0, 8)}`,
  });
  if (ingeschreven.error)
    throw new Error(`app niet in te stellen: ${ingeschreven.error.code ?? ingeschreven.error.name}`);
  const { id, totp } = ingeschreven.data;

  return (
    <Eenvoudig>
      <main>
        <p>
          <Link href="/">← Terug naar start</Link>
        </p>
        <h1>Beheer beveiligen</h1>
        <p>
          Voor beheer heb je een extra code nodig. Zo kan niemand beheer overnemen met alleen je mailbox. Je
          stelt dit één keer in en het duurt een paar minuten. Daarna bevestigt een andere beheerder je
          toegang.
        </p>
        <h2>1. Installeer een authenticator-app</h2>
        <p>
          Dat is een gratis app die elke halve minuut een nieuwe code van 6 cijfers laat zien, bijvoorbeeld
          Google Authenticator of Microsoft Authenticator. Heb je zo’n app al? Ga dan naar stap 2.
        </p>
        <InstellenFormulier factorId={id} qr={totp.qr_code} geheim={inGroepjes(totp.secret)} />
      </main>
    </Eenvoudig>
  );
}
