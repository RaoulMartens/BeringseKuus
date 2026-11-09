// De ledenlijst van de pilot in het systeem zetten (review F2-02): leden aanmaken of bijwerken met telefoonnummer, groepen en
// de aanmerkingen BOB en eindverantwoordelijke. De regels van de lijst staan in scripts/leden-invoer.ts; de procedure voor
// de bouwer staat in docs/bouw/Pilotleden.md.
//
// Eerst een proef: zonder --ja leest het script alleen en toont wat het zou doen, zonder iets te schrijven. Met --ja gaat het
// door. Lokaal (standaard) gebruikt het de Supabase op deze computer, net als `npm run lid:lokaal`. Online (--online) is
// bewust moeilijker: het vraagt de gegevens van het project uit de omgeving van de bouwer, laat het project zien, en vraagt
// om een getypte bevestiging. De sleutel komt nooit in een bestand, in de repository of in een gesprek: de bouwer zet hem
// zelf in zijn eigen terminal (`export SUPABASE_SECRET_KEY=…`) en dat script toont hem nooit.
//
// Het bestand met de echte gegevens hoort buiten de repository, of heet `*.leden.csv` (dat staat in .gitignore). Het script
// weigert een ander bestand binnen de repository.
//
// Gebruik:   npm run leden:zet -- pad/naar/lijst.leden.csv [--ja]
//            SUPABASE_URL=… SUPABASE_SECRET_KEY=… npm run leden:zet -- pad/naar/lijst.leden.csv --online [--ja]

import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../src/lib/supabase/database.types.ts';

import {
  beschrijf,
  leesLeden,
  maakPlan,
  telHergebruik,
  type Actie,
  type BestaandLid,
  type Plan,
} from './leden-invoer.ts';
import { leesLokaleSupabase } from './lokale-supabase.ts';

type Klant = SupabaseClient<Database>;

const GEBRUIK =
  'Gebruik: npm run leden:zet -- pad/naar/lijst.leden.csv [--online] [--ja]\n' +
  'Zonder --ja alleen een proef. Online: zet SUPABASE_URL en SUPABASE_SECRET_KEY in je eigen terminal (docs/bouw/Pilotleden.md).';

export interface Opdracht {
  bestand: string;
  online: boolean;
  doorvoeren: boolean;
}

/** Leest de argumenten; geeft de opdracht, of de reden waarom het niet kan. */
export function leesArgumenten(argumenten: string[]): Opdracht | { fout: string } {
  let bestand: string | null = null;
  let online = false;
  let doorvoeren = false;
  for (const argument of argumenten) {
    if (argument === '--online') online = true;
    else if (argument === '--ja') doorvoeren = true;
    else if (argument.startsWith('--') || bestand !== null) return { fout: GEBRUIK };
    else bestand = argument;
  }
  return bestand ? { bestand, online, doorvoeren } : { fout: GEBRUIK };
}

const ONLINE_URL = /^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/;

/** De gegevens van het online project uit de omgeving; alleen een supabase.co-adres, en alleen als beide er zijn. */
export function leesOnlineDoel(
  omgeving: Record<string, string | undefined>,
): { url: string; sleutel: string; project: string } | { fout: string } {
  const url = omgeving.SUPABASE_URL?.trim();
  const sleutel = omgeving.SUPABASE_SECRET_KEY?.trim();
  if (!url || !sleutel)
    return { fout: 'Online werken vraagt SUPABASE_URL en SUPABASE_SECRET_KEY in je omgeving.' };
  const gevonden = ONLINE_URL.exec(url);
  if (!gevonden?.[1]) {
    return {
      fout: 'SUPABASE_URL is geen adres van een Supabase-project (https://<project>.supabase.co); gestopt.',
    };
  }
  return { url: url.replace(/\/$/, ''), sleutel, project: gevonden[1] };
}

/**
 * Mag dit bestand gelezen worden? Binnen de repository alleen als het in .gitignore staat (`*.leden.csv`): echte gegevens
 * horen niet in de buurt van een commit.
 */
