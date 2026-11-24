'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { huidigeAuthGebruiker } from '@/lib/sessie';
import { maakSupabase } from '@/lib/supabase/server';
import { normaliseerTelefoon, TELEFOON_HULP } from '@/lib/telefoon';

export interface TelefoonStaat {
  /** Wat in het veld staat: het getypte nummer, of het opgeslagen nummer. */
  nummer: string;
  /** Het nummer dat nu is opgeslagen (leeg als er nog geen is): dat zie je in de leesweergave, ook na een fout bij het wijzigen. */
  bewaard: string;
  fout: string | null;
  opgeslagen: boolean;
}

export async function logUit(): Promise<void> {
  const supabase = await maakSupabase();
  // Alleen op dit apparaat: wie op de laptop uitlogt, blijft op de telefoon ingelogd.
  await supabase.auth.signOut({ scope: 'local' });
  // Daarna alle sessiecookies weg, ook als signOut faalt of er nog een stuk (.0, .1) is blijven staan
  // (review PR10-01).
  const winkel = await cookies();
  for (const { name } of winkel.getAll()) {
    if (name.startsWith('sb-')) winkel.delete({ name, path: '/' });
  }
  redirect('/inloggen?uitgelogd=1');
}

/** Een lid zet zijn eigen telefoonnummer. De database zet alleen het nummer van het aanroepende lid en controleert hetzelfde. */
export async function zetTelefoon(vorige: TelefoonStaat, formulier: FormData): Promise<TelefoonStaat> {
  if (!(await huidigeAuthGebruiker())) redirect('/inloggen');
  const invoer = formulier.get('telefoon');
  const getypt = typeof invoer === 'string' ? invoer : '';
  const nummer = normaliseerTelefoon(getypt);
  if (nummer === null)
    return {
      nummer: getypt,
      bewaard: vorige.bewaard,
      fout: `Dit nummer klopt niet. ${TELEFOON_HULP}`,
      opgeslagen: false,
    };

  const supabase = await maakSupabase();
  const { error } = await supabase.rpc('zet_eigen_telefoon', { p_telefoon: nummer });
  if (error) {
    // Alleen de foutsoort in het log, nooit het nummer (bouwgids 14.4).
    console.error(
      `telefoonnummer niet opgeslagen: ${error.code === 'BK001' ? error.message : (error.code ?? 'onbekend')}`,
    );
    const ongeldig = error.code === 'BK001' && error.message === 'telefoon_ongeldig';
    return {
      nummer: getypt,
      bewaard: vorige.bewaard,
      fout: ongeldig
        ? `Dit nummer klopt niet. ${TELEFOON_HULP}`
        : 'Het opslaan lukte niet. Probeer het nog eens; blijft het misgaan, laat het het bestuur weten.',
      opgeslagen: false,
    };
  }
  revalidatePath('/mijn');
  return { nummer, bewaard: nummer, fout: null, opgeslagen: true };
}
