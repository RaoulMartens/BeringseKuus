import type { Metadata } from 'next';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';

import stijl from './toestel-kwijt.module.css';

export const metadata: Metadata = { title: 'Telefoon kwijt – Ledenplatform' };

// Hulpscherm (wireframe mfa-toestel-kwijt): geen zelfbediening, bewust. Zie docs/bouw/Beheerders.md voor wat de andere
// beheerder doet. Het scherm vraagt niets aan de database: wie zijn telefoon kwijt is, kan hier altijd lezen wat te doen.
export default function ToestelKwijt() {
  return (
    <Schermkader
      gast
      titel="Telefoon kwijt of een nieuwe telefoon?"
      terug={{ href: '/mfa/code', tekst: 'Terug naar de code' }}
    >
      <Melding soort="info">
        Je kunt gewoon als lid inloggen. Het programma, ruilen en afmelden werken zoals altijd. Alleen beheer
        blijft dicht tot je een nieuwe app hebt ingesteld en een andere beheerder je toegang bevestigt.
      </Melding>
      <Kaart titel="Zo kom je weer in beheer">
        <p>
          Dit regel je niet zelf, en dat is bewust: zo kan niemand met alleen jouw mailbox beheer overnemen.
        </p>
        <ol className={stijl.stappen}>
          <li>
            <strong>Vraag de beheerder van het platform</strong>
            <br />
            Vraag de beheerder om je oude app los te koppelen. Dat kan persoonlijk, per telefoon of per appje.
            Is je telefoon gestolen? Zeg dat er meteen bij, en zorg dat je mailbox is beveiligd.
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
            De beheerder bevestigt daarna je toegang. Zodra dat gebeurd is, kom je weer bij Beheer.
          </li>
        </ol>
        <p>
          <Knop href="/" soort="secundair">
            Terug naar start
          </Knop>
        </p>
      </Kaart>
    </Schermkader>
  );
}
