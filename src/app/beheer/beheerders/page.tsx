import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { Statuslabel } from '@/components/statuslabel/statuslabel';
import { eisBeheer } from '@/lib/beheer';
import {
  maakBeheerdersoverzicht,
  meldingTekst,
  regelOnderNaam,
  type Beheerder,
  type BeheerderHandeling,
} from '@/lib/beheerders';
import { maakSupabase } from '@/lib/supabase/server';

import { leesBeheerderslijst, leesLidnaam } from './gegevens';
import stijl from './beheerders.module.css';

export const metadata: Metadata = { title: 'Beheerders – Ledenplatform' };

const HANDELINGEN: BeheerderHandeling[] = ['toegevoegd', 'bevestigd', 'ingetrokken'];

function Naamregel({ beheerder }: { beheerder: Beheerder }) {
  return (
    <span className={stijl.regel}>
      <strong className={stijl.naam}>
        {beheerder.naam}
        {beheerder.isIk && ' (jij)'}
      </strong>
      <span className={stijl.onder}>{regelOnderNaam(beheerder)}</span>
    </span>
  );
}

export default async function Beheerders({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await eisBeheer();
  const parameters = await searchParams;
  const supabase = await maakSupabase();

  // Na een handeling staat het lid (een id, geen naam) in de adresbalk; de naam komt uit de database.
  let melding: { vet: string; vervolg: string } | null = null;
  for (const handeling of HANDELINGEN) {
    const id = z.uuid().safeParse(parameters[handeling]);
    if (!id.success) continue;
    const naam = await leesLidnaam(supabase, id.data);
    if (naam) melding = meldingTekst(handeling, naam);
    break;
  }

  const overzicht = maakBeheerdersoverzicht(await leesBeheerderslijst(supabase));

  return (
    <Schermkader
      actief="beheer"
      titel="Beheerders"
      terug={{ href: '/beheer', tekst: 'Terug naar activiteiten' }}
      zijkolom={
        <Kaart
          titel="Nieuwe beheerder"
          ondertitel="Kies een lid. Die stelt zelf een app in; jij bevestigt daarna."
        >
          <Knop href="/beheer/beheerders/toevoegen" icoon="plus" icoonGewicht="bold" vol>
            Beheerder toevoegen
          </Knop>
        </Kaart>
      }
    >
      {melding && (
        <Melding soort="succes">
          <strong>{melding.vet}</strong> {melding.vervolg}
        </Melding>
      )}
      {overzicht.aandacht.length > 0 && (
        <Kaart titel="Vraagt aandacht" lijst>
          <Lijst>
            {overzicht.aandacht.map((b) => (
              <Lijstrij key={b.lidId} href={`/beheer/beheerders/${b.lidId}/bevestigen`}>
                <Naamregel beheerder={b} />
              </Lijstrij>
            ))}
          </Lijst>
        </Kaart>
      )}
      <Kaart titel="Beheerders" lijst>
        <Lijst>
          {overzicht.beheerders.map((b) => (
            <Lijstrij key={b.lidId}>
              <div className={stijl.rijMetActie}>
                <Naamregel beheerder={b} />
                {b.status === 'wacht_op_app' && <Statuslabel status="neutraal">wacht op app</Statuslabel>}
                {!b.isIk && (
                  <Link href={`/beheer/beheerders/${b.lidId}/intrekken`} className={stijl.actie}>
                    Rechten intrekken
                  </Link>
                )}
              </div>
            </Lijstrij>
          ))}
        </Lijst>
      </Kaart>
    </Schermkader>
  );
}
