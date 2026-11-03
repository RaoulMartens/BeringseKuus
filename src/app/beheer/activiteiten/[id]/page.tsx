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
import { langeDag } from '@/lib/programma';
import { maakSupabase } from '@/lib/supabase/server';

import { Activiteitformulier, FORMULIER_ID } from '../activiteitformulier';
import { leesActiviteit, leesAfgemeld, leesGroepen, leesKandidaten } from '../gegevens';

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

  // Een gepubliceerde of geannuleerde activiteit wijzigen raakt anderen en vraagt eerst een bevestiging: dat komt in een
  // volgende stap. Tot dan toont het scherm wat er staat.
  if (activiteit.status !== 'concept') {
    const tijden = [activiteit.tekst.starttijd, activiteit.tekst.eindtijd].filter(Boolean).join(' – ');
    return (
      <Schermkader
        actief="beheer"
        titel={titel}
        terug={terug}
        zijkolom={
          <Statuspaneel
            status={activiteit.status === 'gepubliceerd' ? 'Gepubliceerd' : 'Geannuleerd'}
            uitleg="Leden zien deze activiteit."
          />
        }
      >
        <Melding soort="info">
          Een gepubliceerde activiteit wijzigen kan hier nog niet. Het scherm toont wat er staat.
        </Melding>
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

  const [{ groepen, aantalLeden }, kandidaten, afgemeld] = await Promise.all([
    leesGroepen(supabase),
    leesKandidaten(supabase),
    leesAfgemeld(supabase, activiteit.id),
  ]);
  return (
    <Schermkader
      actief="beheer"
      titel={titel}
      terug={terug}
      zijkolom={
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
      }
    >
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
      />
      <div className={stijl.verwijderMobiel}>
        <Knop href={`/beheer/activiteiten/${activiteit.id}/verwijderen`} soort="tekst-gevaar">
          Concept verwijderen
        </Knop>
      </div>
    </Schermkader>
  );
}
