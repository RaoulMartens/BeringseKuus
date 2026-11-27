'use server';

// Meerdere leden tegelijk toevoegen (UC-013 AF-7): de controle (leden_importeren met proef, schrijft niets) en het toevoegen zelf (alles of niets). De
// regels komen uit de browser (het Excel-bestand blijft daar); de database controleert elke regel opnieuw. In het log staat alleen de soort fout,
// nooit de regels (namen en adressen).

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { eisBeheer } from '@/lib/beheer';
import { vertaalLedenfout } from '@/lib/leden';
import { leesLedenControle, type LedenControle } from '@/lib/ledenimport';
import type { Json } from '@/lib/supabase/database.types';
import { maakSupabase } from '@/lib/supabase/server';

// De vorm van wat uit de browser komt; wat het betekent, beslist de database. Dit is een slot tegen rommel en een grens op de grootte.
const REGEL = z
  .object({
    regel: z.number().int().min(1).max(100_000),
    voornaam: z.string().max(300),
    achternaam: z.string().max(300),
    email: z.string().max(300),
    telefoon: z.string().max(60),
    groepen: z.array(z.uuid()).max(10),
  })
  .strict();
const REGELS = z.array(REGEL).min(1).max(200);

export interface ControleStaat {
  controle: LedenControle | null;
  melding: string | null;
}

/** De proef: wat zou er gebeuren met deze regels? Schrijft niets. */
export async function controleerLeden(regels: unknown): Promise<ControleStaat> {
  await eisBeheer();
  const gelezen = REGELS.safeParse(regels);
  if (!gelezen.success) return { controle: null, melding: vertaalLedenfout('veld_ongeldig').tekst };

  const { data, error } = await (
    await maakSupabase()
  ).rpc('leden_importeren', {
    p_regels: gelezen.data as unknown as Json,
    p_proef: true,
  });
  if (error) {
    console.error(`leden niet gecontroleerd: ${error.code ?? error.message}`);
    if (error.code === 'BK001' && error.message === 'geen_admin') redirect('/beheer');
    return { controle: null, melding: vertaalLedenfout(error.code === 'BK001' ? error.message : '').tekst };
  }
  const controle = leesLedenControle(data);
  return controle ? { controle, melding: null } : { controle: null, melding: vertaalLedenfout('').tekst };
}

export interface ToevoegStaat {
  melding: string | null;
}

/** De knop "N leden toevoegen en uitnodigen": alles of niets. Een fout laat de beheerder op het controlescherm. */
export async function voegLedenToe(_vorige: ToevoegStaat, formulier: FormData): Promise<ToevoegStaat> {
  await eisBeheer();
  let ruw: unknown;
  try {
    ruw = JSON.parse(String(formulier.get('regels')));
  } catch {
    return { melding: vertaalLedenfout('veld_ongeldig').tekst };
  }
  const gelezen = REGELS.safeParse(ruw);
  if (!gelezen.success) return { melding: vertaalLedenfout('veld_ongeldig').tekst };

  const { data, error } = await (
    await maakSupabase()
  ).rpc('leden_importeren', {
    p_regels: gelezen.data as unknown as Json,
    p_proef: false,
  });
  if (error) {
    console.error(`leden niet toegevoegd: ${error.code ?? error.message}`);
    if (error.code !== 'BK001') return { melding: vertaalLedenfout('').tekst };
    if (error.message === 'geen_admin') redirect('/beheer');
    return { melding: vertaalLedenfout(error.message).tekst };
  }
  const controle = leesLedenControle(data);
  redirect(`/beheer/leden?geimporteerd=${Math.max(controle?.toevoegen ?? gelezen.data.length, 1)}`);
}
