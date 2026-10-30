import type { Metadata } from 'next';
import Link from 'next/link';

import { Eenvoudig } from '@/components/eenvoudig/eenvoudig';

export const metadata: Metadata = { title: 'Telefoon kwijt – Ledenplatform' };

// Hulpscherm (wireframe mfa-toestel-kwijt): geen zelfbediening, bewust. Zie docs/bouw/Beheerders.md voor wat de andere
// beheerder doet.
export default function ToestelKwijt() {
  return (
    <Eenvoudig>
      <main>
        <p>
          <Link href="/mfa/code">← Terug naar de code</Link>
        </p>
        <h1>Telefoon kwijt of een nieuwe telefoon?</h1>
        <p>
          Je kunt gewoon als lid inloggen. Het programma, ruilen en afmelden werken zoals altijd. Alleen
          beheer blijft dicht tot je een nieuwe app hebt ingesteld en een andere beheerder je toegang
          bevestigt.
        </p>
        <h2>Zo kom je weer in beheer</h2>
        <p>
          Dit regel je niet zelf, en dat is bewust: zo kan niemand met alleen jouw mailbox beheer overnemen.
        </p>
        <ol>
          <li>
            <strong>Vraag een andere beheerder</strong>
            <br />
            Vraag een ander bestuurslid dat beheer gebruikt om je oude app los te koppelen. Dat kan
            persoonlijk, per telefoon of per appje.
          </li>
          <li>
            <strong>Stel een nieuwe app in</strong>
            <br />
            Log in met de link in je mail, zoals altijd. Bij Beheer stel je in drie korte stappen je nieuwe
            app in.
          </li>
          <li>
            <strong>Laat het bevestigen</strong>
            <br />
            Die andere beheerder bevestigt daarna je toegang. Zodra dat gebeurd is, kom je weer bij Beheer.
          </li>
        </ol>
        <p>
          <Link href="/">Terug naar start</Link>
        </p>
      </main>
    </Eenvoudig>
  );
}
