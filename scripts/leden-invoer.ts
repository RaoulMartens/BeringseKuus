// De ledenlijst voor de pilot (review F2-02): een CSV uit Excel wordt gecontroleerd en vergeleken met wat er al in het
// systeem staat. Alles hier is zuivere logica zonder database en zonder bestand, zodat de regels met tests vast te leggen
// zijn. Het script scripts/zet-leden.ts leest het bestand, haalt de bestaande leden op en voert het plan uit.
//
// Wat een regel kan zetten: wie het is (voornaam, achternaam, e-mailadres), het telefoonnummer, de groepen, en of iemand
// BOB of eindverantwoordelijke kan zijn (de aanmerkingen, R19). Wat niet kan, met reden:
//  - beheerder maken: dat gaat met de procedure uit docs/bouw/Beheerders.md (een app instellen, controleren, bevestigen);
//  - een lid inactief zetten of een nummer wissen: dat is geen pilotwerk en het kan een gepubliceerde activiteit stukmaken;
//  - een lijst "vervangen": een lege cel betekent "niet wijzigen", nooit "wissen".
//
// Persoonsgegevens: foutmeldingen noemen het regelnummer en de kolom, nooit de waarde.

export interface LidRegel {
  /** Het regelnummer in het bestand (de kopregel is 1), voor de meldingen. */
  regel: number;
  voornaam: string;
  achternaam: string;
  /** Kleine letters, zoals de database eist. */
  email: string;
  type: 'lid' | 'extern';
  /** Leeg als de cel leeg was: dan niet wijzigen. */
  telefoon: string | null;
  /** Namen zoals in het bestand; `null` als de cel leeg was (niet wijzigen). */
  groepen: string[] | null;
  magBob: boolean | null;
  magEindverantwoordelijke: boolean | null;
}

export interface Invoer {
  regels: LidRegel[];
  fouten: string[];
}

const KOLOMMEN: Record<string, string> = {
  voornaam: 'voornaam',
  achternaam: 'achternaam',
  email: 'email',
  'e-mail': 'email',
  'e-mailadres': 'email',
  telefoon: 'telefoon',
  mobiel: 'telefoon',
  groepen: 'groepen',
  groep: 'groepen',
  bob: 'bob',
  eindverantwoordelijke: 'eindverantwoordelijke',
  type: 'type',
};

// Als code points, niet als tekens in de bron: een onzichtbaar teken in een bestand is zelf een risico.
const BOM = String.fromCodePoint(0xfeff);
const ONLEESBAAR = String.fromCodePoint(0xfffd);

const VERPLICHT = ['voornaam', 'achternaam', 'email'];
const MAX_REGELS = 500;
const MAX_NAAM = 100;

export interface CsvRij {
  cellen: string[];
  /** Het regelnummer in het bestand waar de rij begint (de eerste regel is 1), ook na lege regels en cellen over meer regels. */
  regel: number;
}

/**
 * Splitst CSV-tekst in rijen van cellen: aanhalingstekens, een scheidingsteken of regeleinde binnen een cel, en "" als een
 * aanhalingsteken. Lege rijen (Excel schrijft `;;;;`) worden overgeslagen, maar tellen wel mee voor het regelnummer.
 */
export function leesCsvRegels(tekst: string, scheiding: string): CsvRij[] {
  const rijen: CsvRij[] = [];
  let rij: string[] = [];
  let cel = '';
  let tussen = false;
  let lijn = 1;
  let begin = 1;
  const klaarMetRij = () => {
    rij.push(cel);
    cel = '';
    if (rij.some((waarde) => waarde.trim() !== '')) rijen.push({ cellen: rij, regel: begin });
    rij = [];
    begin = lijn;
  };
  for (let i = 0; i < tekst.length; i += 1) {
    const teken = tekst.charAt(i);
    const volgende = tekst.charAt(i + 1);
    if (tussen) {
      if (teken === '"' && volgende === '"') {
        cel += '"';
        i += 1;
      } else if (teken === '"') {
        tussen = false;
      } else {
        if (teken === '\n' || (teken === '\r' && volgende !== '\n')) lijn += 1;
        cel += teken;
      }
    } else if (teken === '"' && cel === '') {
      tussen = true;
    } else if (teken === scheiding) {
      rij.push(cel);
      cel = '';
    } else if (teken === '\n' || teken === '\r') {
      if (teken === '\r' && volgende === '\n') i += 1;
      lijn += 1;
      klaarMetRij();
    } else {
      cel += teken;
    }
  }
  if (cel !== '' || rij.length > 0) klaarMetRij();
  return rijen;
}

