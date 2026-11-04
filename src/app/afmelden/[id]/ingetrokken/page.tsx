import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { afgemeldHref } from '@/lib/afmelden';
import { huidigeGebruiker } from '@/lib/gebruiker';
import { langeDag } from '@/lib/programma';
import { huidigeAuthGebruiker } from '@/lib/sessie';
import { maakSupabase } from '@/lib/supabase/server';

import { leesAfmeldActiviteit, leesEigenAfmelding } from '../../gegevens';
import stijl from '../../afmelden.module.css';

export const metadata: Metadata = { title: 'Weer aanwezig – Ledenplatform' };

/**
 * Na het intrekken van een afmelding (UC-003 AF-6, afmelding-ingetrokken): je staat weer op aanwezig. Staat er nog een afmelding,
 * dan is er niets ingetrokken en gaat het lid terug naar het resultaat van het afmelden. Een eerder overgedragen dienst komt niet terug
 * (R9); de pagina zegt dat nog niet, want een lid kan zijn eigen overdracht niet lezen. Dat komt met de overdracht (stap D).
 */
export default async function Ingetrokken({ params }: { params: Promise<{ id: string }> }) {
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

  return (
    <Schermkader actief="start" titel="Je staat weer op aanwezig">
      <Melding soort="succes">
        Je afmelding is ingetrokken. Je staat weer op de aanwezigenlijst voor {activiteit.naam}.
      </Melding>
      <Kaart titel="Wat is veranderd">
        <dl className={stijl.rijen}>
          <div className={stijl.rij}>
            <dt>Activiteit</dt>
            <dd>
              {activiteit.naam} — {langeDag(activiteit.datum)}
            </dd>
          </div>
          <div className={stijl.rij}>
            <dt>Status</dt>
            <dd>Aanwezig</dd>
          </div>
        </dl>
      </Kaart>
      <div className={stijl.knoppen}>
        <Knop href="/">Terug naar start</Knop>
        <Knop href="/programma" soort="tekst">
          Naar het programma
        </Knop>
      </div>
    </Schermkader>
  );
}
