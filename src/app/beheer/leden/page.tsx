import type { Metadata } from 'next';
import { z } from 'zod';

import { Kaart } from '@/components/kaart/kaart';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { Melding } from '@/components/melding/melding';
import { Schermkader } from '@/components/schermkader/schermkader';
import { Tellers } from '@/components/tellers/tellers';
import { eisBeheer } from '@/lib/beheer';
import {
  aandachtRegel,
  groepenRegel,
  ledenMelding,
  maakLedenoverzicht,
  type LedenHandeling,
} from '@/lib/leden';
import { maakSupabase } from '@/lib/supabase/server';

import { leesLedenlijst } from './gegevens';
import { Ledenzoeker } from './ledenzoeker';
import stijl from './leden.module.css';

export const metadata: Metadata = { title: 'Leden – Ledenplatform' };

const HANDELINGEN: LedenHandeling[] = ['inactief', 'actief', 'opgeslagen'];

export default async function Leden({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await eisBeheer();
  const parameters = await searchParams;
  const supabase = await maakSupabase();
  const leden = await leesLedenlijst(supabase);
  const overzicht = maakLedenoverzicht(leden);

  // Na een handeling staat het lid (een id, geen naam) in de adresbalk; de naam komt uit de database.
  let melding: { vet: string; vervolg: string } | null = null;
  for (const handeling of HANDELINGEN) {
    const id = z.uuid().safeParse(parameters[handeling]);
    if (!id.success) continue;
    const lid = leden.find((l) => l.lidId === id.data);
    if (lid) {
      const open = z.coerce.number().int().min(0).max(999).catch(0).parse(parameters.open);
      melding = ledenMelding(handeling, lid.naam, open);
    }
    break;
  }

  return (
    <Schermkader
      actief="beheer"
      titel="Leden"
      terug={{ href: '/beheer', tekst: 'Terug naar activiteiten' }}
      zijkolom={
        <>
          <Kaart titel="Tonen" label>
            <Tellers
              inKaart
              naam="Leden tonen"
              tellers={[
                { href: '/beheer/leden', aantal: overzicht.actief.length, label: 'actief', actief: true },
                {
                  href: '/beheer/leden/inactief',
                  aantal: overzicht.inactief.length,
                  label: 'inactief',
                  actief: false,
                },
              ]}
            />
          </Kaart>
          <Kaart titel="Nieuw lid" label>
            <p className={stijl.hulp}>Nieuwe leden voegt de bouwer nog toe. Dat kan binnenkort ook hier.</p>
          </Kaart>
        </>
      }
    >
      {melding && (
        <Melding soort="succes">
          <strong>{melding.vet}</strong> {melding.vervolg}
        </Melding>
      )}
      {overzicht.aandacht.length > 0 && (
        <Kaart titel="Vraagt aandacht" label lijst>
          <Lijst>
            {overzicht.aandacht.map((lid) => (
              <Lijstrij key={lid.lidId} href={`/beheer/leden/${lid.lidId}`}>
                <span className={stijl.tekst}>
                  <strong className={stijl.naam}>{lid.naam}</strong>
                  <span className={stijl.onder}>{aandachtRegel(lid)}</span>
                </span>
              </Lijstrij>
            ))}
          </Lijst>
        </Kaart>
      )}
      <Ledenzoeker
        titel="Leden"
        leden={overzicht.actief.map((lid) => ({
          lidId: lid.lidId,
          voornaam: lid.voornaam,
          achternaam: lid.achternaam,
          naam: lid.naam,
          onder: groepenRegel(lid),
          href: `/beheer/leden/${lid.lidId}`,
        }))}
      />
    </Schermkader>
  );
}