/** Splitst CSV-tekst in rijen van cellen, zonder de regelnummers (zie leesCsvRegels). */
export function leesCsv(tekst: string, scheiding: string): string[][] {
  return leesCsvRegels(tekst, scheiding).map((rij) => rij.cellen);
}

/** Excel in een Nederlandse instelling bewaart met een puntkomma; anders is het een komma. De kopregel beslist. */
export function kiesScheiding(kopregel: string): string {
  return kopregel.split(';').length >= kopregel.split(',').length ? ';' : ',';
}

/**
 * Een telefoonnummer, dat alle leden te zien krijgen (R10): cijfers met eventueel spaties en streepjes, beginnend met een 0
 * (een Excel-nummer zonder voorloopnul valt dus af) of een plus; 9 tot 15 cijfers en hooguit 20 tekens. Spaties worden één spatie.
 */
export function normaliseerTelefoon(waarde: string): string | null {
  const schoon = waarde.trim().replace(/\s+/g, ' ');
  if (schoon.length > 20 || !/^[0+][\d -]*$/.test(schoon)) return null;
  const cijfers = schoon.replace(/\D/g, '');
  if (cijfers.length < 9 || cijfers.length > 15) return null;
  // Een gewoon Nederlands mobiel nummer zonder spaties ("0612345678") krijgt de vorm van de rest van de lijst.
  const zonder = schoon.replace(/ /g, '');
  if (/^06\d{8}$/.test(zonder))
    return `${zonder.slice(0, 2)} ${zonder.slice(2, 4)} ${zonder.slice(4, 6)} ${zonder.slice(6, 8)} ${zonder.slice(8)}`;
  return schoon;
}

/** "ja", "nee" en wat Excel er nog meer van maakt; een lege cel is `null` (niet wijzigen). */
export function leesJaNee(waarde: string): boolean | null | 'onbekend' {
  const w = waarde.trim().toLowerCase();
  if (w === '') return null;
  if (['ja', 'j', 'x', '1', 'true', 'waar'].includes(w)) return true;
  if (['nee', 'n', '0', 'false', 'onwaar'].includes(w)) return false;
  return 'onbekend';
}

/** Een e-mailadres dat zowel de database als het inlogsysteem accepteert: geen spaties, controletekens, `..` of punt aan een rand. */
export function geldigEmail(email: string): boolean {
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  if (/[\p{Cc}\p{Cf}]/u.test(email) || email.includes('..')) return false;
  const [naam = '', domein = ''] = email.split('@');
  return !naam.startsWith('.') && !naam.endsWith('.') && !domein.startsWith('.') && !domein.endsWith('.');
}

