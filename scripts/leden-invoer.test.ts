import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  beschrijf,
  geldigEmail,
  kiesScheiding,
  leesCsv,
  leesCsvRegels,
  leesJaNee,
  leesLeden,
  maakPlan,
  normaliseerTelefoon,
  telHergebruik,
  type BestaandLid,
  type LidRegel,
} from './leden-invoer.ts';

// Als code points, niet als tekens in de bron: een onzichtbaar teken in een bestand is zelf een risico.
const BOM = String.fromCodePoint(0xfeff);
const BIDI = String.fromCodePoint(0x202e);

const GROEPEN = ['Bestuur', 'Raad van Elf', 'Dames', 'Overige leden'];

const KOP = 'voornaam;achternaam;email;telefoon;groepen;bob;eindverantwoordelijke;type';

test('leesCsv: scheiding, aanhalingstekens, een scheidingsteken en regeleinde binnen een cel, lege regels', () => {
  const rijen = leesCsv('a;b;c\r\n"x;y";"z ""q"""; \r\n\r\n"twee\nregels";2;3\r\n', ';');
  assert.deepEqual(rijen, [
    ['a', 'b', 'c'],
    ['x;y', 'z "q"', ' '],
    ['twee\nregels', '2', '3'],
  ]);
});

test('kiesScheiding: de kopregel beslist, een puntkomma wint bij gelijk', () => {
  assert.equal(kiesScheiding('voornaam;achternaam;email'), ';');
  assert.equal(kiesScheiding('voornaam,achternaam,email'), ',');
  assert.equal(kiesScheiding('voornaam'), ';');
});

test('normaliseerTelefoon: een mobiel nummer krijgt de vorm van de lijst, de rest blijft, rommel wordt geweigerd', () => {
  assert.equal(normaliseerTelefoon('0612345678'), '06 12 34 56 78');
  assert.equal(normaliseerTelefoon('06  12 34 56 78 '), '06 12 34 56 78');
  assert.equal(normaliseerTelefoon('+31 6 12345678'), '+31 6 12345678');
  assert.equal(normaliseerTelefoon('077-1234567'), '077-1234567');
  assert.equal(normaliseerTelefoon('12345'), null);
  assert.equal(normaliseerTelefoon('06 abc 34 56 78'), null);
  assert.equal(normaliseerTelefoon('06123456789012345678'), null);
});

test('normaliseerTelefoon: alle leden zien het nummer, dus ook streng: voorloopnul of plus, geen haakjes, niet te lang', () => {
  // Excel laat de voorloopnul weg bij een getal: 612345678 is geen nummer dat iemand kan bellen.
  assert.equal(normaliseerTelefoon('612345678'), null);
  assert.equal(normaliseerTelefoon('(06 12 34 56 78)'), null);
  assert.equal(normaliseerTelefoon('(((((((((06 12 34 56 78)))))))))'), null);
  assert.equal(normaliseerTelefoon('06 12 34 56 78 90 12 34 56'), null);
  assert.equal(normaliseerTelefoon('+31612345678'), '+31612345678');
});

test('geldigEmail: wat de database en het inlogsysteem accepteren', () => {
  assert.equal(geldigEmail('anna@example.com'), true);
  assert.equal(geldigEmail('anna.van.dijk+pilot@sub.example.com'), true);
  for (const slecht of [
    'a@example..com',
    'x@example.com.',
    '.x@example.com',
    'x.@example.com',
    'x@.example.com',
    'x y@example.com',
    'x@localhost',
    `x@example.com${BIDI}`,
    'x\u0000@example.com',
    `${'a'.repeat(250)}@example.com`,
  ]) {
    assert.equal(geldigEmail(slecht), false, slecht);
  }
});

test('leesCsvRegels: het regelnummer is dat in het bestand, ook na lege regels en een cel over meer regels', () => {
  const rijen = leesCsvRegels('kop\r\n\r\n;;;\r\nA\r\n"B\r\nB2"\r\n\r\nC\r\n', ';');
  assert.deepEqual(
    rijen.map((rij) => [rij.regel, rij.cellen[0]]),
    [
      [1, 'kop'],
      [4, 'A'],
      [5, 'B\r\nB2'],
      [8, 'C'],
    ],
  );
});

