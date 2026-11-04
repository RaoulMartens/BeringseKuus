// De ledenlijst voor de pilot met echte gegevens (review F2-02): scripts/zet-leden.ts tegen de lokale Supabase, zonder
// browser. Bewijst dat het script doet wat de procedure (docs/bouw/Pilotleden.md) belooft: een proef schrijft niets, leden
// krijgen een inlogaccount, telefoon, groepen en aanmerkingen, opnieuw draaien verandert niets, een lege cel wijzigt niets, en een
// fout in de lijst laat alles ongemoeid. Draait in het project "database" (playwright.config.ts).
import { expect, test } from '@playwright/test';

import { zetLedenIn } from '../scripts/zet-leden.ts';

import { ruimActiviteitenOp } from './beheer-hulp.ts';
import { psql } from './database-hulp.ts';
import { beheerClient, logInZonderBrowser, ruimLidOp } from './mfa-hulp.ts';

const kenmerk = crypto.randomUUID().slice(0, 8);
const adres = (naam: string): string => `zetleden-${kenmerk}-${naam}@example.com`;
const KOP = 'voornaam;achternaam;email;telefoon;groepen;bob;eindverantwoordelijke;type';

test.describe.configure({ mode: 'serial' });

// Accounts die een test zelf maakte, ook die nog geen privérij hebben (de halve toestand).
const extraUids: string[] = [];

test.afterAll(async () => {
  // Eerst de activiteiten (een plek verwijst naar een lid), dan de leden.
  ruimActiviteitenOp(`E2E ZetLeden % ${kenmerk}`);
  for (const uid of extraUids.splice(0)) await ruimLidOp(uid);
  const uids = psql(
    `select l.auth_user_id from public.leden l join public.leden_prive p on p.lid_id = l.id where p.email like 'zetleden-${kenmerk}-%' and l.auth_user_id is not null;`,
  )
    .split('\n')
    .map((regel) => regel.trim())
    .filter((regel) => regel !== '');
  for (const uid of uids) await ruimLidOp(uid);
  // Wat overblijft zonder account (een externe helper).
  psql(
    `delete from public.leden where id in (select lid_id from public.leden_prive where email like 'zetleden-${kenmerk}-%');`,
  );
});

function aantal(voorwaarde: string): number {
  return Number(
    psql(
      `select count(*) from public.leden l join public.leden_prive p on p.lid_id = l.id where p.email like 'zetleden-${kenmerk}-%' and ${voorwaarde};`,
    ).trim(),
  );
}

const eerste = [
  KOP,
  `Anna;Voorbeeld;${adres('anna')};0612345678;Bestuur|Dames;ja;ja;lid`,
  `Bert;Voorbeeld;${adres('bert')};;Raad van Elf;;;lid`,
  `Carla;Helper;${adres('carla')};06 87 65 43 21;;;;extern`,
].join('\n');

test('een proef schrijft niets', async () => {
  const uit = await zetLedenIn(beheerClient, eerste, false);
  expect(uit.fouten).toEqual([]);
  expect(uit.plan?.acties.map((actie) => actie.soort)).toEqual(['nieuw', 'nieuw', 'nieuw']);
  expect(uit.uitkomst).toBeNull();
  expect(aantal('true')).toBe(0);
});

test('doorvoeren maakt de leden met inlogaccount, telefoon, groepen en aanmerkingen', async () => {
  const uit = await zetLedenIn(beheerClient, eerste, true);
  expect(uit.uitkomst).toMatchObject({ nieuw: 3, bijgewerkt: 0, ongewijzigd: 0, mislukt: [] });

  expect(
    aantal(
      `p.email = '${adres('anna')}' and l.type = 'lid' and l.auth_user_id is not null and p.telefoon = '06 12 34 56 78' and p.mag_bob and p.mag_eindverantw`,
    ),
  ).toBe(1);
  expect(
    aantal(`p.email = '${adres('bert')}' and p.telefoon is null and not p.mag_bob and not p.mag_eindverantw`),
  ).toBe(1);
  // Een externe helper logt niet in.
  expect(
    aantal(
      `p.email = '${adres('carla')}' and l.type = 'extern' and l.auth_user_id is null and p.telefoon = '06 87 65 43 21'`,
    ),
  ).toBe(1);
  expect(
    psql(
      `select string_agg(g.naam, ',' order by g.naam) from public.lid_groep k join public.groepen g on g.id = k.groep_id join public.leden_prive p on p.lid_id = k.lid_id where p.email = '${adres('anna')}';`,
    ).trim(),
  ).toBe('Bestuur,Dames');
  // Het script maakt nooit een beheerder.
  expect(aantal('p.is_admin')).toBe(0);
});

