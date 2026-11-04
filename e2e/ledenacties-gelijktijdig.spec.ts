// De test met twee gelijktijdige sessies voor de ledenacties van fase 3 (Datamodel-fase-3.md punt 6; use-cases.md,
// "Gelijktijdigheid: één slot per activiteit"): meld_af, ruil_dienst en activiteit_opslaan nemen dezelfde rij-lock op de activiteit.
// Geen browser: twee echte databasesessies via psql in de container van de lokale Supabase. Draait in het project "database".
//
// Sessie A doet een echte aanroep en houdt daarna de transactie een paar seconden open, met de lock nog vast. Zodra de database
// laat zien dat A slaapt (niet na een vaste tijd), draait sessie B zijn aanroep. B moet dan wachten en daarna de stand van A zien.
// Zonder lock leest B de oude stand, en dan slaagt hij of faalt hij met een andere melding: de tests zijn rood zonder de lock.
//
// Elke test eindigt met de eindtoestand: nooit een lid dat tegelijk afgemeld en ingedeeld is, nooit een lid op twee plekken.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

import { expect, test } from '@playwright/test';

import { PSQL, psql } from './database-hulp.ts';

const uitvoeren = promisify(execFile);

const SLAAP = 3;
const token = crypto.randomUUID().slice(0, 8);
const wacht = (ms: number): Promise<void> => new Promise((klaar) => setTimeout(klaar, ms));

interface Lid {
  uid: string;
  id: string;
}
const nieuwLid = (): Lid => ({ uid: crypto.randomUUID(), id: crypto.randomUUID() });

// Zeven gewone leden, een eindverantwoordelijke met telefoon en een beheerder.
const leden = Array.from({ length: 7 }, nieuwLid);
const ev = nieuwLid();
const beheerder = nieuwLid();
const alleLeden = [...leden, ev, beheerder];

const lidSql = (lid: Lid, naam: string, extra: { admin?: boolean; telefoon?: string } = {}): string => `
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at, confirmation_token, recovery_token,
                          email_change_token_new, email_change, phone_change, phone_change_token, email_change_token_current,
                          reauthentication_token)
  values ('${lid.uid}', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'ledenacties-${naam}-${token}@example.com', now(), now(), '', '', '', '', '', '', '', '');
  insert into public.leden (id, auth_user_id, voornaam, achternaam, type) values ('${lid.id}', '${lid.uid}', 'Ledenacties${naam}', 'Test', 'lid');
  insert into public.leden_prive (lid_id, email, telefoon, is_admin, beheerder_sinds)
  values ('${lid.id}', 'ledenacties-${naam}-${token}@example.com', ${extra.telefoon ? `'${extra.telefoon}'` : 'null'},
          ${extra.admin ? 'true' : 'false'}, ${extra.admin ? "timestamptz '2026-06-01'" : 'null'});
  ${
    extra.admin
      ? `insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
         values (gen_random_uuid(), '${lid.uid}', 'totp', 'verified', timestamptz '2026-05-01', timestamptz '2026-05-01');`
      : ''
  }
`;

test.describe.configure({ mode: 'serial' });

/**
 * Ruimt alles van deze spec op, ook de resten van een eerdere run die is gestopt: op naam, niet op id. De gepubliceerde
 * testactiviteiten verwijdert alleen de eigenaar, zonder het vangnet. Niet met `alter table ... disable trigger`: dat neemt een
 * tabelslot dat op lopende schrijvers wacht en intussen alle andere schrijvers op activiteiten ophoudt, ook in andere specs die
 * tegelijk draaien. Daarom eerst de rijen eronder weg en dan de activiteit met `session_replication_role` (alleen deze sessie).
 */
