import type { Metadata } from 'next';
import Link from 'next/link';

import { Kaart } from '@/components/kaart/kaart';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Schermkader } from '@/components/schermkader/schermkader';
import { Statuslabel } from '@/components/statuslabel/statuslabel';
import { Tellers } from '@/components/tellers/tellers';
import { eisBeheer } from '@/lib/beheer';
import {
  leesFilter,
  maakOverzicht,
  maakRij,
  type Filter,
  type OverzichtRegel,
  type OverzichtRij,
} from '@/lib/beheeroverzicht';
import { vandaagInNederland } from '@/lib/programma';
import { maakSupabase } from '@/lib/supabase/server';

import stijl from './beheer.module.css';

export const metadata: Metadata = { title: 'Beheer – Ledenplatform' };

const FILTERKOP: Record<Exclude<Filter, 'alles'>, string> = {
  diensten: 'Diensten nog in te delen',
  concepten: 'Concepten',
};

const LEEG: Record<Exclude<Filter, 'alles'>, string> = {
  diensten: 'Er zijn geen diensten meer in te delen.',
  concepten: 'Er zijn geen concepten.',
};

function Regels({ regels, zonderKop }: { regels: OverzichtRegel[]; zonderKop?: boolean }) {
  return (
    <Lijst zonderKop={zonderKop}>
      {regels.map((regel) => (
        <Lijstrij key={regel.id}>
          <span className={stijl.tekst}>
            <span className={stijl.dag}>{regel.dag}</span>
            <strong className={stijl.naam}>
              {regel.naam}
              {regel.tijd && <span className={stijl.tijd}> — {regel.tijd}</span>}
            </strong>
            {regel.taak && <span className={stijl.taak}>{regel.taak}</span>}
            {!regel.taak && regel.aanwezigheid && (
              <span className={stijl.aanwezig}>{regel.aanwezigheid}</span>
            )}
          </span>
          {regel.status === 'concept' && <Statuslabel status="concept">Concept</Statuslabel>}
        </Lijstrij>
      ))}
    </Lijst>
  );
}

export default async function Beheer({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string | string[] }>;
}) {
  await eisBeheer();
  const filter = leesFilter((await searchParams).filter);
  const supabase = await maakSupabase();

  // De rijen komen uit de database (public.beheeroverzicht(), alleen voor een beheerder met een code); de tijd van de
  // activiteit komt uit activiteiten. Wat een regel wil zeggen, maakt src/lib/beheeroverzicht.ts.
  const { data: rijen, error } = await supabase.rpc('beheeroverzicht');
  if (error) throw new Error(`beheeroverzicht niet te lezen: ${error.code ?? error.message}`);

  const tijdPerId = new Map<string, string | null>();
  if (rijen.length > 0) {
    const { data: tijden, error: tijdFout } = await supabase
      .from('activiteiten')
      .select('id, verzameltijd, starttijd')
      .in(
        'id',
        rijen.map((rij) => rij.activiteit_id),
      );
    if (tijdFout) throw new Error(`activiteiten niet te lezen: ${tijdFout.code ?? tijdFout.message}`);
    for (const tijd of tijden) tijdPerId.set(tijd.id, tijd.verzameltijd ?? tijd.starttijd);
  }

  const overzicht = maakOverzicht(
    rijen.flatMap((rij): OverzichtRij[] => maakRij(rij, tijdPerId.get(rij.activiteit_id) ?? null)),
    vandaagInNederland(new Date()),
    filter,
  );

  const tellers = [
    {
      href: filter === 'diensten' ? '/beheer' : '/beheer?filter=diensten',
      aantal: overzicht.tellers.diensten,
      label: 'diensten nog in te delen',
      actief: filter === 'diensten',
    },
    {
      href: filter === 'concepten' ? '/beheer' : '/beheer?filter=concepten',
      aantal: overzicht.tellers.concepten,
      label: overzicht.tellers.concepten === 1 ? 'concept' : 'concepten',
      actief: filter === 'concepten',
    },
  ];

  return (
    <Schermkader actief="beheer" titel="Activiteiten">
      <Tellers tellers={tellers} naam="Filter op wat er te doen is" />

      {filter !== 'alles' ? (
        <>
          <div className={stijl.filterkop}>
            <h2>{FILTERKOP[filter]}</h2>
            <Link href="/beheer">Alles tonen</Link>
          </div>
          {overzicht.aandacht.length === 0 ? (
            <p className={stijl.leeg}>{LEEG[filter]}</p>
          ) : (
            <Kaart lijst>
              <Regels regels={overzicht.aandacht} zonderKop />
            </Kaart>
          )}
        </>
      ) : overzicht.aandacht.length === 0 && overzicht.opOrde.length === 0 ? (
        <p className={stijl.leeg}>Er zijn nog geen komende activiteiten.</p>
      ) : (
        <>
          {overzicht.aandacht.length > 0 && (
            <Kaart titel="Vraagt aandacht" lijst>
              <Regels regels={overzicht.aandacht} />
            </Kaart>
          )}
          {overzicht.opOrde.length > 0 && (
            <Kaart titel="Op orde" lijst>
              <Regels regels={overzicht.opOrde} />
            </Kaart>
          )}
        </>
      )}
    </Schermkader>
  );
}
