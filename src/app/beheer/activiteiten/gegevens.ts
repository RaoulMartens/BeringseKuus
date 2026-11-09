// Wat de schermen voor aanmaken en bewerken lezen. Alles via de rechten van de database: alleen een beheerder met een code
// leest hier alle plekken, leden en groepen (Datamodel-fase-1.md punt 6). Aan de serverkant, nooit in de browser.

import { nogNodigOmTePubliceren, tijdstipVoorVeld, tijdVoorVeld } from '@/lib/activiteitformulier';
import type { ActiviteitStatus } from '@/lib/programma';
import { isActiviteitStatus } from '@/lib/programma';
import { zelfNietZichtbaarTekst } from '@/lib/publiceren';
import type { maakSupabase } from '@/lib/supabase/server';

import type { Groep } from './activiteitformulier';
import type { BestaandePlek, Eindverantwoordelijke, Rolkeuze } from './plekken';

type Supabase = Awaited<ReturnType<typeof maakSupabase>>;

/** De groepen met het aantal actieve leden per groep, en het aantal actieve leden in totaal ("Iedereen"). */
export async function leesGroepen(supabase: Supabase): Promise<{ groepen: Groep[]; aantalLeden: number }> {
  const [groepen, koppelingen, leden] = await Promise.all([
    supabase.from('groepen').select('id, naam').order('volgorde'),
    supabase
      .from('lid_groep')
      .select('groep_id, leden!inner(actief, type)')
      .eq('leden.actief', true)
      .eq('leden.type', 'lid'),
    supabase.from('leden').select('id', { count: 'exact', head: true }).eq('type', 'lid').eq('actief', true),
  ]);
  if (groepen.error) throw new Error(`groepen niet te lezen: ${groepen.error.code ?? groepen.error.message}`);
  if (koppelingen.error)
    throw new Error(`groepen niet te tellen: ${koppelingen.error.code ?? koppelingen.error.message}`);
  if (leden.error) throw new Error(`leden niet te tellen: ${leden.error.code ?? leden.error.message}`);

  const perGroep = new Map<string, number>();
  for (const koppeling of koppelingen.data) {
    perGroep.set(koppeling.groep_id, (perGroep.get(koppeling.groep_id) ?? 0) + 1);
  }
  return {
    groepen: groepen.data.map((groep) => ({
      id: groep.id,
      naam: groep.naam,
      leden: perGroep.get(groep.id) ?? 0,
    })),
    aantalLeden: leden.count ?? 0,
  };
}

/** De groepen waar dit lid in zit; een beheerder leest ook zijn eigen koppelingen (lid_groep, eigen_of_beheerder). */
export async function leesEigenGroepen(supabase: Supabase, lidId: string): Promise<string[]> {
  const { data, error } = await supabase.from('lid_groep').select('groep_id').eq('lid_id', lidId);
  if (error) throw new Error(`eigen groepen niet te lezen: ${error.code ?? error.message}`);
  return data.map((regel) => regel.groep_id);
}

/**
 * De waarschuwing als de ingelogde beheerder deze activiteit zelf niet ziet omdat hij niet in de doelgroep zit, of null.
 * Voor schermen die de doelgroep en de groepen zelf nog niet hebben gelezen (het beheeroverzicht na het publiceren).
 */
export async function leesZelfNietZichtbaar(
  supabase: Supabase,
  activiteitId: string,
  lidId: string,
): Promise<string | null> {
  const [gekozen, groepen, eigen] = await Promise.all([
    supabase.from('activiteit_groep').select('groep_id').eq('activiteit_id', activiteitId),
    supabase.from('groepen').select('id, naam'),
    leesEigenGroepen(supabase, lidId),
  ]);
  if (gekozen.error)
    throw new Error(`doelgroep niet te lezen: ${gekozen.error.code ?? gekozen.error.message}`);
  if (groepen.error) throw new Error(`groepen niet te lezen: ${groepen.error.code ?? groepen.error.message}`);
  return zelfNietZichtbaarTekst(
    gekozen.data.map((regel) => regel.groep_id),
    groepen.data,
    eigen,
  );
}

export interface ActiviteitGegevens {
  id: string;
  versie: number;
  status: ActiviteitStatus;
  naam: string;
  datum: string;
  /** De velden zoals het formulier ze toont, als tekst. */
  tekst: Record<string, string>;
  gekozenGroepen: string[];
  plekken: BestaandePlek[];
  eindverantwoordelijke: Eindverantwoordelijke;
  /** Wat er nog nodig is om te publiceren. */
  nogNodig: string[];
}