export function magBestand(bestand: string, repo: string): string | null {
  // Het echte pad: een symlink van buiten de repository naar een bestand erin telt als erin. Bestaat het bestand niet, dan het gegeven pad.
  const echt = (pad: string): string => {
    try {
      return realpathSync(pad);
    } catch {
      return path.resolve(pad);
    }
  };
  const volledig = echt(bestand);
  const relatief = path.relative(echt(repo), volledig);
  // Alleen "..", of ".." met een scheidingsteken, is een stap omhoog: een bestand dat `..pilot.csv` heet, ligt gewoon in de map (CR-13).
  const buiten = relatief === '..' || relatief.startsWith(`..${path.sep}`);
  const binnenRepo = relatief !== '' && !buiten && !path.isAbsolute(relatief);
  if (binnenRepo && !volledig.endsWith('.leden.csv')) {
    return 'Dit bestand ligt in de repository en heet niet *.leden.csv: zet de lijst buiten de repository of geef haar die naam (dan negeert git haar).';
  }
  return null;
}

/**
 * De foutcode en de melding van Supabase, zodat "onbekend" nooit het enige is wat de bouwer ziet (een foute sleutel heeft
 * geen code, alleen een melding: "Invalid API key"). Alleen de melding, niet de details of de hint: die kunnen de waarde
 * van een rij noemen (een e-mailadres bij een dubbele sleutel), en de uitvoer wordt gekopieerd en gedeeld. Een waarde uit het
 * bestand kan nog wel in de melding staan (bij een ongeldige invoer, `invalid input syntax for type …: "waarde"`): kijk dus
 * eerst naar de uitvoer voor je hem deelt.
 */
export function foutTekst(fout: { code?: string | null; message?: string | null }): string {
  const code = fout.code ?? 'onbekend';
  const melding = fout.message?.trim().slice(0, 200);
  return melding ? `${code}: ${melding}` : code;
}

// ===== Lezen wat er al staat =====

/** Het aantal rijen dat de Supabase-API per aanvraag teruggeeft (supabase/config.toml, max_rows). */
const MAX_RIJEN = 1000;

/** De groepen: naam en id. */
export async function leesGroepen(klant: Klant): Promise<Map<string, string>> {
  const { data, error } = await klant.from('groepen').select('id, naam');
  if (error) throw new Error(`groepen niet te lezen (${foutTekst(error)})`);
  return new Map(data.map((groep) => [groep.naam, groep.id]));
}

/**
 * De bestaande leden, op e-mailadres, met hun groepen en hun komende indelingen, en het aantal "halve" leden: een lid met een
 * inlogaccount maar zonder privégegevens, de toestand na een run die tussen twee schrijfacties stopte (CR-16).
 */
