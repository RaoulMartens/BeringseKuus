import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Jouwstatus } from '@/components/jouwstatus/jouwstatus';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { WieKomter } from '@/components/wiekomter/wiekomter';
import { huidigeGebruiker } from '@/lib/gebruiker';
import { overgenomenMelding, overnemenHref } from '@/lib/overnemen';
import { rolLabel } from '@/lib/rollen';
import { langeDag } from '@/lib/programma';
import { huidigeAuthGebruiker } from '@/lib/sessie';
import { maakSupabase } from '@/lib/supabase/server';

import { Activiteitblok, maakStatusRegel } from '../../activiteitblok';
import { leesActiviteitVoorLid, leesIndelingen, leesWieKomtEr } from '../../ledenactiviteit';
import stijl from '../../ledenscherm.module.css';

export const metadata: Metadata = { title: 'Activiteit – Ledenplatform' };

/** De dag klein boven de naam in het kopvlak, met een hoofdletter: "Zondag 7 februari". */
function dagTitel(datum: string): string {
  const dag = langeDag(datum);
  return dag.charAt(0).toUpperCase() + dag.slice(1);
}

/**
 * Een activiteit uit het programma (UC-001, ingang 2): dezelfde opbouw als het welkomscherm, met de naam en de dag als kop.
 * Welke activiteit een lid mag zien, beslist de database (R15, R22): een concept, of een activiteit voor een groep waar het lid
 * niet bij hoort, bestaat voor hem niet.
 */
export default async function ActiviteitVoorLid({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
  const raster = (await leesWieKomtEr(supabase, [activiteit.id], gebruiker.lidId)).get(activiteit.id);
  const wieKomter = raster ? <WieKomter raster={raster} activiteit={activiteit.naam} /> : null;
  const nu = new Date();
  const overgenomen = (await searchParams).overgenomen;
  const melding =
    typeof overgenomen === 'string' && overgenomen !== ''
      ? overgenomenMelding(rolLabel(overgenomen) ?? overgenomen)
      : null;
  // Het bestuur neemt een dienst over bij een activiteit die nog niet is geweest.
  const kanOvernemen =
    gebruiker.isBeheerder && activiteit.status !== 'geannuleerd' && activiteit.eindigtOm > nu.toISOString();
  const regels = [maakStatusRegel(activiteit, indeling, gebruiker.lidId, gebruiker.isBeheerder, nu)];

  return (
    <Schermkader
      actief="programma"
      titel={activiteit.naam}
      datum={dagTitel(activiteit.datum)}
      terug={{ href: '/programma', tekst: 'Terug naar het programma' }}
      zijkolom={
        <div className={stijl.nietOpMobiel}>
          <Jouwstatus regels={regels} />
          {wieKomter}
        </div>
      }
    >
      {melding && (
        <Melding soort="succes">
          <strong>{melding.vet}</strong> {melding.vervolg}
        </Melding>
      )}
      {activiteit.status === 'geannuleerd' && (
        <Melding soort="afgemeld">Deze activiteit is geannuleerd.</Melding>
      )}
      <Activiteitblok
        activiteit={activiteit}
        indeling={indeling}
        eigenLidId={gebruiker.lidId}
        metNaam={false}
        overnemen={kanOvernemen ? (lidId) => overnemenHref(activiteit.id, lidId) : undefined}
        // op een telefoon staat de status direct onder het kaartje (ontwerp 16-10-2026)
        naKaartje={
          <div className={stijl.alleenMobiel}>
            <Jouwstatus regels={regels} />
          </div>
        }
      />
      <div className={stijl.alleenMobiel}>{wieKomter}</div>
    </Schermkader>
  );
}
