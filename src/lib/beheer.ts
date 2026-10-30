// De toegang tot beheer, aan de serverkant. De regels staan in de database (public.beheerstatus(), Datamodel-fase-1.md
// punt 3); hier wordt alleen gevraagd wat het is en doorgestuurd naar het scherm dat erbij hoort. Een pagina of serveractie
// in beheer begint met eisBeheer(): zonder dat komt niemand erin, ook al kent hij de link. De database weigert daarna
// nog een keer (geen_admin): dit is de vriendelijke kant, dat de harde.

import { redirect } from 'next/navigation';

import { type Beheerstatus, leesBeheerstatus, routeVoorBeheerstatus } from '@/lib/mfa';
import { huidigeAuthGebruiker } from '@/lib/sessie';
import { maakSupabase } from '@/lib/supabase/server';

/** De beheerstatus van wie nu is ingelogd, of null zonder sessie. Een fout van de database is een fout, geen status. */
export async function haalBeheerstatus(): Promise<Beheerstatus | null> {
  if (!(await huidigeAuthGebruiker())) return null;

  const supabase = await maakSupabase();

  const { data, error } = await supabase.rpc('beheerstatus');
  if (error) throw new Error(`beheerstatus niet te lezen: ${error.code ?? error.message}`);
  const status = leesBeheerstatus(data);
  // Een antwoord dat we niet kennen is nooit "ok".
  if (!status) throw new Error('beheerstatus onbekend');
  return status;
}

/** Laat alleen een beheerder door; iedereen anders gaat naar het scherm dat bij zijn situatie hoort. */
export async function eisBeheer(): Promise<void> {
  const status = await haalBeheerstatus();
  if (status === null) redirect('/inloggen');
  const route = routeVoorBeheerstatus(status);
  if (route) redirect(route);
}