test('leesLeden: een melding noemt de regel zoals Excel hem toont, ook na lege regels', () => {
  const uit = leesLeden(`${KOP}\n\n;;;;;;;\nAnna;Voorbeeld;geen-adres;;;;;lid\n`, GROEPEN);
  assert.match(uit.fouten.join('\n'), /Regel 4: het e-mailadres klopt niet/);
});

test('leesLeden: een cel met alleen scheidingstekens bij groepen is een fout, geen stille wis van alle groepen', () => {
  const uit = leesLeden(`${KOP}\nAnna;Voorbeeld;anna@example.com;;|;;;lid\n`, GROEPEN);
  assert.match(uit.fouten.join('\n'), /Regel 2: bij groepen staat geen groep/);
  assert.deepEqual(uit.regels, []);
});

test('leesLeden: een bestand dat geen UTF-8 is (Excel "CSV" in Windows-1252) wordt geweigerd', () => {
  const kapot = Buffer.from(
    `${KOP}\nZo${String.fromCharCode(0xeb)};Voorbeeld;zoe@example.com;;;;;lid\n`,
    'latin1',
  );
  const tekst = new TextDecoder('utf-8').decode(kapot);
  assert.match(leesLeden(tekst, GROEPEN).fouten.join(''), /niet als UTF-8 bewaard/);
});

test('leesLeden: onzichtbare tekens in een naam worden geweigerd, accenten en tussenvoegsels niet', () => {
  const slecht = leesLeden(`${KOP}\nAn${BIDI}na;Voorbeeld;anna@example.com;;;;;lid\n`, GROEPEN);
  assert.match(slecht.fouten.join(''), /een naam bevat een onzichtbaar teken/);
  const goed = leesLeden(`${KOP}\nZoë;van der Voorbeeld-Éclair;zoe@example.com;;;;;lid\n`, GROEPEN);
  assert.deepEqual(goed.fouten, []);
  assert.equal(goed.regels[0]?.achternaam, 'van der Voorbeeld-Éclair');
});

test('leesJaNee: ja en nee in de vormen van Excel, leeg is niet wijzigen, de rest is onbekend', () => {
  for (const ja of ['ja', 'JA', 'j', 'x', '1', 'true']) assert.equal(leesJaNee(ja), true, ja);
  for (const nee of ['nee', 'Nee', 'n', '0', 'false']) assert.equal(leesJaNee(nee), false, nee);
  assert.equal(leesJaNee(''), null);
  assert.equal(leesJaNee('  '), null);
  assert.equal(leesJaNee('misschien'), 'onbekend');
});

test('leesLeden: een goede lijst, met een BOM, hoofdletters in het adres en groepen op hun eigen naam', () => {
  const tekst = `${BOM}${KOP}\nAnna;Voorbeeld;Anna@Example.com;0612345678;bestuur|raad van elf;ja;nee;lid\nBert;Voorbeeld;bert@example.com;;;;;extern\n`;
  const uit = leesLeden(tekst, GROEPEN);
  assert.deepEqual(uit.fouten, []);
  assert.deepEqual(uit.regels, [
    {
      regel: 2,
      voornaam: 'Anna',
      achternaam: 'Voorbeeld',
      email: 'anna@example.com',
      type: 'lid',
      telefoon: '06 12 34 56 78',
      groepen: ['Bestuur', 'Raad van Elf'],
      magBob: true,
      magEindverantwoordelijke: false,
    },
    {
      regel: 3,
      voornaam: 'Bert',
      achternaam: 'Voorbeeld',
      email: 'bert@example.com',
      type: 'extern',
      telefoon: null,
      groepen: null,
      magBob: null,
      magEindverantwoordelijke: null,
    },
  ]);
});

test('leesLeden: een komma als scheiding, kolommen in een andere volgorde en andere namen', () => {
  const uit = leesLeden(
    'E-mail,Achternaam,Voornaam,Mobiel\nanna@example.com,Voorbeeld,Anna,0612345678\n',
    GROEPEN,
  );
  assert.deepEqual(uit.fouten, []);
  assert.equal(uit.regels[0]?.telefoon, '06 12 34 56 78');
  assert.equal(uit.regels[0]?.voornaam, 'Anna');
});

