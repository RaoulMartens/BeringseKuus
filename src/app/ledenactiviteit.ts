// Wat de ledenschermen (Start en een activiteit in het programma) lezen. Alles via de rechten van de database: een lid ziet
// alleen gepubliceerde activiteiten voor zijn groepen (R15, R22), alleen bezette plekken (R13) en alleen zijn eigen afmelding.
// Aan de serverkant, nooit in de browser. De uitleg wat het scherm ermee doet staat in src/lib/ledenactiviteit.ts.

import {
  telefoonBijEindverantwoordelijke,
  type BezettePlek,
  type LedenActiviteit,
} from '@/lib/ledenactiviteit';
import { isActiviteitStatus } from '@/lib/programma';
import { maakRaster, type Raster } from '@/lib/wiekomter';
import type { maakSupabase } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof maakSupabase>>;

// De view mijn_activiteiten is "wat dit lid zou zien" (DM-03); ze geeft alleen kolommen die een lid mag lezen.
const KOLOMMEN =
  'id, naam, datum, verzameltijd, starttijd, eindtijd, locatie, bus_vertrektijd, bus_locatie, notitie, status, eindigt_om';

interface Rij {
  id: string | null;
  naam: string | null;
  datum: string | null;
  verzameltijd: string | null;
  starttijd: string | null;
  eindtijd: string | null;
  locatie: string | null;
  bus_vertrektijd: string | null;
  bus_locatie: string | null;
  notitie: string | null;
  status: string | null;
  eindigt_om: string | null;
}

/**
 * De vaste vertrekplaats van de bus (verenigingsinstellingen): daar vertrekt de bus als er bij de activiteit geen andere plaats
 * staat ("Andere vertrekplaats": leeg betekent de vaste plek). Een lid leest de instellingen van zijn vereniging.
 */
async function leesVasteBusplek(supabase: Supabase): Promise<string | null> {
  const { data, error } = await supabase
    .from('verenigingsinstellingen')
    .select('bus_vertrekplaats')
    .maybeSingle();
  if (error) throw new Error(`instellingen niet te lezen: ${error.code ?? error.message}`);
  return data?.bus_vertrekplaats?.trim() || null;
}

function alsActiviteit(rij: Rij, vasteBusplek: string | null): LedenActiviteit[] {
  if (!rij.id || !rij.naam || !rij.datum || !rij.eindigt_om || !isActiviteitStatus(rij.status)) return [];
  return [
    {
      id: rij.id,
      naam: rij.naam,
      datum: rij.datum,
      verzameltijd: rij.verzameltijd,
      starttijd: rij.starttijd,
      eindtijd: rij.eindtijd,
      locatie: rij.locatie,
      busVertrektijd: rij.bus_vertrektijd,
      busLocatie: rij.bus_locatie?.trim() || vasteBusplek,
      notitie: rij.notitie,
      status: rij.status,
      eindigtOm: rij.eindigt_om,
    },
  ];
}

/** De gepubliceerde activiteiten die nog niet voorbij zijn (het eindmoment ligt na nu), voor het welkomscherm. */
export async function leesKomendeActiviteiten(supabase: Supabase, nu: Date): Promise<LedenActiviteit[]> {
  const { data, error } = await supabase
    .from('mijn_activiteiten')
    .select(KOLOMMEN)
    .eq('status', 'gepubliceerd')
    .gt('eindigt_om', nu.toISOString())
    .order('datum', { ascending: true });
  if (error) throw new Error(`activiteiten niet te lezen: ${error.code ?? error.message}`);
  const vasteBusplek = data.some((rij) => rij.bus_vertrektijd) ? await leesVasteBusplek(supabase) : null;
  return data.flatMap((rij) => alsActiviteit(rij, vasteBusplek));
}

/** Eén activiteit voor het activiteitscherm van een lid; leeg als hij er niet is of het lid hem niet mag zien. */
export async function leesActiviteitVoorLid(supabase: Supabase, id: string): Promise<LedenActiviteit | null> {
  const { data, error } = await supabase
    .from('mijn_activiteiten')
    .select(KOLOMMEN)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`activiteit niet te lezen: ${error.code ?? error.message}`);
  if (!data) return null;
  const vasteBusplek = data.bus_vertrektijd ? await leesVasteBusplek(supabase) : null;
  return alsActiviteit(data, vasteBusplek)[0] ?? null;
}

/** Wat bij een activiteit hoort: wie op de plekken staat, of dit lid is afgemeld en het nummer van de eindverantwoordelijke. */
export interface Indeling {
  plekken: BezettePlek[];
  afgemeld: boolean;
  telefoon: string | null;
}