function ruimOp(): void {
  psql(`
    create temp table act_ruimen as select id from public.activiteiten where naam like 'Ledenacties %';
    delete from public.afmeldingen where activiteit_id in (select id from act_ruimen);
    delete from public.activiteit_groep where activiteit_id in (select id from act_ruimen);
    delete from public.rol_slots where activiteit_id in (select id from act_ruimen);
    set session_replication_role = replica;
    delete from public.activiteiten where id in (select id from act_ruimen);
    reset session_replication_role;
    delete from public.groepen where naam like 'Ledenacties %';
    create temp table te_ruimen as select id, auth_user_id from public.leden where voornaam like 'Ledenacties%';
    delete from public.wijzigingen_log where door_lid_id in (select id from te_ruimen);
    delete from public.leden_prive where lid_id in (select id from te_ruimen);
    delete from public.leden where id in (select id from te_ruimen);
    delete from auth.mfa_factors where user_id in (select auth_user_id from te_ruimen);
    delete from auth.users where id in (select auth_user_id from te_ruimen);
  `);
}

// Een eigen groep met alleen de testleden, zodat het aantal aanwezigen bij de ondergrens vaststaat, wat er ook in de
// database staat of wat andere tests er tegelijk bij zetten.
const groep = crypto.randomUUID();

test.beforeAll(() => {
  ruimOp();
  leden.forEach((lid, i) => psql(lidSql(lid, `l${i}`)));
  psql(lidSql(ev, 'ev', { telefoon: '06 12 34 56 78' }));
  psql(lidSql(beheerder, 'beheerder', { admin: true }));
  psql(`
    insert into public.groepen (id, naam, volgorde) values ('${groep}', 'Ledenacties ${token}', 99);
    insert into public.lid_groep (lid_id, groep_id) values ${alleLeden.map((l) => `('${l.id}', '${groep}')`).join(', ')};
  `);
});

test.afterAll(() => {
  ruimOp();
});

let teller = 0;

/** Een gepubliceerde activiteit ver in de toekomst, met een eindverantwoordelijke met telefoon. */
function maakActiviteit(opties: { doelgroep?: boolean; concept?: boolean } = {}): string {
  teller += 1;
  const act = crypto.randomUUID();
  const concept = opties.concept === true;
  psql(`
    insert into public.activiteiten (id, naam, datum, starttijd, eindtijd, locatie, status)
    values ('${act}', 'Ledenacties ${token} ${teller}', '2031-03-${String(teller).padStart(2, '0')}',
            ${concept ? 'null, null, null' : "'20:00', '23:00', 'Test'"}, '${concept ? 'concept' : 'gepubliceerd'}');
    insert into public.rol_slots (activiteit_id, rol_type, bezetter_id) values ('${act}', 'eindverantwoordelijke', '${ev.id}');
    ${opties.doelgroep ? `insert into public.activiteit_groep (activiteit_id, groep_id) values ('${act}', '${groep}');` : ''}
  `);
  return act;
}

/** Een werkersplek, met of zonder bezetter. */
function maakSlot(act: string, bezetter: Lid | null): string {
  const slot = crypto.randomUUID();
  psql(
    `insert into public.rol_slots (id, activiteit_id, rol_type, bezetter_id) values ('${slot}', '${act}', 'werker', ${bezetter ? `'${bezetter.id}'` : 'null'});`,
  );
  return slot;
}

const bezetter = (slot: string): string =>
  psql(`select coalesce(bezetter_id::text, '(leeg)') from public.rol_slots where id = '${slot}';`).trim();
const afmeldingen = (act: string, lid: Lid): string =>
  psql(
    `select count(*) from public.afmeldingen where activiteit_id = '${act}' and lid_id = '${lid.id}';`,
  ).trim();
const plekken = (act: string, lid: Lid): string =>
  psql(
    `select count(*) from public.rol_slots where activiteit_id = '${act}' and bezetter_id = '${lid.id}';`,
  ).trim();

interface Aanroep {
  lid: Lid;
  sql: string;
}