/** Een activiteit met zijn plekken, bezetters en doelgroep; leeg als hij er niet is of de beheerder hem niet mag lezen. */
export async function leesActiviteit(supabase: Supabase, id: string): Promise<ActiviteitGegevens | null> {
  const { data: a, error } = await supabase
    .from('activiteiten')
    .select(
      'id, naam, datum, verzameltijd, starttijd, eindtijd, locatie, bus_vertrektijd, bus_locatie, notitie, afmeld_deadline, min_aanwezigen, status, versie',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`activiteit niet te lezen: ${error.code ?? error.message}`);
  if (!a || !isActiviteitStatus(a.status)) return null;

  const [slots, groepen] = await Promise.all([
    supabase.from('rol_slots').select('id, rol_type, bezetter_id').eq('activiteit_id', id).order('volgorde'),
    supabase.from('activiteit_groep').select('groep_id').eq('activiteit_id', id),
  ]);
  if (slots.error) throw new Error(`plekken niet te lezen: ${slots.error.code ?? slots.error.message}`);
  if (groepen.error)
    throw new Error(`doelgroep niet te lezen: ${groepen.error.code ?? groepen.error.message}`);

  const bezetters = [...new Set(slots.data.flatMap((slot) => (slot.bezetter_id ? [slot.bezetter_id] : [])))];
  const namen = new Map<string, string>();
  const telefoons = new Map<string, string | null>();
  if (bezetters.length > 0) {
    const [leden, prive] = await Promise.all([
      supabase.from('leden').select('id, voornaam, achternaam').in('id', bezetters),
      supabase.from('leden_prive').select('lid_id, telefoon').in('lid_id', bezetters),
    ]);
    if (leden.error) throw new Error(`leden niet te lezen: ${leden.error.code ?? leden.error.message}`);
    if (prive.error) throw new Error(`telefoon niet te lezen: ${prive.error.code ?? prive.error.message}`);
    for (const lid of leden.data) namen.set(lid.id, `${lid.voornaam} ${lid.achternaam}`);
    for (const regel of prive.data) telefoons.set(regel.lid_id, regel.telefoon?.trim() || null);
  }

  const ev = slots.data.find((slot) => slot.rol_type === 'eindverantwoordelijke');
  const evNaam = ev?.bezetter_id ? (namen.get(ev.bezetter_id) ?? null) : null;
  const evTelefoon = ev?.bezetter_id ? (telefoons.get(ev.bezetter_id) ?? null) : null;

  return {
    id: a.id,
    versie: a.versie,
    status: a.status,
    naam: a.naam,
    datum: a.datum,
    tekst: {
      naam: a.naam,
      datum: a.datum,
      verzameltijd: tijdVoorVeld(a.verzameltijd),
      starttijd: tijdVoorVeld(a.starttijd),
      eindtijd: tijdVoorVeld(a.eindtijd),
      locatie: a.locatie ?? '',
      bus_vertrektijd: tijdVoorVeld(a.bus_vertrektijd),
      bus_locatie: a.bus_locatie ?? '',
      notitie: a.notitie ?? '',
      afmeld_deadline: tijdstipVoorVeld(a.afmeld_deadline),
      min_aanwezigen: a.min_aanwezigen === null ? '' : String(a.min_aanwezigen),
    },
    gekozenGroepen: groepen.data.map((groep) => groep.groep_id),
    plekken: slots.data
      .filter((slot) => slot.rol_type !== 'eindverantwoordelijke' && slot.rol_type !== 'bak')
      .map((slot) => ({
        id: slot.id,
        rol: slot.rol_type,
        bezetter: slot.bezetter_id ? (namen.get(slot.bezetter_id) ?? 'Onbekend') : null,
        bezetterId: slot.bezetter_id,
      })),
    eindverantwoordelijke: {
      slotId: ev?.id ?? null,
      bezetterId: ev?.bezetter_id ?? null,
      naam: evNaam,
      telefoon: evTelefoon,
      nieuw: false,
    },
    nogNodig: nogNodigOmTePubliceren({
      starttijd: a.starttijd,
      eindtijd: a.eindtijd,
      locatie: a.locatie,
      heeftEindverantwoordelijke: evNaam !== null,
      eindverantwoordelijkeHeeftTelefoon: evTelefoon !== null,
    }),
  };
}

/** Wie er in de keuzelijst van een plek kan staan: een actief lid of een externe helper. */
export interface Kandidaat {
  id: string;
  naam: string;
  /** Een externe helper; die kan geen eindverantwoordelijke zijn (R17). */
  extern: boolean;
  /** Is aangemerkt als geschikt voor BOB of eindverantwoordelijke: een hulp bij het kiezen, geen slot (R19). */
  magBob: boolean;
  magEindverantwoordelijke: boolean;
  telefoon: string | null;
}

/** De actieve leden en externe helpers, op voornaam. Alleen een beheerder met een code leest dit (rechten van de database). */
export async function leesKandidaten(supabase: Supabase): Promise<Kandidaat[]> {
  const [leden, prive] = await Promise.all([
    supabase
      .from('leden')
      .select('id, voornaam, achternaam, type')
      .eq('actief', true)
      .order('voornaam')
      .order('achternaam'),
    supabase.from('leden_prive').select('lid_id, mag_bob, mag_eindverantw, telefoon'),
  ]);
  if (leden.error) throw new Error(`leden niet te lezen: ${leden.error.code ?? leden.error.message}`);
  if (prive.error) throw new Error(`ledengegevens niet te lezen: ${prive.error.code ?? prive.error.message}`);
  const gegevens = new Map(prive.data.map((regel) => [regel.lid_id, regel]));
  return leden.data.map((lid) => {
    const regel = gegevens.get(lid.id);
    return {
      id: lid.id,
      naam: `${lid.voornaam} ${lid.achternaam}`,
      extern: lid.type === 'extern',
      magBob: regel?.mag_bob ?? false,
      magEindverantwoordelijke: regel?.mag_eindverantw ?? false,
      telefoon: regel?.telefoon?.trim() || null,
    };
  });
}

/** Wie zich voor deze activiteit heeft afgemeld: die staat niet in de keuzelijst (BA-1). */
export async function leesAfgemeld(supabase: Supabase, activiteitId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('afmeldingen')
    .select('lid_id')
    .eq('activiteit_id', activiteitId);
  if (error) throw new Error(`afmeldingen niet te lezen: ${error.code ?? error.message}`);
  return data.map((regel) => regel.lid_id);
}

/** De rollen die de beheerder voor een nieuwe plek kan kiezen, in de volgorde van de lijst (roltypen.toevoegbaar). */
export async function leesRollen(supabase: Supabase): Promise<Rolkeuze[]> {
  const { data, error } = await supabase
    .from('roltypen')
    .select('code, naam')
    .eq('toevoegbaar', true)
    .order('volgorde')
    .order('naam');
  if (error) throw new Error();
  return data;
}