export async function leesBestaand(
  klant: Klant,
  groepen: Map<string, string>,
): Promise<{ leden: Map<string, BestaandLid>; halve: number }> {
  const nu = new Date().toISOString();
  const [leden, prive, koppelingen, slots, activiteitGroepen] = await Promise.all([
    klant.from('leden').select('id, auth_user_id, voornaam, achternaam, type, actief'),
    klant.from('leden_prive').select('lid_id, email, telefoon, mag_bob, mag_eindverantw, is_admin'),
    klant.from('lid_groep').select('lid_id, groep_id'),
    // Alleen de komende activiteiten: wie is ingedeeld bij iets dat al geweest is, verliest niets door een andere groep.
    klant
      .from('rol_slots')
      .select('activiteit_id, bezetter_id, activiteiten!inner(eindigt_om)')
      .not('bezetter_id', 'is', null)
      .gt('activiteiten.eindigt_om', nu),
    klant.from('activiteit_groep').select('activiteit_id, groep_id'),
  ]);
  if (leden.error) throw new Error(`leden niet te lezen (${foutTekst(leden.error)})`);
  if (prive.error) throw new Error(`ledengegevens niet te lezen (${foutTekst(prive.error)})`);
  if (koppelingen.error) throw new Error(`groepen van leden niet te lezen (${foutTekst(koppelingen.error)})`);
  if (slots.error) throw new Error(`indelingen niet te lezen (${foutTekst(slots.error)})`);
  if (activiteitGroepen.error)
    throw new Error(`doelgroepen niet te lezen (${foutTekst(activiteitGroepen.error)})`);
  // De API geeft hooguit 1000 rijen per aanvraag. Op die grens zouden we een deel van de leden niet zien en dus dubbel aanmaken.
  if (
    [leden.data, prive.data, koppelingen.data, slots.data, activiteitGroepen.data].some(
      (rijen) => rijen.length >= MAX_RIJEN,
    )
  ) {
    throw new Error('te veel gegevens om veilig te vergelijken met dit script; gestopt');
  }

  const naamPerGroep = new Map([...groepen].map(([naam, id]) => [id, naam]));
  const groepenPerActiviteit = new Map<string, string[]>();
  for (const regel of activiteitGroepen.data) {
    const naam = naamPerGroep.get(regel.groep_id);
    if (naam)
      groepenPerActiviteit.set(regel.activiteit_id, [
        ...(groepenPerActiviteit.get(regel.activiteit_id) ?? []),
        naam,
      ]);
  }
  const lidPerId = new Map(leden.data.map((lid) => [lid.id, lid]));
  const metPrive = new Set(prive.data.map((regel) => regel.lid_id));
  const halve = leden.data.filter(
    (lid) => lid.type === 'lid' && lid.auth_user_id !== null && !metPrive.has(lid.id),
  ).length;
  const uitkomst = new Map<string, BestaandLid>();
  for (const regel of prive.data) {
    const lid = lidPerId.get(regel.lid_id);
    // Een externe helper die de beheerder op een plek heeft gezet, kan geen e-mailadres hebben: die staat niet in de lijst.
    if (!lid || regel.email === null || (lid.type !== 'lid' && lid.type !== 'extern')) continue;
    uitkomst.set(regel.email, {
      lidId: lid.id,
      authUserId: lid.auth_user_id,
      voornaam: lid.voornaam,
      achternaam: lid.achternaam,
      type: lid.type,
      telefoon: regel.telefoon,
      magBob: regel.mag_bob,
      magEindverantwoordelijke: regel.mag_eindverantw,
      isAdmin: regel.is_admin,
      actief: lid.actief,
      indelingen: slots.data
        .filter((slot) => slot.bezetter_id === lid.id)
        .map((slot) => ({
          activiteitId: slot.activiteit_id,
          groepen: groepenPerActiviteit.get(slot.activiteit_id) ?? [],
        })),
      groepen: koppelingen.data
        .filter((k) => k.lid_id === lid.id)
        .flatMap((k) => {
          const naam = naamPerGroep.get(k.groep_id);
          return naam ? [naam] : [];
        }),
    });
  }
  return { leden: uitkomst, halve };
}

// ===== Uitvoeren =====

export interface Uitkomst {
  gedaan: number;
  nieuw: number;
  bijgewerkt: number;
  ongewijzigd: number;
  mislukt: { regel: number; reden: string }[];
}

/** De inlogaccounts (e-mailadres in kleine letters en id). De beheer-API kan niet rechtstreeks zoeken, dus pagina voor pagina. */
export async function leesAccounts(klant: Klant): Promise<Map<string, string>> {
  const accounts = new Map<string, string>();
  let pagina: number | null = 1;
  while (pagina !== null) {
    const { data, error } = await klant.auth.admin.listUsers({ page: pagina, perPage: 1000 });
    if (error) throw new Error(`inlogaccounts niet te lezen (${foutTekst(error)})`);
    for (const gebruiker of data.users) {
      if (gebruiker.email) accounts.set(gebruiker.email.toLowerCase(), gebruiker.id);
    }
    pagina = 'nextPage' in data && typeof data.nextPage === 'number' ? data.nextPage : null;
  }
  return accounts;
}