test('het nieuwe lid kan inloggen en leest zijn eigen telefoonnummer, niet dat van een ander', async () => {
  const sessie = await logInZonderBrowser(adres('anna'));
  const eigen = await sessie.from('leden_prive').select('email, telefoon');
  expect(eigen.error).toBeNull();
  expect(eigen.data).toEqual([{ email: adres('anna'), telefoon: '06 12 34 56 78' }]);
});

test('opnieuw draaien verandert niets', async () => {
  const uit = await zetLedenIn(beheerClient, eerste, true);
  expect(uit.plan?.acties.map((actie) => actie.soort)).toEqual(['ongewijzigd', 'ongewijzigd', 'ongewijzigd']);
  expect(uit.uitkomst).toMatchObject({ nieuw: 0, bijgewerkt: 0, ongewijzigd: 3, mislukt: [] });
  expect(aantal('true')).toBe(3);
});

test('een wijziging past aan wat verschilt; een lege cel laat telefoon, groepen en aanmerkingen staan', async () => {
  const tweede = [
    KOP,
    // Anna: andere groepen en geen eindverantwoordelijke meer; telefoon en BOB blijven (lege cel).
    `Anna;Voorbeeld;${adres('anna')};;Raad van Elf;;nee;lid`,
    // Bert: een telefoonnummer erbij.
    `Bert;Voorbeeld;${adres('bert')};077-1234567;;;;lid`,
  ].join('\n');
  const uit = await zetLedenIn(beheerClient, tweede, true);
  expect(uit.uitkomst).toMatchObject({ nieuw: 0, bijgewerkt: 2, mislukt: [] });

  expect(
    aantal(
      `p.email = '${adres('anna')}' and p.telefoon = '06 12 34 56 78' and p.mag_bob and not p.mag_eindverantw`,
    ),
  ).toBe(1);
  expect(
    psql(
      `select string_agg(g.naam, ',' order by g.naam) from public.lid_groep k join public.groepen g on g.id = k.groep_id join public.leden_prive p on p.lid_id = k.lid_id where p.email = '${adres('anna')}';`,
    ).trim(),
  ).toBe('Raad van Elf');
  expect(aantal(`p.email = '${adres('bert')}' and p.telefoon = '077-1234567'`)).toBe(1);
  // Carla stond niet in de lijst en is ongemoeid.
  expect(aantal(`p.email = '${adres('carla')}' and p.telefoon = '06 87 65 43 21'`)).toBe(1);
});

test('een lid zonder inlogaccount (met SQL gemaakt) krijgt er een', async () => {
  const email = adres('sql');
  psql(`
    with l as (insert into public.leden (voornaam, achternaam, type) values ('Dirk', 'Sql', 'lid') returning id)
    insert into public.leden_prive (lid_id, email) select id, '${email}' from l;
  `);
  expect(aantal(`p.email = '${email}' and l.auth_user_id is null`)).toBe(1);
  const uit = await zetLedenIn(beheerClient, `${KOP}\nDirk;Sql;${email};;;;;lid\n`, true);
  expect(uit.uitkomst).toMatchObject({ bijgewerkt: 1, mislukt: [] });
  expect(aantal(`p.email = '${email}' and l.auth_user_id is not null`)).toBe(1);
});

test('een bestaand inlogaccount zonder lid wordt in de proef gemeld en bij het doorvoeren gekoppeld', async () => {
  const email = adres('account');
  const gemaakt = await beheerClient.auth.admin.createUser({ email, email_confirm: true });
  if (gemaakt.error) throw gemaakt.error;
  const lijst = `${KOP}\nGerrit;Account;${email};;;;;lid\n`;

  const proef = await zetLedenIn(beheerClient, lijst, false);
  expect(proef.fouten).toEqual([]);
  expect(proef.hergebruik).toBe(1);
  expect(aantal(`p.email = '${email}'`)).toBe(0);

  const uit = await zetLedenIn(beheerClient, lijst, true);
  expect(uit.uitkomst).toMatchObject({ nieuw: 1, mislukt: [] });
  expect(aantal(`p.email = '${email}' and l.auth_user_id = '${gemaakt.data.user.id}'`)).toBe(1);
  // Een tweede run: er is niets meer te koppelen.
  expect((await zetLedenIn(beheerClient, lijst, false)).hergebruik).toBe(0);
});