/** Leest en controleert een ledenlijst; elke regel die niet klopt, geeft een melding. Er wordt niets gekozen voor wie het fout doet. */
export function leesLeden(tekst: string, bekendeGroepen: string[]): Invoer {
  const fouten: string[] = [];
  const schoon = tekst.startsWith(BOM) ? tekst.slice(1) : tekst;
  // Excel bewaart "CSV" (zonder UTF-8) in Windows-1252: een é wordt dan een teken dat geen UTF-8 is. Zo'n naam zou fout in de database komen.
  if (schoon.includes(ONLEESBAAR)) {
    return {
      regels: [],
      fouten: [
        'Het bestand is niet als UTF-8 bewaard (er staan onleesbare tekens in). Bewaar het in Excel als "CSV UTF-8".',
      ],
    };
  }
  const kopregel = schoon.split(/\r?\n/, 1)[0] ?? '';
  const rijen = leesCsvRegels(schoon, kiesScheiding(kopregel));
  const [kopRij, ...gegevens] = rijen;
  if (!kopRij) return { regels: [], fouten: ['Het bestand is leeg.'] };
  const kop = kopRij.cellen;

  const kolommen = kop.map((naam) => KOLOMMEN[naam.trim().toLowerCase()] ?? null);
  // De inhoud van een onbekende kolom noemen we niet: bij een bestand zonder kopregel zijn dat namen en adressen.
  kop.forEach((_naam, index) => {
    if (kolommen[index] === null) fouten.push(`Kolom ${index + 1} van de kopregel is onbekend.`);
  });
  const dubbel = kolommen.filter((naam, index) => naam !== null && kolommen.indexOf(naam) !== index);
  for (const naam of new Set(dubbel)) fouten.push(`De kolom ${naam} staat er twee keer in.`);
  for (const nodig of VERPLICHT) {
    if (!kolommen.includes(nodig)) fouten.push(`De kolom ${nodig} ontbreekt.`);
  }
  if (fouten.length > 0) return { regels: [], fouten };
  if (gegevens.length === 0)
    return { regels: [], fouten: ['Het bestand heeft geen leden, alleen een kopregel.'] };
  if (gegevens.length > MAX_REGELS) {
    return {
      regels: [],
      fouten: [`Het bestand heeft ${gegevens.length} regels; het maximum is ${MAX_REGELS}.`],
    };
  }

  const groepPerNaam = new Map(bekendeGroepen.map((naam) => [naam.toLowerCase(), naam]));
  const gezien = new Map<string, number>();
  const regels: LidRegel[] = [];

  gegevens.forEach(({ cellen, regel }) => {
    const veld = (naam: string): string => {
      const index = kolommen.indexOf(naam);
      return index === -1 ? '' : (cellen[index] ?? '').trim();
    };
    const fout = (tekst: string) => fouten.push(`Regel ${regel}: ${tekst}`);

    const voornaam = veld('voornaam');
    const achternaam = veld('achternaam');
    if (voornaam === '') fout('de voornaam ontbreekt.');
    if (achternaam === '') fout('de achternaam ontbreekt.');
    if (voornaam.length > MAX_NAAM || achternaam.length > MAX_NAAM)
      fout(`een naam is langer dan ${MAX_NAAM} tekens.`);
    if (/[\p{Cc}\p{Cf}]/u.test(voornaam) || /[\p{Cc}\p{Cf}]/u.test(achternaam))
      fout('een naam bevat een onzichtbaar teken.');

    const email = veld('email').toLowerCase();
    if (!geldigEmail(email)) fout('het e-mailadres klopt niet.');
    else if (gezien.has(email)) fout(`dit e-mailadres staat ook op regel ${gezien.get(email)}.`);
    else gezien.set(email, regel);

    const typeTekst = veld('type').toLowerCase();
    if (typeTekst !== '' && typeTekst !== 'lid' && typeTekst !== 'extern')
      fout('het type is niet lid of extern.');
    const type = typeTekst === 'extern' ? 'extern' : 'lid';

    const telefoonTekst = veld('telefoon');
    const telefoon = telefoonTekst === '' ? null : normaliseerTelefoon(telefoonTekst);
    if (telefoonTekst !== '' && telefoon === null) fout('het telefoonnummer klopt niet.');

    const groepenTekst = veld('groepen');
    let groepen: string[] | null = null;
    if (groepenTekst !== '') {
      groepen = [];
      const delen = groepenTekst
        .split('|')
        .map((g) => g.trim())
        .filter((g) => g !== '');
      // Een cel met alleen scheidingstekens is geen lijst: dat zou stil alle groepen van het lid weghalen.
      if (delen.length === 0) fout('bij groepen staat geen groep. Laat de cel leeg om niets te wijzigen.');
      // De ingevulde waarde noemen we niet: een verschoven kolom zou er een naam of nummer in zetten.
      delen.forEach((deel, plaats) => {
        const bekend = groepPerNaam.get(deel.toLowerCase());
        if (!bekend)
          fout(`de groep op plaats ${plaats + 1} bestaat niet. Bekend: ${bekendeGroepen.join(', ')}.`);
        else if (!groepen?.includes(bekend)) groepen?.push(bekend);
      });
    }

    const bob = leesJaNee(veld('bob'));
    const eindverantwoordelijke = leesJaNee(veld('eindverantwoordelijke'));
    if (bob === 'onbekend') fout('bij BOB staat geen ja of nee.');
    if (eindverantwoordelijke === 'onbekend') fout('bij eindverantwoordelijke staat geen ja of nee.');

    // Een externe helper logt niet in, hoort bij geen groep en kan geen BOB of eindverantwoordelijke zijn (R17).
    if (type === 'extern') {
      if (groepen && groepen.length > 0) fout('een externe helper kan niet bij een groep horen.');
      if (bob === true || eindverantwoordelijke === true)
        fout('een externe helper kan geen BOB of eindverantwoordelijke zijn.');
    }

    regels.push({
      regel,
      voornaam,
      achternaam,
      email,
      type,
      telefoon,
      groepen,
      magBob: bob === 'onbekend' ? null : bob,
      magEindverantwoordelijke: eindverantwoordelijke === 'onbekend' ? null : eindverantwoordelijke,
    });
  });

  return fouten.length > 0 ? { regels: [], fouten } : { regels, fouten: [] };
}

