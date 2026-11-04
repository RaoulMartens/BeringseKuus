// Wat elke pagina van het overdragen eerst nodig heeft: wie is ingelogd, welke activiteit, en wat is zijn dienst. Zonder sessie naar
// het inloggen, zonder lid naar Mijn account, en een activiteit die het lid niet mag zien bestaat niet (R15, R22).

import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { huidigeGebruiker } from '@/lib/gebruiker';
import { isRuilbaar } from '@/lib/ruilen';
import { huidigeAuthGebruiker } from '@/lib/sessie';
import { maakSupabase } from '@/lib/supabase/server';

import { leesAfmeldActiviteit, type AfmeldActiviteit } from '../afmelden/gegevens';

import { leesDienstVan, type Dienst } from './gegevens';

type Supabase = Awaited<ReturnType<typeof maakSupabase>>;

export interface LidContext {
  supabase: Supabase;
  gebruiker: NonNullable<Awaited<ReturnType<typeof huidigeGebruiker>>>;
  activiteit: AfmeldActiviteit;
}

export async function laadLid(params: Promise<{ id: string }>): Promise<LidContext> {
  if (!(await huidigeAuthGebruiker())) redirect('/inloggen');
  const gebruiker = await huidigeGebruiker();
  if (!gebruiker) redirect('/mijn');

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const supabase = await maakSupabase();
  const activiteit = await leesAfmeldActiviteit(supabase, id.data);
  if (!activiteit) notFound();
  return { supabase, gebruiker, activiteit };
}

export interface OverdrachtContext extends LidContext {
  dienst: Dienst | null;
  /** Waarom overdragen hier niet kan, of niets als het kan. */
  kanNiet: string | null;
}

/** De context voor een pagina waar je je dienst overdraagt: met je eigen dienst en of het kan (R4, R15, R16). */
export async function laadOverdracht(params: Promise<{ id: string }>): Promise<OverdrachtContext> {
  const lid = await laadLid(params);
  const dienst = await leesDienstVan(lid.supabase, lid.activiteit.id, lid.gebruiker.lidId);
  const open =
    lid.activiteit.status === 'gepubliceerd' && new Date(lid.activiteit.eindigtOm).getTime() > Date.now();

  let kanNiet: string | null = null;
  if (!open)
    kanNiet = 'Deze activiteit is al geweest of niet meer open; je dienst kun je niet meer overdragen.';
  else if (!dienst) kanNiet = 'Je hebt bij deze activiteit geen dienst om over te dragen.';
  else if (!isRuilbaar(dienst.rol))
    kanNiet =
      'Deze dienst kun je niet zelf overdragen. Alleen het bestuur wijzigt die; neem contact op met de eindverantwoordelijke.';
  return { ...lid, dienst, kanNiet };
}