test('een inactief lid wordt niet aangeraakt, en een beheerder blijft beheerder', async () => {
  const inactief = adres('inactief');
  const beheerder = adres('beheerder');
  psql(`
    with l as (insert into public.leden (voornaam, achternaam, type, actief) values ('Ina', 'Actief', 'lid', false) returning id)
    insert into public.leden_prive (lid_id, email) select id, '${inactief}' from l;
    with l as (insert into public.leden (voornaam, achternaam, type) values ('Bea', 'Heerder', 'lid') returning id)
    insert into public.leden_prive (lid_id, email, is_admin, beheerder_sinds) select id, '${beheerder}', true, now() - interval '1 day' from l;
  `);
  const uit = await zetLedenIn(beheerClient, `${KOP}\nIna;Actief;${inactief};0611111111;;;;lid\n`, true);
  expect(uit.uitkomst).toBeNull();
  expect(uit.fouten.join('')).toContain('dit lid is inactief');
  expect(aantal(`p.email = '${inactief}' and p.telefoon is null and l.auth_user_id is null`)).toBe(1);

  const bijgewerkt = await zetLedenIn(
    beheerClient,
    `${KOP}\nBea;Heerder;${beheerder};0622222222;Bestuur;;;lid\n`,
    true,
  );
  expect(bijgewerkt.uitkomst).toMatchObject({ bijgewerkt: 1, mislukt: [] });
  // Het script wijzigt nooit wie beheerder is.
  expect(aantal(`p.email = '${beheerder}' and p.is_admin and p.telefoon = '06 22 22 22 22'`)).toBe(1);
});

test('een groepswijziging die een ingedeeld lid zijn dienst laat kwijtraken wordt geweigerd (CR-04)', async () => {
  const email = adres('dienst');
  const lijst = (groepen: string) => `${KOP}\nDiny;Dienst;${email};;${groepen};;;lid\n`;
  const eerst = await zetLedenIn(beheerClient, lijst('Bestuur'), true);
  expect(eerst.uitkomst).toMatchObject({ nieuw: 1, mislukt: [] });

  // Een gepubliceerde activiteit voor het bestuur, waar dit lid is ingedeeld.
  const naam = `E2E ZetLeden dienst ${kenmerk}`;
  psql(`
    with a as (
      insert into public.activiteiten (naam, datum, starttijd, eindtijd, locatie, status)
      values ('${naam}', '2099-08-08', '20:00', '23:00', 'Testlocatie', 'gepubliceerd') returning id
    ), g as (
      insert into public.activiteit_groep (activiteit_id, groep_id)
      select a.id, gr.id from a, public.groepen gr where gr.naam = 'Bestuur'
    )
    insert into public.rol_slots (activiteit_id, rol_type, volgorde, bezetter_id)
    select a.id, 'werker', 1, l.id from a, public.leden l join public.leden_prive p on p.lid_id = l.id where p.email = '${email}';
  `);

  // Naar een andere groep: het lid zou zijn eigen dienst niet meer zien, dus het script weigert en wijzigt niets.
  const weg = await zetLedenIn(beheerClient, lijst('Dames'), true);
  expect(weg.uitkomst).toBeNull();
  expect(weg.fouten.join('')).toContain('ziet dit lid 1 activiteit niet meer waar hij is ingedeeld');
  const groepen = () =>
    psql(
      `select string_agg(g.naam, ',' order by g.naam) from public.lid_groep k join public.groepen g on g.id = k.groep_id join public.leden_prive p on p.lid_id = k.lid_id where p.email = '${email}';`,
    ).trim();
  expect(groepen()).toBe('Bestuur');

  // Een groep erbij haalt niets weg en mag.
  const erbij = await zetLedenIn(beheerClient, lijst('Bestuur|Dames'), true);
  expect(erbij.uitkomst).toMatchObject({ bijgewerkt: 1, mislukt: [] });
  expect(groepen()).toBe('Bestuur,Dames');
});