const claimsVan = (lid: Lid): string => {
  const nu = Math.floor(Date.now() / 1000);
  // Een beheerder: aal2 en in amr een code (totp) van zojuist, zoals GoTrue het zet; een lid heeft alleen de mailcode.
  const admin = lid.id === beheerder.id;
  return JSON.stringify({
    sub: lid.uid,
    role: 'authenticated',
    aal: admin ? 'aal2' : 'aal1',
    amr: admin
      ? [
          { method: 'otp', timestamp: nu },
          { method: 'totp', timestamp: nu },
        ]
      : [{ method: 'otp', timestamp: nu }],
  });
};

const meldAf = (lid: Lid, act: string): Aanroep => ({ lid, sql: `select public.meld_af('${act}')` });
const ruil = (lid: Lid, slot: string, vervanger: Lid): Aanroep => ({
  lid,
  sql: `select public.ruil_dienst('${slot}', '${vervanger.id}')`,
});
const toewijzen = (act: string, slot: string, lid: Lid, verwacht: Lid | null): Aanroep => ({
  lid: beheerder,
  sql: `select public.activiteit_opslaan('${act}', '{}'::jsonb,
    '[{"handeling": "toewijzen", "rol_slot_id": "${slot}", "lid_id": "${lid.id}", "verwachte_bezetter": ${verwacht ? `"${verwacht.id}"` : 'null'}}]'::jsonb,
    false, (select versie from public.activiteiten where id = '${act}'))`,
});

/**
 * A voert zijn aanroep uit en houdt de lock vast; zodra de database laat zien dat A slaapt, voert B de zijne uit.
 * Geeft de foutmeldingen van A en B terug en hoe lang B heeft gewacht.
 */
async function tegelijk(a: Aanroep, b: Aanroep): Promise<{ foutA: string; foutB: string; duurB: number }> {
  const markering = `A_${crypto.randomUUID().slice(0, 8)}`;
  const proces = spawn('docker', PSQL, { stdio: ['pipe', 'ignore', 'pipe'] });
  let foutA = '';
  proces.stderr.on('data', (deel: Buffer) => {
    foutA += deel.toString();
  });
  const klaarA = new Promise<void>((klaar) => proces.on('close', () => klaar()));
  proces.stdin.write(`
    begin;
    select set_config('request.jwt.claims', '${claimsVan(a.lid)}', true);
    set local role authenticated;
    ${a.sql};
    select pg_sleep(${SLAAP}) /* ${markering} */;
    commit;
  `);
  proces.stdin.end();

  let slaapt = false;
  for (let poging = 0; poging < 100 && !slaapt; poging += 1) {
    slaapt =
      psql(
        `select count(*) from pg_stat_activity where state = 'active' and query like '%${markering}%' and pid <> pg_backend_pid();`,
      ).trim() === '1';
    if (!slaapt) await wacht(100);
  }
  expect(slaapt, `sessie A heeft zijn aanroep gedaan en houdt de lock vast (A: ${foutA})`).toBe(true);

  const begin = Date.now();
  let foutB = '';
  try {
    await uitvoeren(
      'docker',
      [
        ...PSQL,
        '-c',
        `begin; select set_config('request.jwt.claims', '${claimsVan(b.lid)}', true); set local role authenticated; ${b.sql}; commit;`,
      ],
      { encoding: 'utf8' },
    );
  } catch (uitzondering) {
    foutB = String((uitzondering as { stderr?: string }).stderr ?? uitzondering);
  }
  const duurB = Date.now() - begin;
  await klaarA;
  return { foutA, foutB, duurB };
}

