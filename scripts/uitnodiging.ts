// De uitnodiging aan de leden: de tekst van de mail en de keuze wie hem krijgt. Zuivere logica zonder netwerk en zonder database, zodat
// de regels met tests vast te leggen zijn. Het script scripts/nodig-leden-uit.ts leest de leden, praat met Postmark en verstuurt.
//
// Wat een uitnodiging is: een gewone mail met uitleg hoe je inlogt. Een lid logt met zijn e-mailadres en een code per mail in (docs/bouw/
// Inloggen.md); er is geen wachtwoord en geen persoonlijke link. De mail heeft een HTML- en een tekstversie (een tekstversie scheelt bij
// spamfilters) en geen volglinks of tracking.

export const STANDAARD_SITE = 'https://beringsekuus.crispy-concepts.nl';

export interface Opdracht {
  /** Alleen naar dit adres, als test. */
  test: string | null;
  /** Naar alle leden die kunnen inloggen. Zonder --ja alleen een telling. */
  alle: boolean;
  doorvoeren: boolean;
  van: string;
  ondertekening: string;
  antwoordAan: string | null;
  site: string;
  /** De voornaam in de aanhef van een testmail. */
  voornaam: string;
}

export const GEBRUIK = [
  'Gebruik:',
  '  npm run leden:uitnodigen -- --van <afzender> --ondertekening "<naam, functie>" --test <jouw adres> [--voornaam <naam>]',
  '  npm run leden:uitnodigen -- --van <afzender> --ondertekening "<naam, functie>" --alle [--ja]',
  'Opties: --antwoord <adres> (waar een antwoord heen gaat), --site <https-adres> (standaard de site van de vereniging).',
  'Zonder --ja telt --alle alleen hoeveel mails er zouden gaan. De Postmark-sleutel staat in POSTMARK_SERVER_TOKEN, de gegevens van Supabase in',
  'SUPABASE_URL en SUPABASE_SECRET_KEY (alleen voor --alle), in je eigen terminal (docs/bouw/Pilotleden.md).',
].join('\n');

const ADRES = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

export function geldigAdres(tekst: string): boolean {
  return tekst.length <= 254 && ADRES.test(tekst);
}

/** Leest de argumenten; geeft de opdracht, of de reden waarom het niet kan. */
export function leesArgumenten(argumenten: string[]): Opdracht | { fout: string } {
  const waarden = new Map<string, string>();
  let alle = false;
  let doorvoeren = false;
  for (let i = 0; i < argumenten.length; i += 1) {
    const argument = argumenten[i] ?? '';
    if (argument === '--alle') alle = true;
    else if (argument === '--ja') doorvoeren = true;
    else if (
      ['--test', '--van', '--ondertekening', '--antwoord', '--site', '--voornaam'].includes(argument)
    ) {
      const waarde = argumenten[i + 1];
      if (waarde === undefined || waarde.startsWith('--'))
        return { fout: `${argument} mist een waarde.\n${GEBRUIK}` };
      waarden.set(argument, waarde);
      i += 1;
    } else return { fout: `${GEBRUIK}` };
  }

  const test = waarden.get('--test') ?? null;
  const van = waarden.get('--van') ?? '';
  const ondertekening = (waarden.get('--ondertekening') ?? '').trim();
  const antwoordAan = waarden.get('--antwoord') ?? null;
  const site = (waarden.get('--site') ?? STANDAARD_SITE).replace(/\/$/, '');

  if ((test === null) === !alle)
    return { fout: `Kies precies één van --test <adres> of --alle.\n${GEBRUIK}` };
  if (!geldigAdres(van)) return { fout: `--van is geen e-mailadres.\n${GEBRUIK}` };
  if (ondertekening === '' || ondertekening.length > 120)
    return { fout: `--ondertekening ontbreekt of is te lang.\n${GEBRUIK}` };
  if (test !== null && !geldigAdres(test)) return { fout: '--test is geen e-mailadres.' };
  if (antwoordAan !== null && !geldigAdres(antwoordAan)) return { fout: '--antwoord is geen e-mailadres.' };
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(site))
    return { fout: '--site moet een https-adres zijn zonder pad, zoals https://voorbeeld.nl.' };
  if (/[\p{Cc}\p{Cf}]/u.test(ondertekening)) return { fout: '--ondertekening bevat een onzichtbaar teken.' };
  if (doorvoeren && !alle) return { fout: '--ja hoort bij --alle; een testmail gaat zonder --ja.' };

  return {
    test,
    alle,
    doorvoeren,
    van,
    ondertekening,
    antwoordAan,
    site,
    voornaam: (waarden.get('--voornaam') ?? 'Kuus').trim() || 'Kuus',
  };
}

export interface LidVoorUitnodiging {
  voornaam: string;
  email: string;
  type: string;
  actief: boolean;
  heeftAccount: boolean;
  alleenBeheer: boolean;
}