test('een onderbroken import laat een half lid achter dat de volgende run afmaakt (CR-16)', async () => {
  const email = adres('half');
  // De toestand na een run die stopte tussen de ledenrij en de privérij: account en actieve ledenrij, geen leden_prive.
  const gemaakt = await beheerClient.auth.admin.createUser({ email, email_confirm: true });
  if (gemaakt.error) throw gemaakt.error;
  extraUids.push(gemaakt.data.user.id);
  psql(
    `insert into public.leden (auth_user_id, voornaam, achternaam, type) values ('${gemaakt.data.user.id}', 'Hans', 'Half', 'lid');`,
  );
  const lijst = `${KOP}\nHans;Half;${email};0611111111;Dames;;;lid\n`;

  const proef = await zetLedenIn(beheerClient, lijst, false);
  expect(proef.fouten).toEqual([]);
  expect(proef.halveLeden).toBeGreaterThanOrEqual(1);

  const uit = await zetLedenIn(beheerClient, lijst, true);
  expect(uit.uitkomst).toMatchObject({ nieuw: 1, mislukt: [] });
  // Afgemaakt, niet dubbel: één ledenrij voor dit account, nu met privégegevens en groep.
  expect(
    psql(`select count(*) from public.leden where auth_user_id = '${gemaakt.data.user.id}';`).trim(),
  ).toBe('1');
  expect(aantal(`p.email = '${email}' and p.telefoon = '06 11 11 11 11'`)).toBe(1);
  expect((await zetLedenIn(beheerClient, lijst, false)).plan?.acties.map((actie) => actie.soort)).toEqual([
    'ongewijzigd',
  ]);
});

test('een inlogaccount dat al bij een ander lid hoort, wordt niet overgenomen (CR-16)', async () => {
  const bezet = adres('bezet');
  const gemaakt = await beheerClient.auth.admin.createUser({ email: bezet, email_confirm: true });
  if (gemaakt.error) throw gemaakt.error;
  extraUids.push(gemaakt.data.user.id);
  // Een lid met een account en privégegevens onder een ander adres: het account van het adres uit de lijst is dus al van iemand.
  psql(`
    with l as (insert into public.leden (auth_user_id, voornaam, achternaam, type) values ('${gemaakt.data.user.id}', 'Bram', 'Bezet', 'lid') returning id)
    insert into public.leden_prive (lid_id, email) select id, '${adres('ander')}' from l;
  `);
  const uit = await zetLedenIn(beheerClient, `${KOP}\nNina;Nieuw;${bezet};;;;;lid\n`, true);
  expect(uit.uitkomst).toMatchObject({ nieuw: 0 });
  expect(uit.uitkomst?.mislukt.map((m) => m.reden).join('')).toContain('hoort al bij een ander lid');
  expect(aantal(`p.email = '${bezet}'`)).toBe(0);
});

test('een fout in de lijst laat alles ongemoeid, en de melding noemt geen persoonsgegevens', async () => {
  const kapot = [
    KOP,
    `Eva;Voorbeeld;${adres('eva')};0612345678;Bestaatniet;;;lid`,
    `Frank;Voorbeeld;${adres('frank')};;;;;lid`,
  ].join('\n');
  const uit = await zetLedenIn(beheerClient, kapot, true);
  expect(uit.uitkomst).toBeNull();
  expect(uit.fouten.join('\n')).toContain('Regel 2: de groep op plaats 1 bestaat niet');
  expect(uit.fouten.join('\n')).not.toContain(adres('eva'));
  expect(aantal(`p.email in ('${adres('eva')}', '${adres('frank')}')`)).toBe(0);
});

test('het type van een bestaand lid wijzigen kan niet met het script', async () => {
  const uit = await zetLedenIn(beheerClient, `${KOP}\nCarla;Helper;${adres('carla')};;;;;lid\n`, true);
  expect(uit.uitkomst).toBeNull();
  expect(uit.fouten.join('')).toContain('dit lid bestaat al als extern');
  expect(aantal(`p.email = '${adres('carla')}' and l.type = 'extern'`)).toBe(1);
});
