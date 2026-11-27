import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Schermkader } from '@/components/schermkader/schermkader';
import { huidigeGebruiker } from '@/lib/gebruiker';
import { rolLabel } from '@/lib/rollen';
import { langeDag } from '@/lib/programma';
import { huidigeAuthGebruiker } from '@/lib/sessie';
import { maakSupabase } from '@/lib/supabase/server';

import { leesActiviteitVoorLid, leesIndelingen } from '../../../../ledenactiviteit';
import { Overnemenformulier } from './overnemenformulier';

export const metadata: Metadata = { title: 'Dienst overnemen – Ledenplatform' };

/**
 * Een dienst overnemen (bestuur): de bevestigingspagina. Het raakt een ander (die krijgt een mail), dus een eigen pagina met het werkwoord op de knop.
 * Alleen voor een bestuurslid; de database toetst alles opnieuw (dienst_overnemen).
 */
export default async function DienstOvernemen({
  params,
}: {
  params: Promise<{ id: string; lidId: string }>;
}) {
  if (!(await huidigeAuthGebruiker())) redirect('/inloggen');
  const gebruiker = await huidigeGebruiker();
  if (!gebruiker) redirect('/mijn');

  const p = await params;
  const id = z.uuid().safeParse(p.id);
  const lidId = z.uuid().safeParse(p.lidId);
  if (!id.success || !lidId.success) notFound();
  if (!gebruiker.isBeheerder) redirect(`/programma/${id.data}`);

  const supabase = await maakSupabase();
  const activiteit = await leesActiviteitVoorLid(supabase, id.data);
  if (!activiteit) notFound();
  const indeling = (await leesIndelingen(supabase, [activiteit.id], gebruiker.lidId)).get(activiteit.id);
  const plek = indeling?.plekken.find((x) => x.lidId === lidId.data);
  // Het lid staat er niet (meer) of het is jijzelf: terug naar de actuele indeling.
  if (!plek || plek.lidId === gebruiker.lidId) redirect(`/programma/${activiteit.id}`);
  const rol = rolLabel(plek.rol) ?? plek.rol;

  return (
    <Schermkader
      actief="programma"
      titel={`Dienst van ${plek.naam} overnemen?`}
      terug={{ href: `/programma/${activiteit.id}`, tekst: `Terug naar ${activiteit.naam}` }}
    >
      <Kaart titel={plek.naam}>
        <p>
          {rol} bij {activiteit.naam} ({langeDag(activiteit.datum)}). Jij staat daarna op deze plek.
        </p>
      </Kaart>
      <Overnemenformulier
        activiteitId={activiteit.id}
        lidId={plek.lidId}
        rol={plek.rol}
        naam={plek.naam}
        gepubliceerd={activiteit.status === 'gepubliceerd'}
      />
    </Schermkader>
  );
}