test('twee afmeldingen tegelijk bij het minimum: de tweede ziet de afmelding van de eerste en wordt geweigerd', async () => {
  // In de eigen groep, dus precies de negen testleden aanwezig.
  const act = maakActiviteit({ doelgroep: true });
  // Deadline voorbij en het minimum één onder wat er nu aanwezig is: één afmelding mag, de tweede zou eronder komen.
  const n = Number(psql(`select intern.aantal_aanwezigen('${act}');`).trim());
  expect(n).toBe(alleLeden.length);
  psql(
    `update public.activiteiten set afmeld_deadline = timestamptz '2020-01-01', min_aanwezigen = ${n - 1} where id = '${act}';`,
  );
  const { foutA, foutB, duurB } = await tegelijk(meldAf(leden[0]!, act), meldAf(leden[1]!, act));
  expect(foutA).toBe('');
  // Zonder lock leest B ook n aanwezigen en meldt zich af: dan staat het aantal onder het minimum.
  expect(foutB).toContain('onder_ondergrens');
  expect(duurB, 'B moet op A hebben gewacht').toBeGreaterThan(1000);
  expect(afmeldingen(act, leden[0]!)).toBe('1');
  expect(afmeldingen(act, leden[1]!)).toBe('0');
});

test('hetzelfde lid twee keer tegelijk afmelden: de tweede geeft al_afgemeld, geen databasefout', async () => {
  const act = maakActiviteit();
  const { foutA, foutB } = await tegelijk(meldAf(leden[0]!, act), meldAf(leden[0]!, act));
  expect(foutA).toBe('');
  expect(foutB).toContain('al_afgemeld');
  expect(foutB).not.toContain('23505');
  expect(afmeldingen(act, leden[0]!)).toBe('1');
});

test('een vervanger die zich afmeldt terwijl hij wordt aangewezen: precies één slaagt', async () => {
  const act = maakActiviteit();
  const slot = maakSlot(act, leden[0]!);
  const { foutA, foutB } = await tegelijk(meldAf(leden[1]!, act), ruil(leden[0]!, slot, leden[1]!));
  expect(foutA).toBe('');
  expect(foutB).toContain('vervanger_afgemeld');
  // De eindtoestand: de vervanger is afgemeld, de dienst is niet naar hem gegaan.
  expect(afmeldingen(act, leden[1]!)).toBe('1');
  expect(bezetter(slot)).toBe(leden[0]!.id);
});

test('twee overdrachten naar dezelfde vervanger voor verschillende plekken: de tweede geeft dubbelboeking', async () => {
  const act = maakActiviteit();
  const slot1 = maakSlot(act, leden[0]!);
  const slot2 = maakSlot(act, leden[2]!);
  const { foutA, foutB } = await tegelijk(
    ruil(leden[0]!, slot1, leden[1]!),
    ruil(leden[2]!, slot2, leden[1]!),
  );
  expect(foutA).toBe('');
  expect(foutB).toContain('dubbelboeking');
  // De melding van de functie, niet die van het vangnet (de uitgestelde constraint geen_dubbelboeking bij de commit): zonder
  // lock zou B alleen daardoor worden tegengehouden.
  expect(foutB).not.toContain('constraint');
  expect(plekken(act, leden[1]!)).toBe('1');
  expect(bezetter(slot2)).toBe(leden[2]!.id);
});

test('twee overdrachten van dezelfde plek: de tweede ziet de nieuwe bezetter en geeft geen_bezetter', async () => {
  const act = maakActiviteit();
  const slot = maakSlot(act, leden[0]!);
  const { foutA, foutB } = await tegelijk(ruil(leden[0]!, slot, leden[1]!), ruil(leden[0]!, slot, leden[2]!));
  expect(foutA).toBe('');
  // Het slot wordt opnieuw gelezen na de lock: zonder dat zou B het slot nog van het lid zien en het aan de tweede geven.
  expect(foutB).toContain('geen_bezetter');
  expect(bezetter(slot)).toBe(leden[1]!.id);
  expect(plekken(act, leden[2]!)).toBe('0');
});

test('de beheerder deelt een plek opnieuw in terwijl het lid hem overdraagt: het lid ziet de nieuwe bezetter', async () => {
  const act = maakActiviteit();
  const slot = maakSlot(act, leden[0]!);
  const { foutA, foutB, duurB } = await tegelijk(
    toewijzen(act, slot, leden[3]!, leden[0]!),
    ruil(leden[0]!, slot, leden[1]!),
  );
  expect(foutA).toBe('');
  expect(foutB).toContain('geen_bezetter');
  expect(duurB, 'B moet op A hebben gewacht').toBeGreaterThan(1000);
  expect(bezetter(slot)).toBe(leden[3]!.id);
});