test('leesLeden: de kop wordt streng gelezen: een onbekende of dubbele kolom en een ontbrekende verplichte kolom', () => {
  assert.match(
    leesLeden('voornaam;achternaam;email;adres\n', GROEPEN).fouten.join('\n'),
    /Kolom 4 van de kopregel is onbekend\./,
  );
  assert.match(
    leesLeden('voornaam;voornaam;achternaam;email\n', GROEPEN).fouten.join('\n'),
    /voornaam staat er twee keer in/,
  );
  assert.match(
    leesLeden('voornaam;email\nAnna;a@example.com\n', GROEPEN).fouten.join('\n'),
    /achternaam ontbreekt/,
  );
});

test('leesLeden: een leeg bestand en alleen een kopregel', () => {
  assert.deepEqual(leesLeden('', GROEPEN).fouten, ['Het bestand is leeg.']);
  assert.match(leesLeden(`${KOP}\n`, GROEPEN).fouten.join(''), /geen leden/);
});

test('leesLeden: elke fout met regelnummer, en zonder de ingevulde waarde', () => {
  const tekst = [
    KOP,
    ';Voorbeeld;geen-adres;12345;Onbekend;misschien;;lid',
    'Anna;Voorbeeld;dubbel@example.com;;;;;lid',
    'Bert;Voorbeeld;dubbel@example.com;;;;;lid',
    'Carla;Voorbeeld;carla@example.com;;;;;vreemd',
  ].join('\n');
  const uit = leesLeden(tekst, GROEPEN);
  assert.deepEqual(uit.regels, []);
  const alles = uit.fouten.join('\n');
  assert.match(alles, /Regel 2: de voornaam ontbreekt/);
  assert.match(alles, /Regel 2: het e-mailadres klopt niet/);
  assert.match(alles, /Regel 2: het telefoonnummer klopt niet/);
  // De ingevulde groep zelf staat er niet in (een verschoven kolom zou er een naam of nummer in zetten), wel de plaats.
  assert.match(
    alles,
    /Regel 2: de groep op plaats 1 bestaat niet. Bekend: Bestuur, Raad van Elf, Dames, Overige leden/,
  );
  assert.doesNotMatch(alles, /Onbekend"/);
  assert.match(alles, /Regel 2: bij BOB staat geen ja of nee/);
  assert.match(alles, /Regel 4: dit e-mailadres staat ook op regel 3/);
  assert.match(alles, /Regel 5: het type is niet lid of extern/);
  // Geen enkel adres of nummer in een melding.
  assert.doesNotMatch(alles, /geen-adres|12345|dubbel@example|carla@/);
});

test('leesLeden: een externe helper heeft geen groep en is geen BOB of eindverantwoordelijke (R17)', () => {
  const uit = leesLeden(`${KOP}\nBert;Voorbeeld;bert@example.com;;Bestuur;ja;;extern\n`, GROEPEN);
  const alles = uit.fouten.join('\n');
  assert.match(alles, /kan niet bij een groep horen/);
  assert.match(alles, /kan geen BOB of eindverantwoordelijke zijn/);
});

test('leesLeden: te veel regels', () => {
  const regels = Array.from({ length: 501 }, (_, i) => `A;B;lid${i}@example.com`).join('\n');
  assert.match(
    leesLeden(`voornaam;achternaam;email\n${regels}\n`, GROEPEN).fouten.join(''),
    /maximum is 500/,
  );
});

function bestaand(extra: Partial<BestaandLid> = {}): BestaandLid {
  return {
    lidId: 'id',
    authUserId: 'uid',
    voornaam: 'Anna',
    achternaam: 'Voorbeeld',
    type: 'lid',
    telefoon: '06 12 34 56 78',
    magBob: false,
    magEindverantwoordelijke: false,
    groepen: ['Bestuur'],
    isAdmin: false,
    actief: true,
    indelingen: [],
    ...extra,
  };
}

function regel(extra: Partial<LidRegel> = {}): LidRegel {
  return {
    regel: 2,
    voornaam: 'Anna',
    achternaam: 'Voorbeeld',
    email: 'anna@example.com',
    type: 'lid',
    telefoon: null,
    groepen: null,
    magBob: null,
    magEindverantwoordelijke: null,
    ...extra,
  };
}

test('maakPlan: een onbekend adres is nieuw', () => {
  const plan = maakPlan([regel()], new Map());
  assert.equal(plan.acties[0]?.soort, 'nieuw');
  assert.deepEqual(plan.fouten, []);
});

test('maakPlan: een lege cel wijzigt niets, ook geen telefoonnummer, aanmerking of groep', () => {
  const plan = maakPlan([regel()], new Map([['anna@example.com', bestaand()]]));
  assert.equal(plan.acties[0]?.soort, 'ongewijzigd');
});

test('maakPlan: wat verschilt wordt bijgewerkt, en de groepen zijn de volledige lijst voor dat lid', () => {
  const plan = maakPlan(
    [
      regel({
        telefoon: '06 99 99 99 99',
        magBob: true,
        magEindverantwoordelijke: false,
        groepen: ['Raad van Elf', 'Dames'],
      }),
    ],
    new Map([['anna@example.com', bestaand()]]),
  );
  const actie = plan.acties[0];
  assert.ok(actie && actie.soort === 'bijwerken');
  assert.deepEqual(actie.wijzigingen, ['telefoon', 'BOB', 'groepen']);
  assert.deepEqual(actie.groepenErbij, ['Raad van Elf', 'Dames']);
  assert.deepEqual(actie.groepenEraf, ['Bestuur']);
});

test('maakPlan: dezelfde groepen in een andere volgorde is geen wijziging', () => {
  const plan = maakPlan(
    [regel({ groepen: ['Dames', 'Bestuur'] })],
    new Map([['anna@example.com', bestaand({ groepen: ['Bestuur', 'Dames'] })]]),
  );
  assert.equal(plan.acties[0]?.soort, 'ongewijzigd');
});

test('maakPlan: een andere naam wordt gemeld, het type wijzigen kan niet', () => {
  const naam = maakPlan([regel({ voornaam: 'Anneke' })], new Map([['anna@example.com', bestaand()]]));
  const actie = naam.acties[0];
  assert.ok(actie && actie.soort === 'bijwerken');
  assert.deepEqual(actie.wijzigingen, ['naam']);

  const type = maakPlan([regel({ type: 'extern' })], new Map([['anna@example.com', bestaand()]]));
  assert.deepEqual(type.acties, []);
  assert.match(type.fouten.join(''), /Regel 2: dit lid bestaat al als lid/);
});

test('maakPlan: een lid zonder inlogaccount krijgt er een, een externe helper niet', () => {
  const lid = maakPlan([regel()], new Map([['anna@example.com', bestaand({ authUserId: null })]]));
  const actie = lid.acties[0];
  assert.ok(actie && actie.soort === 'bijwerken');
  assert.deepEqual(actie.wijzigingen, ['inlogaccount']);
  const extern = maakPlan(
    [regel({ type: 'extern' })],
    new Map([['anna@example.com', bestaand({ authUserId: null, type: 'extern' })]]),
  );
  assert.equal(extern.acties[0]?.soort, 'ongewijzigd');
});

test('maakPlan: een inactief lid wordt niet aangeraakt, een beheerder wel bijgewerkt maar met een waarschuwing in de proef', () => {
  const inactief = maakPlan(
    [regel({ telefoon: '06 99 99 99 99' })],
    new Map([['anna@example.com', bestaand({ actief: false })]]),
  );
  assert.deepEqual(inactief.acties, []);
  assert.match(inactief.fouten.join(''), /Regel 2: dit lid is inactief/);

  const beheerder = maakPlan(
    [regel({ telefoon: '06 99 99 99 99' })],
    new Map([['anna@example.com', bestaand({ isAdmin: true })]]),
  );
  const actie = beheerder.acties[0];
  assert.ok(actie && actie.soort === 'bijwerken');
  assert.match(beschrijf(actie), /dit lid is beheerder \(dat blijft zo\)/);
});

test('maakPlan: een groepswijziging die een lid zijn eigen dienst laat kwijtraken wordt geweigerd (CR-04)', () => {
  const ingedeeld = bestaand({
    groepen: ['Bestuur'],
    indelingen: [
      { activiteitId: 'a1', groepen: ['Bestuur'] },
      { activiteitId: 'a2', groepen: ['Bestuur', 'Dames'] },
      { activiteitId: 'a3', groepen: [] },
    ],
  });
  const staat = new Map([['anna@example.com', ingedeeld]]);

  // Van Bestuur naar Dames: a1 (alleen Bestuur) verdwijnt voor hem; a2 blijft (Dames), a3 is voor iedereen.
  const weg = maakPlan([regel({ groepen: ['Dames'] })], staat);
  assert.deepEqual(weg.acties, []);
  assert.match(
    weg.fouten.join(''),
    /Regel 2: met deze groepen ziet dit lid 1 activiteit niet meer waar hij is ingedeeld/,
  );

  // Naar een groep die niets raakt, of een groep erbij, mag.
  assert.equal(maakPlan([regel({ groepen: ['Bestuur', 'Dames'] })], staat).fouten.length, 0);
  assert.equal(maakPlan([regel({ groepen: ['Bestuur'] })], staat).fouten.length, 0);
  // Een lege cel laat de groepen staan: dan is er niets te toetsen.
  assert.equal(maakPlan([regel({ groepen: null, telefoon: '06 99 99 99 99' })], staat).fouten.length, 0);
});

test('maakPlan: een activiteit die het lid al niet zag, blokkeert een telefoonwijziging of groepswijziging niet (FX-08)', () => {
  const staat = new Map([
    [
      'anna@example.com',
      bestaand({ groepen: ['Bestuur'], indelingen: [{ activiteitId: 'a1', groepen: ['Dames'] }] }),
    ],
  ]);
  const plan = maakPlan([regel({ groepen: ['Raad van Elf'] })], staat);
  assert.deepEqual(plan.fouten, []);
  assert.equal(plan.acties[0]?.soort, 'bijwerken');
});

test('maakPlan: de melding telt meer verloren activiteiten', () => {
  const staat = new Map([
    [
      'anna@example.com',
      bestaand({
        indelingen: [
          { activiteitId: 'a1', groepen: ['Bestuur'] },
          { activiteitId: 'a2', groepen: ['Bestuur'] },
        ],
      }),
    ],
  ]);
  assert.match(
    maakPlan([regel({ groepen: ['Dames'] })], staat).fouten.join(''),
    /ziet dit lid 2 activiteiten niet meer/,
  );
});

test('telHergebruik: telt de bestaande inlogaccounts die aan een lid worden gekoppeld, niet die van een externe helper', () => {
  const plan = maakPlan(
    [
      regel({ regel: 2, email: 'een@example.com' }),
      regel({ regel: 3, email: 'twee@example.com' }),
      regel({ regel: 4, email: 'drie@example.com', type: 'extern' }),
      regel({ regel: 5, email: 'vier@example.com' }),
    ],
    new Map([['vier@example.com', bestaand({ authUserId: null })]]),
  );
  const accounts = new Set(['een@example.com', 'drie@example.com', 'vier@example.com', 'ander@example.com']);
  // Regel 2 (nieuw, account bestaat) en regel 5 (lid zonder account, account bestaat); regel 4 is extern, regel 3 heeft geen account.
  assert.equal(telHergebruik(plan.acties, accounts), 2);
});

test('beschrijf: zonder persoonsgegevens', () => {
  assert.equal(
    beschrijf({
      soort: 'nieuw',
      regel: regel({ telefoon: '06 12 34 56 78', groepen: ['Bestuur'], magBob: true }),
    }),
    'Regel 2: nieuw (lid met inlogaccount, telefoon, 1 groep, BOB).',
  );
  assert.equal(beschrijf({ soort: 'ongewijzigd', regel: regel() }), 'Regel 2: staat er al, niets te doen.');
  const plan = maakPlan([regel({ groepen: ['Dames'] })], new Map([['anna@example.com', bestaand()]]));
  assert.equal(beschrijf(plan.acties[0]!), 'Regel 2: bijwerken (groepen; 1 groep erbij, 1 groep eraf).');
});
