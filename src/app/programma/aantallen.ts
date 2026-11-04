// Het aantal komende activiteiten, voor de wisselaar bovenaan het programma en bij Mijn diensten: op beide schermen hetzelfde getal.
// Het telt wat de database dit lid van het seizoen laat zien (een lid: gepubliceerde activiteiten voor zijn groepen; een beheerder
// ook concepten), precies wat het programma zelf toont. Een activiteit is komend zolang het eindmoment na nu ligt (R16).

import type { maakSupabase } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof maakSupabase>>;

export async function leesAantalKomende(supabase: Supabase, seizoen: number, nu: Date): Promise<number> {
  const { count, error } = await supabase
    .from('activiteiten')
    .select('id', { count: 'exact', head: true })
    .eq('seizoen', seizoen)
    .gt('eindigt_om', nu.toISOString());
  if (error) throw new Error(`activiteiten niet te tellen: ${error.code ?? error.message}`);
  return count ?? 0;
}
