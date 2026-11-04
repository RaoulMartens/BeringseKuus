import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Schermkader } from '@/components/schermkader/schermkader';
import { afgemeldHref, deadlineTekst, maakAanbod } from '@/lib/afmelden';
import { huidigeGebruiker } from '@/lib/gebruiker';
import { langeDag, tijdTekst } from '@/lib/programma';
import { huidigeAuthGebruiker } from '@/lib/sessie';
import { maakSupabase } from '@/lib/supabase/server';

import { leesAfmeldActiviteit, leesEigenAfmelding, leesEigenRollen } from '../gegevens';
import stijl from '../afmelden.module.css';

import { Afmeldformulier } from './afmeldformulier';

export const metadata: Metadata = { title: 'Afmelden – Ledenplatform' };

/**
 * De bevestiging van een afmelding (UC-003 hoofdpad): wat je afmeldt, je dienst (geen: dan kun je je vrij afmelden), de deadline
 * en een toelichting die alleen het bestuur leest. Deze pagina wijzigt niets; de knop roept meldAf aan. Wie hier niet kan
 * afmelden (een dienst, een beheerrol, de activiteit is geweest) leest waarom; wie al is afgemeld gaat naar het resultaat.
 */
export default async function Afmelden({ params }: { params: Promise<{ id: string }> }) {
  if (!(await huidigeAuthGebruiker())) redirect('/inloggen');
  const gebruiker = await huidigeGebruiker();
  if (!gebruiker) redirect('/mijn');

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await maakSupabase();
  const activiteit = await leesAfmeldActiviteit(supabase, id.data);
  if (!activiteit) notFound();

  if (await leesEigenAfmelding(supabase, activiteit.id, gebruiker.lidId))
    redirect(afgemeldHref(activiteit.id));

  const nu = new Date();
  const rollen = await leesEigenRollen(supabase, activiteit.id, gebruiker.lidId);
  const aanbod = maakAanbod(activiteit, nu, false, rollen);
  const terug = { href: '/', tekst: 'Terug naar start' };
  const wat = `${activiteit.naam} — ${langeDag(activiteit.datum)}`;

  if (!aanbod.afmelden) {
    return (
      <Schermkader actief="start" titel="Afmelden kan hier niet" terug={terug}>
        <Kaart titel={wat}>
          <p className={stijl.tekst}>
            {aanbod.hulp ?? 'Voor deze activiteit kun je je niet (meer) afmelden.'}
          </p>
        </Kaart>
      </Schermkader>
    );
  }

  return (
    <Schermkader actief="start" titel={`Afmelden voor ${activiteit.naam}?`} terug={terug}>
      <Kaart titel={wat}>
        <dl className={stijl.rijen}>
          {tijdTekst(activiteit.verzameltijd) && (
            <div className={stijl.rij}>
              <dt>Verzameltijd</dt>
              <dd>{tijdTekst(activiteit.verzameltijd)}</dd>
            </div>
          )}
          {activiteit.locatie && (
            <div className={stijl.rij}>
              <dt>Locatie</dt>
              <dd>{activiteit.locatie}</dd>
            </div>
          )}
          <div className={stijl.rij}>
            <dt>Jouw dienst</dt>
            <dd>Geen — je kunt je vrij afmelden</dd>
          </div>
          <div className={stijl.rij}>
            <dt>Afmeld-deadline</dt>
            <dd>{deadlineTekst(activiteit.afmeldDeadline, nu)}</dd>
          </div>
        </dl>
        <p className={stijl.tekst}>
          Je kunt je afmelding altijd weer intrekken, zolang de activiteit nog niet is geweest.
        </p>
      </Kaart>
      <Afmeldformulier activiteitId={activiteit.id} terugHref={terug.href} />
    </Schermkader>
  );
}
