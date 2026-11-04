import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Intrekformulier } from '@/components/jouwstatus/intrekformulier';
import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { maakAanbod, momentTekst } from '@/lib/afmelden';
import { huidigeGebruiker } from '@/lib/gebruiker';
import { langeDag } from '@/lib/programma';
import { huidigeAuthGebruiker } from '@/lib/sessie';
import { maakSupabase } from '@/lib/supabase/server';

import { trekAfmeldingIn } from '../../acties';
import { leesAfmeldActiviteit, leesEigenAfmelding } from '../../gegevens';
import stijl from '../../afmelden.module.css';

export const metadata: Metadata = { title: 'Afgemeld – Ledenplatform' };

/**
 * Na het afmelden (UC-003, afmelden-gelukt): wat er is vastgelegd, en dat je je afmelding kunt intrekken zolang de activiteit
 * niet is geweest. De primaire knop is het rustige vervolg, Terug naar start; intrekken staat eronder als tweede keuze, want
 * "nu ook intrekken" vooraan zetten spreekt tegen wat het lid net koos (UX-FLOWS, "De primaire knop duwt niet").
 * Staat er geen afmelding, dan is er niets te tonen en gaat het lid naar Start.
 */
export default async function Afgemeld({ params }: { params: Promise<{ id: string }> }) {
  if (!(await huidigeAuthGebruiker())) redirect('/inloggen');
  const gebruiker = await huidigeGebruiker();
  if (!gebruiker) redirect('/mijn');

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await maakSupabase();
  const activiteit = await leesAfmeldActiviteit(supabase, id.data);
  if (!activiteit) notFound();
  const afmelding = await leesEigenAfmelding(supabase, activiteit.id, gebruiker.lidId);
  if (!afmelding) redirect('/');

  const aanbod = maakAanbod(activiteit, new Date(), true, []);

  return (
    <Schermkader actief="start" titel={`Je bent afgemeld voor ${activiteit.naam}`}>
      <Melding soort="succes">
        Je afmelding is vastgelegd. Je staat niet langer op de aanwezigenlijst voor deze activiteit.
      </Melding>
      <Kaart titel="Wat is vastgelegd">
        <dl className={stijl.rijen}>
          <div className={stijl.rij}>
            <dt>Activiteit</dt>
            <dd>
              {activiteit.naam} — {langeDag(activiteit.datum)}
            </dd>
          </div>
          <div className={stijl.rij}>
            <dt>Afgemeld op</dt>
            <dd>{momentTekst(afmelding.aangemaakt)}</dd>
          </div>
          {afmelding.toelichting && (
            <div className={stijl.rij}>
              <dt>Toelichting</dt>
              <dd>{afmelding.toelichting}</dd>
            </div>
          )}
        </dl>
      </Kaart>
      {aanbod.intrekken && (
        <Kaart titel="Van gedachten veranderd?">
          <p className={stijl.tekst}>
            Je kunt je afmelding intrekken zolang de activiteit nog niet is geweest. Je staat dan weer op
            aanwezig.
          </p>
          <Intrekformulier activiteitId={activiteit.id} actie={trekAfmeldingIn} />
        </Kaart>
      )}
      <div className={stijl.knoppen}>
        <Knop href="/">Terug naar start</Knop>
      </div>
    </Schermkader>
  );
}