/** Zoekt een bestaand inlogaccount op e-mailadres. */
async function zoekAccount(klant: Klant, email: string): Promise<string | null> {
  try {
    return (await leesAccounts(klant)).get(email) ?? null;
  } catch {
    return null;
  }
}

/** Een inlogaccount voor dit adres: een nieuw, of het bestaande als het er al is. `nieuw` zegt of het script het zelf maakte. */
async function zorgVoorAccount(
  klant: Klant,
  email: string,
): Promise<{ id: string; nieuw: boolean } | { fout: string }> {
  const gemaakt = await klant.auth.admin.createUser({ email, email_confirm: true });
  if (!gemaakt.error) return { id: gemaakt.data.user.id, nieuw: true };
  if (gemaakt.error.code === 'email_exists') {
    const bestaand = await zoekAccount(klant, email);
    return bestaand
      ? { id: bestaand, nieuw: false }
      : { fout: 'inlogaccount bestaat maar is niet te vinden' };
  }
  return { fout: `inlogaccount niet te maken (${foutTekst(gemaakt.error)})` };
}

function groepIds(namen: string[], groepen: Map<string, string>): string[] {
  return namen.flatMap((naam) => {
    const id = groepen.get(naam);
    return id ? [id] : [];
  });
}

async function nieuwLid(
  klant: Klant,
  actie: Extract<Actie, { soort: 'nieuw' }>,
  groepen: Map<string, string>,
): Promise<string | null> {
  const { regel } = actie;
  let account: { id: string; nieuw: boolean } | null = null;
  if (regel.type === 'lid') {
    const uitkomst = await zorgVoorAccount(klant, regel.email);
    if ('fout' in uitkomst) return uitkomst.fout;
    account = uitkomst;
  }
  // Een lid met dit account en een ledenrij maar zonder privérij is de halve toestand van een run die tussen twee schrijfacties
  // stopte. Die maken we af in plaats van er tegenaan te lopen (de ledenrij is er al, dus een nieuwe zou botsen, CR-16). Is het
  // account van een lid met privégegevens, dan hoort het niet bij deze regel.
  let lidId: string | null = null;
  let eigenLid = true;
  if (account) {
    const aanwezig = await klant.from('leden').select('id').eq('auth_user_id', account.id).maybeSingle();
    if (aanwezig.error) {
      if (account.nieuw) await klant.auth.admin.deleteUser(account.id);
      return `lid niet te lezen (${foutTekst(aanwezig.error)})`;
    }
    if (aanwezig.data) {
      const privegegevens = await klant
        .from('leden_prive')
        .select('lid_id')
        .eq('lid_id', aanwezig.data.id)
        .maybeSingle();
      if (privegegevens.error) return `ledengegevens niet te lezen (${foutTekst(privegegevens.error)})`;
      if (privegegevens.data) return 'dit inlogaccount hoort al bij een ander lid; niets gewijzigd';
      lidId = aanwezig.data.id;
      eigenLid = false;
      const naam = await klant
        .from('leden')
        .update({ voornaam: regel.voornaam, achternaam: regel.achternaam })
        .eq('id', lidId);
      if (naam.error) return `halve toestand niet af te maken (${foutTekst(naam.error)})`;
    }
  }

  // Mislukt een stap, dan weg wat dit script net maakte: een account zonder lid is precies de halve toestand om te voorkomen.
  // Een halve toestand die we overnamen, laten we staan: een volgende run maakt hem alsnog af. Mislukt het opruimen zelf, dan zeggen we dat.
  const opruimen = async (): Promise<string> => {
    const problemen: string[] = [];
    if (eigenLid && lidId) {
      const weg = await klant.from('leden').delete().eq('id', lidId);
      if (weg.error) problemen.push('lid');
    }
    if (account?.nieuw) {
      const weg = await klant.auth.admin.deleteUser(account.id);
      if (weg.error) problemen.push('inlogaccount');
    }
    return problemen.length > 0
      ? ` Opruimen mislukt (${problemen.join(' en ')}): controleer met SQL en draai het opnieuw.`
      : '';
  };

  if (lidId === null) {
    const lid = await klant
      .from('leden')
      .insert({
        auth_user_id: account?.id ?? null,
        voornaam: regel.voornaam,
        achternaam: regel.achternaam,
        type: regel.type,
      })
      .select('id')
      .single();
    if (lid.error) {
      return `lid niet aan te maken (${foutTekst(lid.error)})${await opruimen()}`;
    }
    lidId = lid.data.id;
  }
  const prive = await klant.from('leden_prive').insert({
    lid_id: lidId,
    email: regel.email,
    telefoon: regel.telefoon,
    mag_bob: regel.magBob ?? false,
    mag_eindverantw: regel.magEindverantwoordelijke ?? false,
  });
  if (prive.error) {
    return `ledengegevens niet te zetten (${foutTekst(prive.error)})${await opruimen()}`;
  }
  const ids = groepIds(regel.groepen ?? [], groepen);
  if (ids.length > 0) {
    const gekozenLid = lidId;
    const koppeling = await klant
      .from('lid_groep')
      .insert(ids.map((groep) => ({ lid_id: gekozenLid, groep_id: groep })));
    if (koppeling.error) {
      return `groepen niet te zetten (${foutTekst(koppeling.error)})${await opruimen()}`;
    }
  }
  return null;
}

