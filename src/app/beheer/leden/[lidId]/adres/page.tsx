import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Schermkader } from '@/components/schermkader/schermkader';
import { eisBeheer } from '@/lib/beheer';
import { maakSupabase } from '@/lib/supabase/server';

import { leesLidBeheer } from '../../gegevens';
import { Adresformulier } from './adresformulier';

export const metadata: Metadata = { title: 'E-mailadres corrigeren – Ledenplatform' };

/**
 * Het e-mailadres van een lid corrigeren (wireframe admin-lid-adres): alleen zolang het lid nooit is ingelogd. Daarna is het adres waarmee het lid
 * inlogt en wijzig je het hier niet meer (R33).
 */
export default async function AdresCorrigeren({ params }: { params: Promise<{ lidId: string }> }) {
  await eisBeheer();
  const id = z.uuid().safeParse((await params).lidId);
  if (!id.success) notFound();

  const lid = await leesLidBeheer(await maakSupabase(), id.data);
  if (!lid) notFound();
  if (!lid.actief || lid.laatstIngelogd) redirect(`/beheer/leden/${lid.lidId}`);

  return (
    <Schermkader
      actief="beheer"
      titel={`E-mailadres van ${lid.naam} corrigeren`}
      terug={{ href: `/beheer/leden/${lid.lidId}`, tekst: `Terug naar ${lid.naam}` }}
    >
      <Adresformulier lidId={lid.lidId} voornaam={lid.voornaam} huidig={lid.email} />
    </Schermkader>
  );
}