/**
 * De indeling van de gegeven activiteiten. Een lid leest alleen bezette plekken (R13) en alleen zijn eigen afmelding; het
 * telefoonnummer van de eindverantwoordelijke komt uit contact_eindverantwoordelijke, de enige route naar een nummer van
 * een ander lid (R10).
 */
export async function leesIndelingen(
  supabase: Supabase,
  activiteitIds: string[],
  eigenLidId: string,
): Promise<Map<string, Indeling>> {
  const uitkomst = new Map<string, Indeling>(
    activiteitIds.map((id) => [id, { plekken: [], afgemeld: false, telefoon: null }]),
  );
  if (activiteitIds.length === 0) return uitkomst;

  const [slots, afmeldingen, contacten] = await Promise.all([
    supabase
      .from('rol_slots')
      .select('activiteit_id, rol_type, bezetter_id')
      .in('activiteit_id', activiteitIds)
      .not('bezetter_id', 'is', null)
      .order('volgorde'),
    // Een beheerder leest alle afmeldingen: daarom met het eigen lid-id, ook al ziet een gewoon lid er maar een.
    supabase
      .from('afmeldingen')
      .select('activiteit_id')
      .in('activiteit_id', activiteitIds)
      .eq('lid_id', eigenLidId),
    Promise.all(
      activiteitIds.map(async (id) => {
        const { data, error } = await supabase.rpc('contact_eindverantwoordelijke', { p_activiteit: id });
        if (error) throw new Error(`contact niet te lezen: ${error.code ?? error.message}`);
        const regel = data[0];
        return {
          id,
          contact: regel?.telefoon
            ? { naam: `${regel.voornaam} ${regel.achternaam}`, telefoon: regel.telefoon }
            : null,
        };
      }),
    ),
  ]);
  if (slots.error) throw new Error(`plekken niet te lezen: ${slots.error.code ?? slots.error.message}`);
  if (afmeldingen.error)
    throw new Error(`afmelding niet te lezen: ${afmeldingen.error.code ?? afmeldingen.error.message}`);

  const bezetters = [...new Set(slots.data.flatMap((slot) => (slot.bezetter_id ? [slot.bezetter_id] : [])))];
  const namen = new Map<string, string>();
  if (bezetters.length > 0) {
    const { data: leden, error } = await supabase
      .from('leden')
      .select('id, voornaam, achternaam')
      .in('id', bezetters);
    if (error) throw new Error(`leden niet te lezen: ${error.code ?? error.message}`);
    for (const lid of leden) namen.set(lid.id, `${lid.voornaam} ${lid.achternaam}`);
  }

  for (const slot of slots.data) {
    const indeling = uitkomst.get(slot.activiteit_id);
    const naam = slot.bezetter_id ? namen.get(slot.bezetter_id) : undefined;
    if (indeling && slot.bezetter_id && naam) {
      indeling.plekken.push({ rol: slot.rol_type, lidId: slot.bezetter_id, naam });
    }
  }
  for (const regel of afmeldingen.data) {
    const indeling = uitkomst.get(regel.activiteit_id);
    if (indeling) indeling.afgemeld = true;
  }
  // Plekken en contact komen uit twee aanvragen: wisselt het bestuur daartussen de eindverantwoordelijke, dan hoort het nummer
  // niet bij de naam op het scherm. Het nummer staat er alleen als beide aanvragen over dezelfde persoon gaan.
  for (const { id, contact } of contacten) {
    const indeling = uitkomst.get(id);
    if (indeling) indeling.telefoon = telefoonBijEindverantwoordelijke(indeling.plekken, contact);
  }
  return uitkomst;
}

/**
 * Wie komt er (UC-010): per activiteit het raster van alle leden voor wie hij is, met wie is afgemeld. Via wie_komt_er(), de enige
 * route naar de afmeldingen van anderen: de functie geeft naam en komt ja/nee, nooit een reden. Een activiteit die het lid niet
 * mag zien geeft een leeg raster.
 */
export async function leesWieKomtEr(
  supabase: Supabase,
  activiteitIds: string[],
  eigenLidId: string,
): Promise<Map<string, Raster>> {
  const regels = await Promise.all(
    activiteitIds.map(async (id) => {
      const { data, error } = await supabase.rpc('wie_komt_er', { p_activiteit_id: id });
      if (error) throw new Error();
      return [id, maakRaster(data, eigenLidId)] as const;
    }),
  );
  return new Map(regels);
}
