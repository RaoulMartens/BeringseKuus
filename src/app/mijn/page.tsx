import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { huidigeGebruiker } from '@/lib/gebruiker';
import { huidigeAuthGebruiker } from '@/lib/sessie';

import { logUit } from './acties';
import stijl from './mijn.module.css';

export const metadata: Metadata = { title: 'Mijn account – Ledenplatform' };

// Wie is ingelogd en uitloggen (wireframe mijn-account). Tijdelijk: dit scherm vervalt mogelijk in Start of Mijn diensten.
export default async function MijnAccount() {
  const gebruiker = await huidigeGebruiker();
  if (!gebruiker) {
    // Wel een inlogaccount, maar geen lid: stil terug naar inloggen zou een lus lijken (inloggen lukt, en toch kom je niet
    // binnen). Dit scherm staat niet in de wireframes; de tekst is van de bouwer (review F1-03).
    const account = await huidigeAuthGebruiker();
    if (!account) redirect('/inloggen');
    return (
      <Schermkader gast titel="Mijn account">
        <Melding soort="let-op">
          Je bent ingelogd als {account.email}, maar dit adres staat nog niet bij de leden. Vraag het bestuur
          om je als lid toe te voegen.
        </Melding>
        <form action={logUit}>
          <Knop type="submit" soort="secundair">
            Uitloggen
          </Knop>
        </form>
      </Schermkader>
    );
  }

  return (
    <Schermkader titel="Mijn account" terug={{ href: '/', tekst: 'Terug naar start' }}>
      <Kaart>
        <dl className={stijl.gegevens}>
          <div>
            <dt>Naam</dt>
            <dd>
              {gebruiker.voornaam} {gebruiker.achternaam}
            </dd>
          </div>
          <div>
            <dt>E-mailadres</dt>
            <dd>{gebruiker.email}</dd>
          </div>
          <div>
            <dt>Je bent</dt>
            <dd>{gebruiker.isBeheerder ? 'Lid en bestuurslid' : 'Lid'}</dd>
          </div>
        </dl>
        <form action={logUit}>
          <Knop type="submit" soort="secundair">
            Uitloggen
          </Knop>
        </form>
      </Kaart>
      {gebruiker.isBeheerder && (
        <Kaart lijst>
          <Lijst zonderKop>
            <Lijstrij href="/mfa/toestel-kwijt">
              Beheer: nieuwe telefoon of telefoon kwijt? Lees wat je dan doet
            </Lijstrij>
          </Lijst>
        </Kaart>
      )}
    </Schermkader>
  );
}
