import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Jouwstatus } from '@/components/jouwstatus/jouwstatus';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { huidigeGebruiker } from '@/lib/gebruiker';
import { langeDag } from '@/lib/programma';
import { huidigeAuthGebruiker } from '@/lib/sessie';
import { maakSupabase } from '@/lib/supabase/server';

import { Activiteitblok, maakStatusRegel } from '../../activiteitblok';
import { leesActiviteitVoorLid, leesIndelingen } from '../../ledenactiviteit';
import stijl from '../../ledenscherm.module.css';

export const metadata: Metadata = { title: 'Activiteit – Ledenplatform' };

/**
 * Een activiteit uit het programma (UC-001, ingang 2): dezelfde opbouw als het welkomscherm, met de naam en de dag als kop.
 * Welke activiteit een lid mag zien, beslist de database (R15, R22): een concept, of een activiteit voor een groep waar het lid
 * niet bij hoort, bestaat voor hem niet.
 */
export default async function ActiviteitVoorLid({ params }: { params: Promise<{ id: string }> }) {
  if (!(await huidigeAuthGebruiker())) redirect('/inloggen');
  const gebruiker = await huidigeGebruiker();
  if (!gebruiker) redirect('/mijn');

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await maakSupabase();
  const activiteit = await leesActiviteitVoorLid(supabase, id.data);
  if (!activiteit) notFound();

  const indeling = (await leesIndelingen(supabase, [activiteit.id], gebruiker.lidId)).get(activiteit.id);
  if (!indeling) notFound();
  const regels = [maakStatusRegel(activiteit, indeling, gebruiker.lidId, gebruiker.isBeheerder)];

  return (
    <Schermkader
      actief="programma"
      titel={`${activiteit.naam} — ${langeDag(activiteit.datum)}`}
      terug={{ href: '/programma', tekst: 'Terug naar het programma' }}
      zijkolom={
        <div className={stijl.nietOpMobiel}>
          <Jouwstatus regels={regels} />
        </div>
      }
    >
      {activiteit.status === 'geannuleerd' && (
        <Melding soort="afgemeld">Deze activiteit is geannuleerd.</Melding>
      )}
      <div className={stijl.alleenMobiel}>
        <Jouwstatus regels={regels} />
      </div>
      <Activiteitblok
        activiteit={activiteit}
        indeling={indeling}
        eigenLidId={gebruiker.lidId}
        metNaam={false}
      />
    </Schermkader>
  );
}
