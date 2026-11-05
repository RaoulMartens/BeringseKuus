import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { huidigeGebruiker } from '@/lib/gebruiker';
import { langeDag } from '@/lib/programma';
import { aantalIngedeeld, nogLeegTekst, zelfNietZichtbaarTekst, zichtbaarVoorTekst } from '@/lib/publiceren';
import { maakSupabase } from '@/lib/supabase/server';

import { leesActiviteit, leesEigenGroepen, leesGroepen } from '../../gegevens';

import { Publiceerformulier } from './publiceerformulier';
import stijl from './publiceren.module.css';

export const metadata: Metadata = { title: 'Publiceren – Ledenplatform' };

/**
 * De bevestiging voor het publiceren (UC-004 stap 10): publiceren raakt anderen en kan niet terug, dus eerst een eigen
 * pagina met wat er gebeurt (ontwerpregel "Bevestigen"). Deze pagina wijzigt niets; de knop roept publiceerActiviteit aan.
 */
export default async function Publiceren({ params }: { params: Promise<{ id: string }> }) {
  await eisBeheer();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await maakSupabase();
  const activiteit = await leesActiviteit(supabase, id.data);
  if (!activiteit) notFound();

  const terugHref = `/beheer/activiteiten/${activiteit.id}`;
  // Alleen een concept is te publiceren; bij een andere status is er niets te bevestigen.
  if (activiteit.status !== 'concept') redirect(terugHref);

  const gebruiker = await huidigeGebruiker();
  const [{ groepen, aantalLeden }, eigenGroepen] = await Promise.all([
    leesGroepen(supabase),
    gebruiker ? leesEigenGroepen(supabase, gebruiker.lidId) : Promise.resolve([]),
  ]);
  // Zit de beheerder zelf niet in de doelgroep, dan ziet hij de activiteit na het publiceren niet op Start: dat zegt de pagina vooraf.
  const zelfNiet = zelfNietZichtbaarTekst(activiteit.gekozenGroepen, groepen, eigenGroepen);
  const kanPubliceren = activiteit.nogNodig.length === 0;
  const nogLeeg = nogLeegTekst(activiteit.plekken);
  const ev = activiteit.eindverantwoordelijke;

  return (
    <Schermkader
      actief="beheer"
      titel={`${activiteit.naam} publiceren?`}
      terug={{ href: terugHref, tekst: 'Terug naar de activiteit' }}
    >
      {kanPubliceren ? (
        <Melding soort="info">
          Leden zien de activiteit zodra je publiceert. Berichten naar leden gaan in deze versie nog niet uit.
        </Melding>
      ) : (
        <Melding soort="let-op">
          <strong>Publiceren kan nog niet.</strong> Nog nodig:
          <ul className={stijl.nodig}>
            {activiteit.nogNodig.map((onderdeel) => (
              <li key={onderdeel}>{onderdeel}</li>
            ))}
          </ul>
        </Melding>
      )}

      {zelfNiet && <Melding soort="info">{zelfNiet}</Melding>}

      <Kaart titel={`${activiteit.naam} — ${langeDag(activiteit.datum)}`} lijst>
        <Lijst>
          <Lijstrij>
            <span>
              <strong>Zichtbaar voor:</strong>{' '}
              {zichtbaarVoorTekst(activiteit.gekozenGroepen, groepen, aantalLeden)}
            </span>
          </Lijstrij>
          <Lijstrij>
            <span>
              <strong>Ingedeeld:</strong> {aantalIngedeeld(activiteit.plekken, ev.bezetterId)}{' '}
              {aantalIngedeeld(activiteit.plekken, ev.bezetterId) === 1 ? 'persoon' : 'mensen'}
            </span>
          </Lijstrij>
          <Lijstrij>
            <span>
              <strong>Nog leeg:</strong> {nogLeeg ?? 'niets, alle plekken zijn ingedeeld'}
            </span>
          </Lijstrij>
          {ev.naam && (
            <Lijstrij>
              <span>
                <strong>Eindverantwoordelijke:</strong> {ev.naam}
                {ev.telefoon ? `, ${ev.telefoon}` : ''}
              </span>
            </Lijstrij>
          )}
        </Lijst>
      </Kaart>

      {kanPubliceren ? (
        <>
          <p>Terugzetten naar concept kan hierna niet meer.</p>
          <Publiceerformulier activiteitId={activiteit.id} versie={activiteit.versie} terugHref={terugHref} />
        </>
      ) : (
        <div className={stijl.knoppen}>
          <Knop href={terugHref}>Terug naar de activiteit</Knop>
        </div>
      )}
    </Schermkader>
  );
}
