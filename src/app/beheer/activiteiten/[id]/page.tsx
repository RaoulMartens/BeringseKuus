import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { Statuspaneel } from '@/components/statuspaneel/statuspaneel';
import { eisBeheer } from '@/lib/beheer';
import { huidigeGebruiker } from '@/lib/gebruiker';
import { langeDag } from '@/lib/programma';
import { zelfNietZichtbaarTekst } from '@/lib/publiceren';
import { maakSupabase } from '@/lib/supabase/server';

import { Activiteitformulier, FORMULIER_ID } from '../activiteitformulier';
import { leesActiviteit, leesAfgemeld, leesEigenGroepen, leesGroepen, leesKandidaten } from '../gegevens';

import stijl from './activiteit.module.css';

export const metadata: Metadata = { title: 'Activiteit – Ledenplatform' };

export default async function Activiteit({ params }: { params: Promise<{ id: string }> }) {
  await eisBeheer();
  // Een id dat geen uuid is, bestaat niet: dat hoeft de database niet te weten.
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await maakSupabase();
  const activiteit = await leesActiviteit(supabase, id.data);
  if (!activiteit) notFound();

  const titel = `${activiteit.naam} — ${langeDag(activiteit.datum)}`;
  const terug = { href: '/beheer', tekst: 'Terug naar activiteiten' };

  // Een geannuleerde activiteit is niet te wijzigen (annuleren is buiten de MVP); het scherm toont wat er staat.
  if (activiteit.status === 'geannuleerd') {
    const tijden = [activiteit.tekst.starttijd, activiteit.tekst.eindtijd].filter(Boolean).join(' – ');
    return (
      <Schermkader
        actief="beheer"
        titel={titel}
        terug={terug}
        zijkolom={
          <Statuspaneel status="Geannuleerd" uitleg="Leden zien dat deze activiteit niet doorgaat." />
        }
      >
        <Melding soort="info">Een geannuleerde activiteit is niet meer te wijzigen.</Melding>
        <Kaart titel="Wanneer en waar" lijst>
          <Lijst>
            <Lijstrij>{langeDag(activiteit.datum)}</Lijstrij>
            {tijden && <Lijstrij>{tijden}</Lijstrij>}
            {activiteit.tekst.locatie && <Lijstrij>{activiteit.tekst.locatie}</Lijstrij>}
          </Lijst>
        </Kaart>
      </Schermkader>
    );
  }
  const gepubliceerd = activiteit.status === 'gepubliceerd';

  const gebruiker = await huidigeGebruiker();
  const [{ groepen, aantalLeden }, kandidaten, afgemeld, eigenGroepen] = await Promise.all([
    leesGroepen(supabase),
    leesKandidaten(supabase),
    leesAfgemeld(supabase, activiteit.id),
    gebruiker ? leesEigenGroepen(supabase, gebruiker.lidId) : Promise.resolve([]),
  ]);
  // Bij een gepubliceerde activiteit voor een groep waar de beheerder zelf niet in zit, bestaat "Zo zien leden het" voor hem
  // niet (het ledenscherm is er dicht): de pagina zegt waarom, in plaats van een link naar niet gevonden.
  const zelfNiet = gepubliceerd
    ? zelfNietZichtbaarTekst(activiteit.gekozenGroepen, groepen, eigenGroepen)
    : null;
  return (
    <Schermkader
      actief="beheer"
      titel={titel}
      terug={terug}
      zijkolom={
        gepubliceerd ? (
          <Statuspaneel
            status="Gepubliceerd"
            uitleg="Leden zien deze activiteit. Een wijziging zien ze meteen; er gaat nog geen bericht uit."
            onderaan={
              zelfNiet ? undefined : (
                <Knop href={`/programma/${activiteit.id}`} soort="tekst">
                  Zo zien leden het
                </Knop>
              )
            }
          >
            <Knop type="submit" formulier={FORMULIER_ID} naam="actie" waarde="opslaan">
              Wijzigingen opslaan
            </Knop>
          </Statuspaneel>
        ) : (
          <Statuspaneel
            status="Concept"
            uitleg="Alleen het bestuur ziet deze activiteit."
            nodig={activiteit.nogNodig}
            onderaan={
              <Knop href={`/beheer/activiteiten/${activiteit.id}/verwijderen`} soort="tekst-gevaar">
                Concept verwijderen
              </Knop>
            }
          >
            <Knop type="submit" soort="positief" formulier={FORMULIER_ID} naam="actie" waarde="publiceren">
              Publiceren
            </Knop>
            <Knop type="submit" soort="secundair" formulier={FORMULIER_ID} naam="actie" waarde="opslaan">
              Opslaan als concept
            </Knop>
          </Statuspaneel>
        )
      }
    >
      {zelfNiet && <Melding soort="info">{zelfNiet}</Melding>}
      <Activiteitformulier
        activiteitId={activiteit.id}
        versie={activiteit.versie}
        begin={{ tekst: activiteit.tekst, groepen: activiteit.gekozenGroepen }}
        groepen={groepen}
        aantalLeden={aantalLeden}
        plekken={activiteit.plekken}
        eindverantwoordelijke={activiteit.eindverantwoordelijke}
        kandidaten={kandidaten}
        afgemeld={afgemeld}
        gepubliceerd={gepubliceerd}
      />
      {!gepubliceerd && (
        <div className={stijl.verwijderMobiel}>
          <Knop href={`/beheer/activiteiten/${activiteit.id}/verwijderen`} soort="tekst-gevaar">
            Concept verwijderen
          </Knop>
        </div>
      )}
    </Schermkader>
  );
}