async function werkBij(
  klant: Klant,
  actie: Extract<Actie, { soort: 'bijwerken' }>,
  groepen: Map<string, string>,
): Promise<string | null> {
  const { regel, bestaand, wijzigingen } = actie;
  if (wijzigingen.includes('inlogaccount')) {
    const account = await zorgVoorAccount(klant, regel.email);
    if ('fout' in account) return account.fout;
    const koppel = await klant.from('leden').update({ auth_user_id: account.id }).eq('id', bestaand.lidId);
    if (koppel.error) {
      if (account.nieuw) await klant.auth.admin.deleteUser(account.id);
      return `inlogaccount niet te koppelen (${foutTekst(koppel.error)})`;
    }
  }
  if (wijzigingen.includes('naam')) {
    const naam = await klant
      .from('leden')
      .update({ voornaam: regel.voornaam, achternaam: regel.achternaam })
      .eq('id', bestaand.lidId);
    if (naam.error) return `naam niet te wijzigen (${foutTekst(naam.error)})`;
  }
  const prive: Database['public']['Tables']['leden_prive']['Update'] = {};
  if (wijzigingen.includes('telefoon')) prive.telefoon = regel.telefoon;
  if (wijzigingen.includes('BOB')) prive.mag_bob = regel.magBob ?? false;
  if (wijzigingen.includes('eindverantwoordelijke'))
    prive.mag_eindverantw = regel.magEindverantwoordelijke ?? false;
  if (Object.keys(prive).length > 0) {
    const gezet = await klant.from('leden_prive').update(prive).eq('lid_id', bestaand.lidId);
    if (gezet.error) return `ledengegevens niet te wijzigen (${foutTekst(gezet.error)})`;
  }
  const eraf = groepIds(actie.groepenEraf, groepen);
  if (eraf.length > 0) {
    const weg = await klant.from('lid_groep').delete().eq('lid_id', bestaand.lidId).in('groep_id', eraf);
    if (weg.error) return `groepen niet te wijzigen (${foutTekst(weg.error)})`;
  }
  const erbij = groepIds(actie.groepenErbij, groepen);
  if (erbij.length > 0) {
    const toe = await klant
      .from('lid_groep')
      .insert(erbij.map((groep) => ({ lid_id: bestaand.lidId, groep_id: groep })));
    if (toe.error) return `groepen niet te wijzigen (${foutTekst(toe.error)})`;
  }
  return null;
}

