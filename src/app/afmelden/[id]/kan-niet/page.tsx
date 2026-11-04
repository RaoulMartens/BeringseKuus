import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { leesOndergrensQuery, momentTekst, ONDERGRENS_TEKST } from '@/lib/afmelden';
import { huidigeGebruiker } from '@/lib/gebruiker';
import { huidigeAuthGebruiker } from '@/lib/sessie';
import { maakSupabase } from '@/lib/supabase/server';

import { leesAfmeldActiviteit } from '../../gegevens';
import stijl from '../../afmelden.module.css';

export const metadata: Metadata = { title: 'Afmelden kan nu niet – Ledenplatform' };

/**
 * Afmelden is geblokkeerd (UC-003 AF-3, R8): de deadline is voorbij én er blijven te weinig mensen over. De pagina zegt het in de
 * woorden van het ontwerp, zegt dat er niets is vastgelegd, en geeft het nummer van de eindverantwoordelijke (R10). De aantallen
 * staan in het adres: alleen getallen, geen persoonsgegevens, en ze worden gecontroleerd (zonder cijfers valt de uitleg weg).
 */
export default async function AfmeldenKanNiet({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ min?: string | string[]; nu?: string | string[] }>;
}) {
  if (!(await huidigeAuthGebruiker())) redirect('/inloggen');
  const gebruiker = await huidigeGebruiker();
  if (!gebruiker) redirect('/mijn');

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await maakSupabase();
  const activiteit = await leesAfmeldActiviteit(supabase, id.data);
  if (!activiteit) notFound();

  const cijfers = leesOndergrensQuery(await searchParams);
  const { data: contacten, error } = await supabase.rpc('contact_eindverantwoordelijke', {
    p_activiteit: activiteit.id,
  });
  if (error) throw new Error(`contact niet te lezen: ${error.code ?? error.message}`);
  const contact = contacten[0];

  return (
    <Schermkader actief="start" titel="Afmelden kan nu niet" terug={{ href: '/', tekst: 'Terug naar start' }}>
      <Melding soort="let-op">{ONDERGRENS_TEKST}</Melding>
      <p className={stijl.tekst}>
        Er is niets vastgelegd: je staat nog steeds op aanwezig bij {activiteit.naam}.
      </p>
      <Kaart titel="Wat je nu kunt doen">
        <p className={stijl.tekst}>Regel het persoonlijk met de eindverantwoordelijke van deze activiteit.</p>
        <p className={[stijl.tekst, stijl.contact].join(' ')}>
          {contact?.telefoon ? (
            <>
              <span className={stijl.contactNaam}>
                {contact.voornaam} {contact.achternaam}
              </span>
              <span className={stijl.nummer}>
                <a href={`tel:${contact.telefoon.replace(/[^\d+]/g, '')}`}>{contact.telefoon}</a>
              </span>
              <span>eindverantwoordelijke</span>
            </>
          ) : (
            <span>Het nummer van de eindverantwoordelijke staat er nog niet. Vraag het aan het bestuur.</span>
          )}
        </p>
      </Kaart>
      <Kaart titel="Waarom dit nu niet kan">
        <p className={stijl.tekst}>
          Twee dingen zijn tegelijk waar. Als er maar één van waar was, had je je gewoon kunnen afmelden.
        </p>
        <ol className={stijl.reden}>
          <li>
            <strong>De deadline is voorbij.</strong>{' '}
            {activiteit.afmeldDeadline
              ? `Die was ${momentTekst(activiteit.afmeldDeadline)}. Daarvóór was afmelden vrij, ook met dit aantal mensen.`
              : 'Daarvóór was afmelden vrij.'}
          </li>
          <li>
            <strong>Er blijven te weinig mensen over.</strong>{' '}
            {cijfers
              ? `Nu ${cijfers.nu} aanwezig, het minimum is ${cijfers.min}. Met jouw afmelding worden het er ${Math.max(cijfers.nu - 1, 0)}. Met meer mensen had het ook nu nog gekund.`
              : 'Met jouw afmelding komt het aantal aanwezigen onder het minimum. Met meer mensen had het ook nu nog gekund.'}
          </li>
        </ol>
      </Kaart>
      <div className={stijl.knoppen}>
        <Knop href="/">Terug naar start</Knop>
      </div>
    </Schermkader>
  );
}
