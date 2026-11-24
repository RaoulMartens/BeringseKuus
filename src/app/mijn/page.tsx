import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { haalBeheerstatus, heeftBeheerknop } from '@/lib/beheer';
import { huidigeGebruiker } from '@/lib/gebruiker';
import { jeBent } from '@/lib/jebent';
import { huidigeAuthGebruiker } from '@/lib/sessie';
import { maakSupabase } from '@/lib/supabase/server';

import { logUit } from './acties';
import { Telefoonformulier } from './telefoonformulier';
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

  // De groepen waar je in zit (Bestuur, Raad van Elf, …): ze bepalen welke activiteiten je ziet (R22). Op volgorde van de groepen.
  const supabase = await maakSupabase();
  const { data: koppelingen, error } = await supabase
    .from('lid_groep')
    .select('groepen(naam, volgorde)')
    .eq('lid_id', gebruiker.lidId);
  if (error) throw new Error(`groepen niet te lezen: ${error.code ?? error.message}`);
  const groepen = koppelingen
    .flatMap((koppeling) => (koppeling.groepen ? [koppeling.groepen] : []))
    .sort((a, b) => a.volgorde - b.volgorde)
    .map((groep) => groep.naam);

  // Je eigen nummer: een lid leest zijn eigen rij in leden_prive. Je kunt het zetten en wijzigen, niet wissen (zie zet_eigen_telefoon).
  const { data: prive, error: priveFout } = await supabase
    .from('leden_prive')
    .select('telefoon')
    .eq('lid_id', gebruiker.lidId)
    .maybeSingle();
  if (priveFout) throw new Error(`telefoonnummer niet te lezen: ${priveFout.code ?? priveFout.message}`);

  // Op een telefoon staat de knop Beheer niet in de bovenbalk (te krap): een beheerder komt er via het rondje, op deze kaart.
  const metBeheer = heeftBeheerknop(await haalBeheerstatus());

  return (
    <Schermkader titel="Mijn account" terug={{ href: '/', tekst: 'Terug naar start' }}>
      {metBeheer && (
        <div className={stijl.alleenMobiel}>
          <Kaart titel="Beheer" kop="h2">
            <p className={stijl.uitleg}>Activiteiten aanmaken, mensen indelen en publiceren.</p>
            <Knop href="/beheer" soort="secundair" vol>
              Naar Beheer
            </Knop>
          </Kaart>
        </div>
      )}
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
            <dd>{jeBent(groepen, gebruiker.isBeheerder, gebruiker.alleenBeheer)}</dd>
          </div>
        </dl>
        <form action={logUit}>
          <Knop type="submit" soort="secundair">
            Uitloggen
          </Knop>
        </form>
      </Kaart>
      <Kaart titel="Je telefoonnummer" kop="h2">
        <p className={stijl.uitleg}>
          Dit nummer zie je alleen zelf. Alleen als jij eindverantwoordelijke bent van een activiteit, zien de
          leden die de activiteit zien je nummer erbij, zodat ze je kunnen bellen.
        </p>
        <Telefoonformulier nummer={prive?.telefoon ?? ''} />
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