/**
 * Voert het plan uit, regel voor regel. Een regel die mislukt, stopt de rest niet; wat al klaar is, blijft staan. Het plan is
 * zo gemaakt dat opnieuw draaien veilig is: wat er al staat, verandert niet.
 */
export async function voerPlanUit(klant: Klant, plan: Plan, groepen: Map<string, string>): Promise<Uitkomst> {
  const uitkomst: Uitkomst = { gedaan: 0, nieuw: 0, bijgewerkt: 0, ongewijzigd: 0, mislukt: [] };
  for (const actie of plan.acties) {
    if (actie.soort === 'ongewijzigd') {
      uitkomst.ongewijzigd += 1;
      continue;
    }
    // Alleen de soort fout komt in de uitkomst, nooit een waarde: een melding van de database kan een adres bevatten.
    const reden =
      actie.soort === 'nieuw' ? await nieuwLid(klant, actie, groepen) : await werkBij(klant, actie, groepen);
    if (reden) {
      uitkomst.mislukt.push({ regel: actie.regel.regel, reden });
      continue;
    }
    uitkomst.gedaan += 1;
    if (actie.soort === 'nieuw') uitkomst.nieuw += 1;
    else uitkomst.bijgewerkt += 1;
  }
  return uitkomst;
}

/** Alles in één: de tekst lezen, het plan maken en (met `doorvoeren`) uitvoeren. Voor de tests en het commando. */
export async function zetLedenIn(
  klant: Klant,
  tekst: string,
  doorvoeren: boolean,
): Promise<{
  fouten: string[];
  plan: Plan | null;
  uitkomst: Uitkomst | null;
  hergebruik: number | null;
  /** Leden met een inlogaccount maar zonder privégegevens: de toestand na een onderbroken run. */
  halveLeden: number;
}> {
  const groepen = await leesGroepen(klant);
  const invoer = leesLeden(tekst, [...groepen.keys()]);
  if (invoer.fouten.length > 0) {
    return { fouten: invoer.fouten, plan: null, uitkomst: null, hergebruik: 0, halveLeden: 0 };
  }
  const bestaand = await leesBestaand(klant, groepen);
  const plan = maakPlan(invoer.regels, bestaand.leden);
  if (plan.fouten.length > 0) {
    return { fouten: plan.fouten, plan, uitkomst: null, hergebruik: 0, halveLeden: bestaand.halve };
  }
  // Een bestaand inlogaccount zonder lid wordt gekoppeld in plaats van nieuw gemaakt: de bouwer moet dat in de proef zien.
  // Dat is een extra controle: lukt het opsommen van de accounts niet, dan blokkeert dat de proef niet, maar zegt het commando dat het niet kon.
  let hergebruik: number | null = null;
  try {
    hergebruik = telHergebruik(plan.acties, new Set((await leesAccounts(klant)).keys()));
  } catch {
    hergebruik = null;
  }
  return {
    fouten: [],
    plan,
    uitkomst: doorvoeren ? await voerPlanUit(klant, plan, groepen) : null,
    hergebruik,
    halveLeden: bestaand.halve,
  };
}

// ===== Het commando =====

async function vraagBevestiging(project: string, aantal: number): Promise<boolean> {
  if (!process.stdin.isTTY) {
    console.error('leden:zet: online schrijven vraagt een getypte bevestiging; draai dit in een terminal.');
    return false;
  }
  const lees = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const antwoord = await lees.question(
      `Je schrijft ${aantal} wijziging(en) naar het online project "${project}". Typ de projectnaam ter bevestiging: `,
    );
    return antwoord.trim() === project;
  } finally {
    lees.close();
  }
}

