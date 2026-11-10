import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { datumEnTijd, vertaalBeheerderfout } from '@/lib/beheerders';
import { maakSupabase } from '@/lib/supabase/server';

import { bevestigBeheerder } from '../../acties';
import { Bevestigformulier } from '../../bevestigformulier';
import stijl from '../../beheerders.module.css';
import { leesBeheerderslijst } from '../../gegevens';

export const metadata: Metadata = { title: 'Toegang bevestigen – Ledenplatform' };

/**
 * De toegang van een nieuwe beheerder bevestigen (wireframe admin-beheerder-bevestigen). Het is het moment waarop een
 * aanval wordt gestopt (Beheerders.md, "Bevestigen: wat je controleert"): de pagina toont de naam en het moment van de app,
 * en het aantal apps, zodat de beheerder kan nalezen of ze kloppen met wat het lid zelf ziet. De knop stuurt de app mee die
 * hier stond; is die intussen veranderd, dan bevestigt de database niets.
 */
export default async function ToegangBevestigen({ params }: { params: Promise<{ lidId: string }> }) {
  await eisBeheer();
  const id = z.uuid().safeParse((await params).lidId);
  if (!id.success) notFound();

  const beheerder = (await leesBeheerderslijst(await maakSupabase())).find((b) => b.lidId === id.data);
  // Niets te bevestigen: geen beheerder, je eigen regel, of al bevestigd (iemand anders was je voor).
  if (!beheerder || beheerder.isIk || beheerder.status !== 'wacht_op_bevestiging' || !beheerder.appId) {
    redirect('/beheer/beheerders');
  }

  const intrekken = {
    href: `/beheer/beheerders/${beheerder.lidId}/intrekken`,
    tekst: `Dit klopt niet: rechten van ${beheerder.naam} intrekken`,
  };

  return (
    <Schermkader
      actief="beheer"
      titel={`Toegang van ${beheerder.naam} bevestigen?`}
      terug={{ href: '/beheer/beheerders', tekst: 'Terug naar beheerders' }}
    >
      <Kaart
        titel={`${beheerder.naam} heeft een app ingesteld`}
        ondertitel={`Bevestig alleen als dit klopt met wat ${beheerder.naam} zelf ziet op het scherm “Je app is ingesteld”.`}
      >
        <dl className={stijl.gegevens}>
          <dt>Naam van de app</dt>
          <dd>{beheerder.appNaam ?? 'zonder naam'}</dd>
          <dt>Ingesteld op</dt>
          <dd>{beheerder.appIngesteld ? datumEnTijd(beheerder.appIngesteld) : 'onbekend'}</dd>
          <dt>Aantal apps</dt>
          <dd>{beheerder.aantalApps}</dd>
        </dl>
      </Kaart>
      <Melding soort="let-op">
        Vraag het {beheerder.naam} zelf, liever aan de telefoon of persoonlijk dan per mail of chat. Is dit
        niet net door het lid zelf gedaan? Bevestig dan niet.
      </Melding>
      {beheerder.aantalApps === 1 ? (
        <Bevestigformulier
          actie={bevestigBeheerder}
          velden={{ lid_id: beheerder.lidId, app_id: beheerder.appId }}
          knop="Toegang bevestigen"
          terugHref="/beheer/beheerders"
          extra={intrekken}
        />
      ) : (
        <>
          <Melding soort="fout">{vertaalBeheerderfout('app_onduidelijk')}</Melding>
          <div className={stijl.knoppen}>
            <Knop href={intrekken.href} soort="negatief">
              Rechten intrekken
            </Knop>
            <Knop href="/beheer/beheerders" soort="tekst">
              Annuleren
            </Knop>
          </div>
        </>
      )}
    </Schermkader>
  );
}