/**
 * Wie de uitnodiging krijgt: actieve leden (geen externe helpers) met een inlogaccount, want zonder account kan iemand niet inloggen,
 * en geen beheeraccounts (die zijn er alleen om te beheren). Elk adres één keer, ook als twee leden hetzelfde adres hebben.
 */
export function kiesOntvangers(leden: LidVoorUitnodiging[]): { voornaam: string; email: string }[] {
  const gezien = new Set<string>();
  const uit: { voornaam: string; email: string }[] = [];
  for (const lid of leden) {
    const email = lid.email.trim().toLowerCase();
    if (lid.type !== 'lid' || !lid.actief || !lid.heeftAccount || lid.alleenBeheer) continue;
    if (!geldigAdres(email) || gezien.has(email)) continue;
    gezien.add(email);
    uit.push({ voornaam: lid.voornaam.trim(), email });
  }
  return uit;
}

function escape(tekst: string): string {
  return tekst.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface Mail {
  onderwerp: string;
  tekst: string;
  html: string;
}

/** De mail zelf. De aanhef gebruikt de voornaam; de rest is voor iedereen gelijk. */
export function maakUitnodiging(opties: {
  voornaam: string;
  ondertekening: string;
  site: string;
  test?: boolean;
}): Mail {
  const { voornaam, ondertekening, site } = opties;
  const aanhef = `Beste ${voornaam},`;
  const onderwerp = `${opties.test ? '[TEST] ' : ''}Het ledenplatform van de vereniging staat klaar: log vandaag nog in`;

  const stappen = [
    `Ga naar ${site}`,
    'Vul het e-mailadres in waarop je deze mail kreeg.',
    'Je krijgt een mail met een code van zes cijfers. Vul die in.',
  ];
  const inleiding =
    'Het ledenplatform van de vereniging is er. Hier zie je het programma, meld je je af als je een keer niet kunt, en draag je je dienst over aan een ander als je verhinderd bent. Het bestuur gebruikt het om diensten in te delen.';
  const wachtwoord = 'Een wachtwoord heb je niet nodig. De code werkt één keer en is 24 uur geldig.';
  const zie = [
    ['Start', 'de eerstvolgende activiteit: wanneer je er moet zijn, waar, en wie er allemaal komt.'],
    ['Programma', 'alle activiteiten van het seizoen.'],
    ['Mijn diensten', 'waar jij als dienst bent ingedeeld.'],
  ] as const;
  const afmelden =
    'Iedereen staat standaard op aanwezig. Kun je niet, kies dan Afmelden. Kun je wel komen maar niet je dienst doen, kies dan Dienst overdragen en wijs iemand aan die het van je overneemt.';
  const lukt =
    'Komt de mail niet aan? Kijk dan eerst in je map met ongewenste e-mail of "Overige" (bij Hotmail en Outlook komt hij daar nog wel eens terecht), en zet de afzender als veilig. Lukt het dan nog niet, stuur me een berichtje.';
  const proef =
    'We proberen dit eerst met een kleine groep uit. Dat betekent dat er nog dingen zijn die niet vanzelf gaan: je krijgt bijvoorbeeld nog geen e-mail als je wordt ingedeeld, dus het bestuur laat je dat zelf weten. Opmerkingen zijn welkom, dan kunnen we het verbeteren.';
  const groet = 'Alaaf,';

  const tekst = [
    aanhef,
    '',
    inleiding,
    '',
    'Zo log je in (een minuut):',
    ...stappen.map((stap, i) => `${i + 1}. ${stap}`),
    '',
    wachtwoord,
    '',
    'Wat je ziet:',
    ...zie.map(([kop, uitleg]) => `- ${kop}: ${uitleg}`),
    '',
    `Afmelden en overdragen: ${afmelden}`,
    '',
    lukt,
    '',
    proef,
    '',
    groet,
    ondertekening,
    '',
  ].join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="nl">',
    '<head><meta charset="utf-8"><title>' + escape(onderwerp) + '</title></head>',
    '<body>',
    `<p>${escape(aanhef)}</p>`,
    `<p>${escape(inleiding)}</p>`,
    '<p><strong>Zo log je in</strong> (een minuut):</p>',
    '<ol>',
    `<li>Ga naar <a href="${escape(site)}">${escape(site)}</a></li>`,
    `<li>${escape(stappen[1] ?? '')}</li>`,
    `<li>${escape(stappen[2] ?? '')}</li>`,
    '</ol>',
    `<p>${escape(wachtwoord)}</p>`,
    '<p><strong>Wat je ziet</strong></p>',
    '<ul>',
    ...zie.map(([kop, uitleg]) => `<li><strong>${escape(kop)}:</strong> ${escape(uitleg)}</li>`),
    '</ul>',
    `<p><strong>Afmelden en overdragen:</strong> ${escape(afmelden)}</p>`,
    `<p>${escape(lukt)}</p>`,
    `<p>${escape(proef)}</p>`,
    `<p>${escape(groet)}<br>${escape(ondertekening)}</p>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');

  return { onderwerp, tekst, html };
}