async function uitvoeren(): Promise<number> {
  const opdracht = leesArgumenten(process.argv.slice(2));
  if ('fout' in opdracht) {
    console.error(opdracht.fout);
    return 1;
  }
  // De map van de repository volgt uit de plek van dit script, niet uit de map waar het toevallig wordt gestart.
  const weigering = magBestand(opdracht.bestand, fileURLToPath(new URL('..', import.meta.url)));
  if (weigering) {
    console.error(`leden:zet: ${weigering}`);
    return 1;
  }

  let klant: Klant;
  let project = 'lokaal';
  if (opdracht.online) {
    const doel = leesOnlineDoel(process.env);
    if ('fout' in doel) {
      console.error(`leden:zet: ${doel.fout}`);
      return 1;
    }
    project = doel.project;
    klant = createClient<Database>(doel.url, doel.sleutel, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } else {
    const lokaal = leesLokaleSupabase();
    klant = createClient<Database>(lokaal.apiUrl, lokaal.secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  console.log(
    `leden:zet: doel ${opdracht.online ? `online project "${project}"` : 'de Supabase op deze computer'}; ${opdracht.doorvoeren ? 'doorvoeren' : 'alleen een proef'}.`,
  );

  let bytes: Buffer;
  try {
    bytes = readFileSync(opdracht.bestand);
  } catch {
    console.error('leden:zet: het bestand is niet te lezen.');
    return 1;
  }
  // Streng als UTF-8 lezen: Excel bewaart "CSV" in Windows-1252, en een naam met een accent komt dan stuk in de database.
  let tekst: string;
  try {
    tekst = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    console.error('leden:zet: het bestand is niet als UTF-8 bewaard. Bewaar het in Excel als "CSV UTF-8".');
    return 1;
  }

  // Eerst een proef, ook als --ja is gegeven: het plan moet kloppen vóór er iets wordt geschreven.
  const proef = await zetLedenIn(klant, tekst, false);
  if (proef.fouten.length > 0 || !proef.plan) {
    for (const fout of proef.fouten) console.error(`leden:zet: ${fout}`);
    console.error('leden:zet: er is niets geschreven.');
    return 1;
  }
  for (const actie of proef.plan.acties) console.log(`  ${beschrijf(actie)}`);
  const teDoen = proef.plan.acties.filter((actie) => actie.soort !== 'ongewijzigd').length;
  console.log(`leden:zet: ${proef.plan.acties.length} regel(s), ${teDoen} te doen.`);
  if (proef.halveLeden > 0) {
    console.log(
      `leden:zet: let op: ${proef.halveLeden} lid/leden heeft een inlogaccount maar geen privégegevens (een eerdere run is onderbroken). Staat dat lid in deze lijst, dan wordt het afgemaakt; anders blijft het zo staan: kijk er met SQL naar.`,
    );
  }
  if (proef.hergebruik === null) {
    console.log(
      'leden:zet: let op: kon niet nagaan of er al inlogaccounts bestaan; een bestaand account wordt bij het doorvoeren zelf herkend.',
    );
  } else if (proef.hergebruik > 0) {
    console.log(
      `leden:zet: let op: ${proef.hergebruik} inlogaccount(s) bestaan al zonder lid en worden aan het lid gekoppeld.`,
    );
  }
  if (!opdracht.doorvoeren) {
    console.log('leden:zet: dit was een proef. Voeg --ja toe om door te voeren.');
    return 0;
  }
  if (teDoen === 0) return 0;
  if (opdracht.online && !(await vraagBevestiging(project, teDoen))) {
    console.error('leden:zet: niet bevestigd; er is niets geschreven.');
    return 1;
  }

  const groepen = await leesGroepen(klant);
  const uitkomst = await voerPlanUit(klant, proef.plan, groepen);
  console.log(
    `leden:zet: klaar: ${uitkomst.nieuw} nieuw, ${uitkomst.bijgewerkt} bijgewerkt, ${uitkomst.ongewijzigd} ongewijzigd, ${uitkomst.mislukt.length} mislukt.`,
  );
  for (const mislukt of uitkomst.mislukt) console.error(`  Regel ${mislukt.regel}: ${mislukt.reden}`);
  if (uitkomst.mislukt.length > 0) {
    console.error('leden:zet: draai het opnieuw na de reparatie; wat al klaar is, verandert niet.');
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await uitvoeren();
}