test('het lid draagt over terwijl de beheerder een open formulier heeft: slot_gewijzigd, niet versie_verouderd', async () => {
  const act = maakActiviteit();
  const slot = maakSlot(act, leden[0]!);
  const { foutA, foutB } = await tegelijk(
    ruil(leden[0]!, slot, leden[1]!),
    toewijzen(act, slot, leden[3]!, leden[0]!),
  );
  expect(foutA).toBe('');
  // De overdracht verhoogt de versie niet (Datamodel-fase-2.md besluit 1): de beheerder krijgt de melding van de plek, en
  // verliest de rest van zijn formulier niet.
  expect(foutB).toContain('slot_gewijzigd');
  expect(foutB).not.toContain('versie_verouderd');
  expect(bezetter(slot)).toBe(leden[1]!.id);
});

test('een overdracht naar een lid dat de beheerder net op een andere plek indeelt: dubbelboeking, één plek', async () => {
  const act = maakActiviteit();
  const slot = maakSlot(act, leden[0]!);
  const leeg = maakSlot(act, null);
  const { foutA, foutB } = await tegelijk(
    toewijzen(act, leeg, leden[1]!, null),
    ruil(leden[0]!, slot, leden[1]!),
  );
  expect(foutA).toBe('');
  expect(foutB).toContain('dubbelboeking');
  expect(foutB).not.toContain('constraint');
  expect(plekken(act, leden[1]!)).toBe('1');
  expect(bezetter(slot)).toBe(leden[0]!.id);
});

test('een afmelding tegen een indeling door de beheerder: nooit afgemeld én ingedeeld', async () => {
  // De beheerder deelt het lid in en A houdt de lock vast: de afmelding wacht en ziet dan de plek.
  const act1 = maakActiviteit();
  const leeg1 = maakSlot(act1, null);
  const eerste = await tegelijk(toewijzen(act1, leeg1, leden[1]!, null), meldAf(leden[1]!, act1));
  expect(eerste.foutA).toBe('');
  expect(eerste.foutB).toContain('heeft_ruilbare_rol');
  expect(afmeldingen(act1, leden[1]!)).toBe('0');
  expect(bezetter(leeg1)).toBe(leden[1]!.id);

  // Andersom: het lid meldt zich af en A houdt de lock vast: de indeling wacht en ziet de afmelding.
  const act2 = maakActiviteit();
  const leeg2 = maakSlot(act2, null);
  const tweede = await tegelijk(meldAf(leden[1]!, act2), toewijzen(act2, leeg2, leden[1]!, null));
  expect(tweede.foutA).toBe('');
  expect(tweede.foutB).toContain('lid_afgemeld');
  expect(afmeldingen(act2, leden[1]!)).toBe('1');
  expect(bezetter(leeg2)).toBe('(leeg)');
});

test('een lid draagt een plek in een concept over terwijl de beheerder het concept verwijdert: geen_bezetter', async () => {
  // De plek bestaat nog als B hem opzoekt en de activiteit niet meer als B de lock krijgt: slot en activiteit zijn dan weg.
  const act = maakActiviteit({ concept: true });
  const slot = maakSlot(act, leden[0]!);
  const { foutA, foutB, duurB } = await tegelijk(
    { lid: beheerder, sql: `select public.concept_verwijderen('${act}')` },
    ruil(leden[0]!, slot, leden[1]!),
  );
  expect(foutA).toBe('');
  expect(foutB).toContain('geen_bezetter');
  expect(duurB, 'B moet op A hebben gewacht').toBeGreaterThan(1000);
  expect(psql(`select count(*) from public.activiteiten where id = '${act}';`).trim()).toBe('0');
});
