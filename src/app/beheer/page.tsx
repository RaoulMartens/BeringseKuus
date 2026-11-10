import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Melding } from '@/components/melding/melding';
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
import { aantalTeBevestigen, ingangTekst } from '@/lib/beheerders';
import { huidigeGebruiker } from '@/lib/gebruiker';
import { vandaagInNederland } from '@/lib/programma';
import { naamUitLog } from '@/lib/verwijderen';
import { maakSupabase } from '@/lib/supabase/server';

import { leesZelfNietZichtbaar } from './activiteiten/gegevens';
import { leesBeheerderslijst } from './beheerders/gegevens';
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
        <Lijstrij key={regel.id} href={`/beheer/activiteiten/${regel.id}`}>
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

/** Het aanmaken: een zijkaart op een groot scherm, een knop direct onder de kop op een telefoon (ontwerpbesluit). */
function Aanmaken() {
  return (
    <div className={stijl.nietOpMobiel}>
      <Kaart titel="Nieuwe activiteit" ondertitel="Begint als concept. Leden zien hem pas als je publiceert.">
        <Knop href="/beheer/activiteiten/nieuw" icoon="plus" icoonGewicht="bold" vol>
          Activiteit aanmaken
        </Knop>
      </Kaart>
    </div>
  );
}

/** De ingang naar Beheerders, met de taak als regel (zoals "Vraagt aandacht" voor activiteiten): wie je nog moet bevestigen. */
function Beheerderskaart({ aantal }: { aantal: number }) {
  return (
    <Kaart titel="Beheerders" lijst>
      <Lijst>
        <Lijstrij href="/beheer/beheerders">{ingangTekst(aantal)}</Lijstrij>
      </Lijst>
    </Kaart>
  );
}

export default async function Beheer({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string | string[];
    opgeslagen?: string | string[];
    gepubliceerd?: string | string[];
    verwijderd?: string | string[];
  }>;
}) {
  await eisBeheer();
  const parameters = await searchParams;
  const filter = leesFilter(parameters.filter);
  // Na het opslaan of publiceren: het id van de activiteit. Geen tekst in de adresbalk: wat er staat, komt uit de database.
  const opgeslagen = z.uuid().safeParse(parameters.opgeslagen);
  const gepubliceerd = z.uuid().safeParse(parameters.gepubliceerd);
  const verwijderd = z.uuid().safeParse(parameters.verwijderd);
  const supabase = await maakSupabase();
  const teBevestigen = aantalTeBevestigen(await leesBeheerderslijst(supabase));

  // De rijen komen uit de database (public.beheeroverzicht(), alleen voor een beheerder met een code); de tijd van de
  // activiteit komt uit activiteiten. Wat een regel wil zeggen, maakt src/lib/beheeroverzicht.ts.
  const { data: rijen, error } = await supabase.rpc('beheeroverzicht');
  if (error) throw new Error(`beheeroverzicht niet te lezen: ${error.code ?? error.message}`);

  const tijdPerId = new Map<string, string | null>();
  const heeftDeadline = new Set<string>();
  if (rijen.length > 0) {
    const { data: tijden, error: tijdFout } = await supabase
      .from('activiteiten')
      .select('id, verzameltijd, starttijd, afmeld_deadline')
      .in(
        'id',
        rijen.map((rij) => rij.activiteit_id),
      );
    if (tijdFout) throw new Error(`activiteiten niet te lezen: ${tijdFout.code ?? tijdFout.message}`);
    for (const tijd of tijden) {
      tijdPerId.set(tijd.id, tijd.verzameltijd ?? tijd.starttijd);
      if (tijd.afmeld_deadline) heeftDeadline.add(tijd.id);
    }
  }

  const overzichtsrijen = rijen.flatMap((rij): OverzichtRij[] =>
    // Zonder afmeld-deadline geldt het minimum niet (BA-5): dan is er ook geen "te weinig" om te melden.
    maakRij(
      { ...rij, min_aanwezigen: heeftDeadline.has(rij.activiteit_id) ? rij.min_aanwezigen : null },
      tijdPerId.get(rij.activiteit_id) ?? null,
    ),
  );
  const overzicht = maakOverzicht(overzichtsrijen, vandaagInNederland(new Date()), filter);
  const bewaard = opgeslagen.success
    ? overzichtsrijen.find((rij) => rij.activiteitId === opgeslagen.data)
    : undefined;
  const nuGepubliceerd = gepubliceerd.success
    ? overzichtsrijen.find((rij) => rij.activiteitId === gepubliceerd.data)
    : undefined;

  // Na het publiceren voor een groep waar de beheerder zelf niet in zit: Start toont hem niet, dus zegt het scherm dat erbij.
  let zelfNiet: string | null = null;
  if (nuGepubliceerd && nuGepubliceerd.status !== 'concept') {
    const gebruiker = await huidigeGebruiker();
    if (gebruiker)
      zelfNiet = await leesZelfNietZichtbaar(supabase, nuGepubliceerd.activiteitId, gebruiker.lidId);
  }

  // Een verwijderd concept bestaat niet meer: de naam staat nog in het wijzigingenlog (alleen voor een beheerder te lezen).
  let verwijderdeNaam: string | null | undefined;
  if (verwijderd.success) {
    const { data: regel, error: logFout } = await supabase
      .from('wijzigingen_log')
      .select('omschrijving')
      .in('actie', ['concept_verwijderd', 'activiteit_verwijderd'])
      .eq('rij_id', verwijderd.data)
      .order('moment', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (logFout) throw new Error(`wijzigingenlog niet te lezen: ${logFout.code ?? logFout.message}`);
    verwijderdeNaam = regel ? naamUitLog(regel.omschrijving) : undefined;
  }

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
    <Schermkader
      actief="beheer"
      titel="Activiteiten"
      zijkolom={
        <>
          <Aanmaken />
          <Beheerderskaart aantal={teBevestigen} />
        </>
      }
    >
      <div className={stijl.alleenMobiel}>
        <Knop href="/beheer/activiteiten/nieuw" icoon="plus" icoonGewicht="bold">
          Activiteit aanmaken
        </Knop>
      </div>
      {bewaard?.status === 'concept' && (
        <Melding soort="succes">
          <strong>{bewaard.naam} is opgeslagen als concept.</strong> Leden zien hem pas als je publiceert.
        </Melding>
      )}
      {bewaard?.status === 'gepubliceerd' && (
        <Melding soort="succes">
          <strong>{bewaard.naam} is bijgewerkt.</strong> Leden zien de wijziging meteen. Er gaat nog geen
          bericht uit.
        </Melding>
      )}
      {nuGepubliceerd && nuGepubliceerd.status !== 'concept' && (
        <Melding soort="succes">
          <strong>{nuGepubliceerd.naam} is gepubliceerd.</strong> Leden zien hem nu.
        </Melding>
      )}
      {zelfNiet && <Melding soort="info">{zelfNiet}</Melding>}
      {verwijderdeNaam !== undefined && (
        <Melding soort="succes">
          <strong>
            {verwijderdeNaam ? `${verwijderdeNaam} is verwijderd.` : 'Het concept is verwijderd.'}
          </strong>
        </Melding>
      )}
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
