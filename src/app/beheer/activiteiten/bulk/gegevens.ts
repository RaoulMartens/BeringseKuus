// Wat de schermen voor "meerdere activiteiten aanmaken" lezen: de seizoenen die gekopieerd kunnen worden, met hun activiteiten.

import { bronUitRij, type BronActiviteit, type BronRij } from '@/lib/kopieren';
import { seizoenTitel } from '@/lib/vereniging';
import type { maakSupabase } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof maakSupabase>>;

export interface Seizoen {
  /** Het beginjaar zoals de database het kent: 2026 is Vastelaovend 2026/2027. */
  beginjaar: number;
  naam: string;
  activiteiten: BronActiviteit[];
}

/**
 * De seizoenen met activiteiten, het nieuwste eerst. Alleen activiteiten van het type seizoen (oud papier maakt het systeem zelf
 * aan) die een concept zijn of gepubliceerd; een geannuleerde activiteit gaat niet mee. De plekken per soort werk komen mee, maar
 * alleen soorten die de database mag aanmaken: de eindverantwoordelijke en de bak niet.
 */
export async function leesSeizoenen(supabase: Supabase): Promise<Seizoen[]> {
  const [rollen, rijen] = await Promise.all([
    supabase.from('roltypen').select('code, toevoegbaar, volgorde').order('volgorde'),
    supabase
      .from('activiteiten')
      .select(
        'id, naam, datum, seizoen, verzameltijd, starttijd, eindtijd, locatie, bus_vertrektijd, bus_locatie, notitie, afmeld_deadline, min_aanwezigen, rol_slots(rol_type), activiteit_groep(groep_id)',
      )
      .eq('type', 'seizoen')
      .in('status', ['concept', 'gepubliceerd'])
      .order('datum')
      .limit(1000),
  ]);
  if (rollen.error) throw new Error(`roltypen niet te lezen: ${rollen.error.code ?? rollen.error.message}`);
  if (rijen.error) throw new Error(`seizoenen niet te lezen: ${rijen.error.code ?? rijen.error.message}`);

  const toevoegbaar = new Set(rollen.data.filter((rol) => rol.toevoegbaar).map((rol) => rol.code));
  const volgorde = rollen.data.map((rol) => rol.code);

  const perSeizoen = new Map<number, BronActiviteit[]>();
  for (const rij of rijen.data) {
    const lijst = perSeizoen.get(rij.seizoen) ?? [];
    lijst.push(bronUitRij(rij as BronRij, toevoegbaar, volgorde));
    perSeizoen.set(rij.seizoen, lijst);
  }
  return [...perSeizoen.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([beginjaar, activiteiten]) => ({ beginjaar, naam: seizoenTitel(beginjaar), activiteiten }));
}
