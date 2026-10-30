import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Schermkader } from '@/components/schermkader/schermkader';
import { huidigeGebruiker } from '@/lib/gebruiker';

import { logUit } from './acties';
import stijl from './mijn.module.css';

export const metadata: Metadata = { title: 'Mijn account – Ledenplatform' };

// Wie is ingelogd en uitloggen (wireframe mijn-account). Tijdelijk: dit scherm vervalt mogelijk in Start of Mijn diensten.
export default async function MijnAccount() {
  const gebruiker = await huidigeGebruiker();
  if (!gebruiker) redirect('/inloggen');

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