// ===== Het plan =====

/** Wat er al in het systeem staat bij een e-mailadres. */
export interface BestaandLid {
  lidId: string;
  authUserId: string | null;
  voornaam: string;
  achternaam: string;
  type: 'lid' | 'extern';
  telefoon: string | null;
  magBob: boolean;
  magEindverantwoordelijke: boolean;
  /** De namen van de groepen waar het lid nu bij hoort. */
  groepen: string[];
  /** Een beheerder (is_admin): het script wijzigt dat nooit, maar toont het in de proef. */
  isAdmin: boolean;
  /** Een inactief lid kan niets lezen; het script activeert niemand en laat zo'n lid dus met rust. */
  actief: boolean;
  /**
   * De komende activiteiten waar dit lid is ingedeeld, met de namen van de groepen waar de activiteit voor is (leeg = voor
   * iedereen). Een lid dat uit zo'n groep gaat, ziet zijn eigen dienst niet meer (R22, CR-04).
   */
  indelingen: { activiteitId: string; groepen: string[] }[];
}

export type Actie =
  | { soort: 'nieuw'; regel: LidRegel }
  | {
      soort: 'bijwerken';
      regel: LidRegel;
      bestaand: BestaandLid;
      wijzigingen: string[];
      groepenErbij: string[];
      groepenEraf: string[];
    }
  | { soort: 'ongewijzigd'; regel: LidRegel };

export interface Plan {
  acties: Actie[];
  /** Regels die niet kunnen, met de reden. */
  fouten: string[];
}

