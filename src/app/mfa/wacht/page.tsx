import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { haalBeheerstatus } from '@/lib/beheer';
import { maakSupabase } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Je app is ingesteld – Ledenplatform' };

const MOMENT = new Intl.DateTimeFormat('nl-NL', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Amsterdam',
});

// Na het instellen van de app, en bij later inloggen zolang een andere beheerder de toegang nog niet heeft bevestigd
// (wireframe mfa-wacht-op-bevestiging).
export default async function WachtOpBevestiging() {
  const status = await haalBeheerstatus();
  if (status === null || status === 'geen_lid') redirect('/inloggen');
  if (status === 'ok') redirect('/beheer');
  if (status === 'code_nodig') redirect('/mfa/code');
  if (status === 'mfa_instellen') redirect('/mfa/instellen');

  // Wat de beheerder kan nalopen: de naam en het moment waarop deze app is ingesteld (review PR23-02). Hij vergelijkt ze
  // met wat Supabase heeft (Beheerders.md) en bevestigt alleen als het lid de app zelf net heeft ingesteld.
  const supabase = await maakSupabase();
  const app = (await supabase.auth.mfa.listFactors()).data?.totp[0];

  if (status === 'geen_beheerder') {
    return (
      <main>
        <p>
          <Link href="/">← Terug naar start</Link>
        </p>
        <h1>Je app is ingesteld</h1>
        <p>
          Er is voor jou geen beheer aangezet. Heb je dit niet zelf gedaan? Zeg het dan tegen het bestuur.
        </p>
        <p>
          <Link href="/">Naar Start</Link>
        </p>
      </main>
    );
  }

  return (
    <main>
      <p>
        <Link href="/">← Terug naar start</Link>
      </p>
      <h1>Je app is ingesteld</h1>
      <p>
        Een andere beheerder moet je toegang tot beheer nog bevestigen. Tot die tijd gebruik je het platform
        als lid.
      </p>
      <h2>Wat moet je nu doen?</h2>
      <p>
        Vraag een andere beheerder om je toegang te bevestigen. Zodra dat gebeurd is, kom je bij Beheer en
        vraagt het platform om een code uit je app. Je hoeft niets opnieuw in te stellen.
      </p>
      {app && (
        <>
          <h2>Dit leest de beheerder na</h2>
          <p>Noem deze twee dingen. De beheerder bevestigt alleen als ze kloppen met wat hij ziet.</p>
          <ul>
            <li>
              Naam van je app: <code>{app.friendly_name}</code>
            </li>
            <li>Ingesteld op: {MOMENT.format(new Date(app.created_at))}</li>
          </ul>
          <p>
            Heb je dit niet zelf net gedaan? Vraag dan niet om bevestiging, maar zeg het tegen de beheerder.
          </p>
        </>
      )}
      <p>
        <Link href="/">Naar Start</Link>
      </p>
    </main>
  );
}
