import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { haalBeheerstatus } from '@/lib/beheer';

export const metadata: Metadata = { title: 'Je app is ingesteld – Ledenplatform' };

// Na het instellen van de app, en bij later inloggen zolang een andere beheerder de toegang nog niet heeft bevestigd
// (wireframe mfa-wacht-op-bevestiging).
export default async function WachtOpBevestiging() {
  const status = await haalBeheerstatus();
  if (status === null || status === 'geen_lid') redirect('/inloggen');
  // Alleen wie echt wacht (of nog niet is aangewezen en net zijn app instelde) blijft hier; wie al verder is, gaat verder.
  if (status === 'ok') redirect('/beheer');
  if (status === 'code_nodig') redirect('/mfa/code');

  return (
    <main>
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
      <p>
        <Link href="/">Naar Start</Link>
      </p>
    </main>
  );
}