/** Vergelijkt de lijst met wat er staat. Een lege cel wijzigt niets; groepen in de cel zijn de volledige lijst voor dat lid. */
export function maakPlan(regels: LidRegel[], bestaand: Map<string, BestaandLid>): Plan {
  const acties: Actie[] = [];
  const fouten: string[] = [];
  for (const regel of regels) {
    const staat = bestaand.get(regel.email);
    if (!staat) {
      acties.push({ soort: 'nieuw', regel });
      continue;
    }
    if (staat.type !== regel.type) {
      fouten.push(
        `Regel ${regel.regel}: dit lid bestaat al als ${staat.type}; het type wijzigen kan niet met dit script.`,
      );
      continue;
    }
    if (!staat.actief) {
      fouten.push(
        `Regel ${regel.regel}: dit lid is inactief; activeren kan niet met dit script. Haal de regel uit de lijst.`,
      );
      continue;
    }
    // Een groepswijziging mag niemand zijn eigen dienst laten kwijtraken: de toewijzing blijft bestaan, maar de activiteit is dan
    // voor hem onzichtbaar. De bouwer haalt hem eerst uit die indeling (of laat de groepen zoals ze zijn).
    if (regel.groepen !== null) {
      const nieuw = regel.groepen;
      // Alleen wat hij nu wél ziet en straks niet meer: een activiteit die hij al niet zag, kan hij niet kwijtraken (FX-08).
      const verloren = staat.indelingen.filter(
        (indeling) =>
          indeling.groepen.length > 0 &&
          indeling.groepen.some((groep) => staat.groepen.includes(groep)) &&
          !indeling.groepen.some((groep) => nieuw.includes(groep)),
      ).length;
      if (verloren > 0) {
        fouten.push(
          `Regel ${regel.regel}: met deze groepen ziet dit lid ${verloren} ${verloren === 1 ? 'activiteit' : 'activiteiten'} niet meer waar hij is ingedeeld. Haal hem eerst uit die indeling, of laat de groepen zoals ze zijn.`,
        );
        continue;
      }
    }
    const wijzigingen: string[] = [];
    // Een lid dat met SQL is aangemaakt, kan nog zonder inlogaccount zijn: dan kan hij niet inloggen (docs/bouw/Inloggen.md).
    if (staat.type === 'lid' && staat.authUserId === null) wijzigingen.push('inlogaccount');
    if (staat.voornaam !== regel.voornaam || staat.achternaam !== regel.achternaam) wijzigingen.push('naam');
    if (regel.telefoon !== null && regel.telefoon !== staat.telefoon) wijzigingen.push('telefoon');
    if (regel.magBob !== null && regel.magBob !== staat.magBob) wijzigingen.push('BOB');
    if (
      regel.magEindverantwoordelijke !== null &&
      regel.magEindverantwoordelijke !== staat.magEindverantwoordelijke
    ) {
      wijzigingen.push('eindverantwoordelijke');
    }
    const gewenst = regel.groepen;
    const groepenErbij = gewenst ? gewenst.filter((g) => !staat.groepen.includes(g)) : [];
    const groepenEraf = gewenst ? staat.groepen.filter((g) => !gewenst.includes(g)) : [];
    if (groepenErbij.length > 0 || groepenEraf.length > 0) wijzigingen.push('groepen');
    acties.push(
      wijzigingen.length === 0
        ? { soort: 'ongewijzigd', regel }
        : { soort: 'bijwerken', regel, bestaand: staat, wijzigingen, groepenErbij, groepenEraf },
    );
  }
  return { acties, fouten };
}

/** Hoeveel regels een inlogaccount krijgen dat al bestaat (zonder lid): die worden gekoppeld in plaats van nieuw gemaakt. */
export function telHergebruik(acties: Actie[], accounts: Set<string>): number {
  return acties.filter(
    (actie) =>
      accounts.has(actie.regel.email) &&
      actie.regel.type === 'lid' &&
      (actie.soort === 'nieuw' ||
        (actie.soort === 'bijwerken' && actie.wijzigingen.includes('inlogaccount'))),
  ).length;
}

/** Eén regel uitleg per actie, zonder persoonsgegevens: het regelnummer en wat er verandert. */
export function beschrijf(actie: Actie): string {
  const { regel } = actie;
  if (actie.soort === 'ongewijzigd') return `Regel ${regel.regel}: staat er al, niets te doen.`;
  if (actie.soort === 'nieuw') {
    const delen = [regel.type === 'extern' ? 'externe helper' : 'lid met inlogaccount'];
    if (regel.telefoon) delen.push('telefoon');
    if (regel.groepen && regel.groepen.length > 0)
      delen.push(`${regel.groepen.length} ${regel.groepen.length === 1 ? 'groep' : 'groepen'}`);
    if (regel.magBob) delen.push('BOB');
    if (regel.magEindverantwoordelijke) delen.push('eindverantwoordelijke');
    return `Regel ${regel.regel}: nieuw (${delen.join(', ')}).`;
  }
  const extra: string[] = [];
  if (actie.groepenErbij.length > 0) extra.push(`${actie.groepenErbij.length} groep erbij`);
  if (actie.groepenEraf.length > 0) extra.push(`${actie.groepenEraf.length} groep eraf`);
  const beheerder = actie.bestaand.isAdmin ? ' Let op: dit lid is beheerder (dat blijft zo).' : '';
  return `Regel ${regel.regel}: bijwerken (${actie.wijzigingen.join(', ')}${extra.length > 0 ? `; ${extra.join(', ')}` : ''}).${beheerder}`;
}
