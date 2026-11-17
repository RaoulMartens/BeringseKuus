-- Databasetests O-1: berichten per mail (migratie 20261117120000). De database zet berichten klaar in `berichten`; de
-- taken-Worker verstuurt ze (die test staat in scripts/taken-berichten.test.ts). Draaien met: npm run test:db. Alles in één
-- transactie die wordt teruggedraaid. Eigen namen ("T B ..." en "t_..").
--
-- De berichten voor velden en doelgroep worden aan het einde van de transactie klaargezet (uitgestelde trigger). Een test is
-- één transactie, dus `pg_temp.vlak()` doet dat tussendoor: het sluit de lopende "transactie" af en begint een nieuwe.

begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- ===== Hulpen (alleen in deze transactie) =====
create temp table gebruikers (naam text primary key, uid uuid not null, lid uuid);

create function pg_temp.maak(p_naam text) returns void
language plpgsql
as $$
declare
  v_uid uuid := gen_random_uuid();
  v_lid uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_naam || '@example.com', now(), now());
  insert into public.leden (auth_user_id, voornaam, achternaam, type) values (v_uid, p_naam, 'Test', 'lid')
  returning id into v_lid;
  insert into public.leden_prive (lid_id, email) values (v_lid, p_naam || '@example.com');
  insert into pg_temp.gebruikers values (p_naam, v_uid, v_lid);
  perform set_config('test.' || p_naam, v_lid::text, true);
end
$$;

-- Wie de wijziger is (de tests draaien als postgres, met of zonder token).
create function pg_temp.als(p_naam text) returns void
language sql
as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', (select uid from pg_temp.gebruikers where naam = p_naam), 'role', 'authenticated')::text, true)
$$;

-- Verwerkt de uitgestelde triggers nu, en zet ze daarna weer uit: wat hierna gebeurt is een nieuwe "transactie".
create function pg_temp.vlak() returns void
language plpgsql
as $$
begin
  set constraints all immediate;
  set constraints all deferred;
end
$$;

create function pg_temp.act(p_naam text, p_datum date, p_status text default 'gepubliceerd') returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  insert into public.activiteiten (naam, datum, starttijd, eindtijd, locatie, status)
  values (p_naam, p_datum, time '20:00', time '23:00', 'De Kuus', p_status)
  returning id into v_id;
  perform set_config('test.' || replace(lower(p_naam), ' ', '_'), v_id::text, true);
  return v_id;
end
$$;

-- Aantal berichten voor een test-lid over een activiteit, waarvan de tekst bij het patroon past.
create function pg_temp.aantal(p_act text, p_lid text, p_patroon text default '%') returns int
language sql
as $$
  select count(*)::int from public.berichten
   where activiteit_naam = p_act and lid_id = current_setting('test.' || p_lid)::uuid and tekst like p_patroon
$$;

-- Alle berichten over een activiteit, alleen aan de test-leden (de lokale database heeft ook andere leden).
create function pg_temp.totaal(p_act text) returns int
language sql
as $$
  select count(*)::int from public.berichten b join public.leden l on l.id = b.lid_id
   where b.activiteit_naam = p_act and l.voornaam like 't\_%'
$$;

-- ===== Leden, groepen =====
select pg_temp.maak('t_anna');
select pg_temp.maak('t_bert');   -- Dames
select pg_temp.maak('t_carla');
select pg_temp.maak('t_fay');    -- afgemeld
select pg_temp.maak('t_gina');   -- inactief
select pg_temp.maak('t_hugo');   -- extern
select pg_temp.maak('t_boris');  -- beheeraccount
select pg_temp.maak('t_jan');    -- Dames en Raad van Elf
update public.leden set actief = false where id = current_setting('test.t_gina')::uuid;
update public.leden set type = 'extern', auth_user_id = null where id = current_setting('test.t_hugo')::uuid;
update public.leden set alleen_beheer = true where id = current_setting('test.t_boris')::uuid;
select set_config('test.g_dames', (select id::text from public.groepen where naam = 'Dames'), true);
select set_config('test.g_raad', (select id::text from public.groepen where naam = 'Raad van Elf'), true);
insert into public.lid_groep (lid_id, groep_id) values
  (current_setting('test.t_bert')::uuid, current_setting('test.g_dames')::uuid),
  (current_setting('test.t_jan')::uuid, current_setting('test.g_dames')::uuid),
  (current_setting('test.t_jan')::uuid, current_setting('test.g_raad')::uuid);

-- ===== Een concept stuurt niets (R18); publiceren meldt wie een plek heeft =====
select pg_temp.act('T B Open', '2099-06-01', 'concept');
insert into public.rol_slots (activiteit_id, rol_type, bezetter_id)
values (current_setting('test.t_b_open')::uuid, 'werker', current_setting('test.t_anna')::uuid);
select pg_temp.vlak();
select is(pg_temp.totaal('T B Open'), 0, 'een concept maken en indelen geeft geen bericht');
update public.activiteiten set locatie = 'Zaal' where naam = 'T B Open';
select pg_temp.vlak();
select is(pg_temp.totaal('T B Open'), 0, 'een concept wijzigen geeft geen bericht');

update public.activiteiten set status = 'gepubliceerd' where naam = 'T B Open';
select pg_temp.vlak();
select is(pg_temp.aantal('T B Open', 't_anna', 'Je staat ingedeeld als werker.'), 1, 'publiceren: wie een plek heeft hoort het');
select is(pg_temp.totaal('T B Open'), 1, 'publiceren: alleen wie een plek heeft');

insert into public.afmeldingen (activiteit_id, lid_id) values
  (current_setting('test.t_b_open')::uuid, current_setting('test.t_fay')::uuid);

-- ===== Een veld wijzigen: alle leden die de activiteit zien en niet zijn afgemeld =====
update public.activiteiten set starttijd = time '19:30', locatie = 'Grote zaal' where naam = 'T B Open';
select pg_temp.vlak();
select is(pg_temp.aantal('T B Open', 't_carla', E'Begint: nu 19:30 (was 20:00).%'), 1, 'een tijd wijzigen: een lid hoort het');
select ok((select tekst from public.berichten where lid_id = current_setting('test.t_carla')::uuid
            and tekst like 'Begint%') like '%Locatie: nu Grote zaal (was Zaal).', 'twee wijzigingen: samen in één bericht');
select is((select count(*)::int from public.berichten b join public.leden l on l.id = b.lid_id
            where b.activiteit_naam = 'T B Open' and b.tekst like 'Begint%' and l.voornaam like 't\_%'), 4,
  'vier leden horen het: anna, bert, carla en jan');
select is(pg_temp.aantal('T B Open', 't_fay', 'Begint%'), 0, 'wie is afgemeld hoort het niet');
select is(pg_temp.aantal('T B Open', 't_gina', 'Begint%'), 0, 'een inactief lid hoort het niet');
select is(pg_temp.aantal('T B Open', 't_boris', 'Begint%'), 0, 'het beheeraccount hoort het niet (telt niet als lid)');
select is((select count(*)::int from public.berichten where lid_id = current_setting('test.t_hugo')::uuid), 0,
  'een externe helper heeft geen adres en krijgt niets');

update public.activiteiten set notitie = 'Neem een jas mee' where naam = 'T B Open';
update public.activiteiten set naam = naam where naam = 'T B Open';
select pg_temp.vlak();
select is(pg_temp.totaal('T B Open'), 5, 'een notitie of een opslag zonder verschil geeft geen bericht');

-- Het type en het seizoen: nooit (BA-4).
update public.activiteiten set type = 'oud_papier' where naam = 'T B Open';
select pg_temp.vlak();
select is(pg_temp.totaal('T B Open'), 5, 'het type wijzigen geeft geen bericht');
update public.activiteiten set type = 'seizoen' where naam = 'T B Open';
select pg_temp.vlak();

-- Meerdere wijzigingen in één transactie: de beginsituatie is die van voor de eerste (geen tussenstanden).
update public.activiteiten set eindtijd = time '23:15' where naam = 'T B Open';
update public.activiteiten set eindtijd = time '23:00' where naam = 'T B Open';
select pg_temp.vlak();
select is(pg_temp.totaal('T B Open'), 5, 'iets wijzigen en terugzetten in één opslag geeft geen bericht');

-- ===== De wijziger zelf hoort het niet =====
select pg_temp.als('t_carla');
update public.activiteiten set eindtijd = time '23:30' where naam = 'T B Open';
select pg_temp.vlak();
select is(pg_temp.aantal('T B Open', 't_carla', 'Is afgelopen%'), 0, 'de wijziger zelf krijgt geen bericht');
select is(pg_temp.aantal('T B Open', 't_bert', 'Is afgelopen%'), 1, 'de anderen wel');
reset request.jwt.claims;

-- ===== Een plek =====
update public.rol_slots set bezetter_id = current_setting('test.t_carla')::uuid
 where activiteit_id = current_setting('test.t_b_open')::uuid and rol_type = 'werker';
select is(pg_temp.aantal('T B Open', 't_anna', 'Je staat niet meer ingedeeld als werker.'), 1, 'vervangen: de oude bezetter hoort het');
select is(pg_temp.aantal('T B Open', 't_carla', 'Je staat ingedeeld als werker.'), 1, 'vervangen: de nieuwe bezetter ook');
update public.rol_slots set bezetter_id = null
 where activiteit_id = current_setting('test.t_b_open')::uuid and rol_type = 'werker';
select is(pg_temp.aantal('T B Open', 't_carla', 'Je staat niet meer ingedeeld als werker.'), 1, 'eraf gehaald: dat lid hoort het');

-- ===== De doelgroep =====
-- B-01: een concept krijgt een andere doelgroep en wordt in dezelfde opslag gepubliceerd: wie het concept nooit mocht zien,
-- hoort niets.
select pg_temp.act('T B Conc', '2099-06-04', 'concept');
insert into public.activiteit_groep values (current_setting('test.t_b_conc')::uuid, current_setting('test.g_dames')::uuid);
select pg_temp.vlak();
delete from public.activiteit_groep where activiteit_id = current_setting('test.t_b_conc')::uuid;
insert into public.activiteit_groep values (current_setting('test.t_b_conc')::uuid, current_setting('test.g_raad')::uuid);
update public.activiteiten set status = 'gepubliceerd' where naam = 'T B Conc';
select pg_temp.vlak();
select is(pg_temp.totaal('T B Conc'), 0, 'een concept van doelgroep wisselen en publiceren geeft niemand een verliesbericht');

-- B-02: een gepubliceerde activiteit krijgt een andere locatie en doelgroep tegelijk: de ontvangers van de locatie volgen de
-- nieuwe doelgroep; wie hem niet meer ziet krijgt alleen het verliesbericht.
select pg_temp.act('T B Veld', '2099-06-05');
insert into public.activiteit_groep values (current_setting('test.t_b_veld')::uuid, current_setting('test.g_dames')::uuid);
select pg_temp.vlak();
update public.activiteiten set locatie = 'Elders' where naam = 'T B Veld';
delete from public.activiteit_groep where activiteit_id = current_setting('test.t_b_veld')::uuid;
insert into public.activiteit_groep values (current_setting('test.t_b_veld')::uuid, current_setting('test.g_raad')::uuid);
select pg_temp.vlak();
select is(pg_temp.aantal('T B Veld', 't_jan', 'Locatie: nu Elders%'), 1, 'locatie en doelgroep tegelijk: wie hem nog ziet hoort de locatie');
select is(pg_temp.aantal('T B Veld', 't_bert', 'Deze activiteit is niet meer voor jou%'), 1, 'locatie en doelgroep tegelijk: wie hem niet meer ziet hoort dat');
select is(pg_temp.aantal('T B Veld', 't_bert', 'Locatie%'), 0, 'en krijgt de nieuwe locatie niet te horen');
select is(pg_temp.totaal('T B Veld'), 2, 'wie hem ook voorheen niet zag (carla) hoort niets');

-- B-03: van "iedereen" (geen groepen) naar één groep.
select pg_temp.act('T B Iedereen', '2099-06-06');
select pg_temp.vlak();
insert into public.activiteit_groep values (current_setting('test.t_b_iedereen')::uuid, current_setting('test.g_raad')::uuid);
select pg_temp.vlak();
select is(pg_temp.aantal('T B Iedereen', 't_carla', 'Deze activiteit is niet meer voor jou%'), 1, 'van iedereen naar een groep: wie er niet in zit hoort het');
select is(pg_temp.aantal('T B Iedereen', 't_bert', 'Deze activiteit is niet meer voor jou%'), 1, 'ook een lid van een andere groep');
select is(pg_temp.aantal('T B Iedereen', 't_jan', '%'), 0, 'wie in de groep zit hoort niets');

-- Een groep eruit en er direct weer in: niemand verliest iets.
delete from public.activiteit_groep where activiteit_id = current_setting('test.t_b_iedereen')::uuid;
insert into public.activiteit_groep values (current_setting('test.t_b_iedereen')::uuid, current_setting('test.g_raad')::uuid);
select pg_temp.vlak();
select is(pg_temp.totaal('T B Iedereen'), 4, 'een groep eruit en er weer in geeft geen nieuw bericht');

-- Alle groepen eruit: iedereen ziet hem, niemand verliest iets.
delete from public.activiteit_groep where activiteit_id = current_setting('test.t_b_iedereen')::uuid;
select pg_temp.vlak();
select is(pg_temp.totaal('T B Iedereen'), 4, 'alle groepen eruit geeft geen bericht');

-- ===== Een nieuwe activiteit in dezelfde transactie geeft niets =====
select pg_temp.act('T B Nieuw', '2099-06-07');
insert into public.activiteit_groep values (current_setting('test.t_b_nieuw')::uuid, current_setting('test.g_dames')::uuid);
update public.activiteiten set locatie = 'Anders' where naam = 'T B Nieuw';
select pg_temp.vlak();
select is(pg_temp.totaal('T B Nieuw'), 0, 'een activiteit die in dezelfde transactie is aangemaakt geeft geen bericht');

-- ===== Verwijderen en afgelopen =====
select pg_temp.act('T B Weg', '2099-06-03', 'concept');
insert into public.rol_slots (activiteit_id, rol_type, bezetter_id)
values (current_setting('test.t_b_weg')::uuid, 'werker', current_setting('test.t_anna')::uuid);
insert into public.activiteit_groep values (current_setting('test.t_b_weg')::uuid, current_setting('test.g_raad')::uuid);
select pg_temp.vlak();
update public.activiteiten set status = 'gepubliceerd' where naam = 'T B Weg';
select pg_temp.vlak();
select set_config('bk.verwijderen', current_setting('test.t_b_weg'), true);
delete from public.activiteiten where id = current_setting('test.t_b_weg')::uuid;
select set_config('bk.verwijderen', '', true);
select pg_temp.vlak();
select is(pg_temp.aantal('T B Weg', 't_anna', 'Deze activiteit gaat niet door%'), 1, 'verwijderen: wie een plek had, hoort het');
select is(pg_temp.totaal('T B Weg'), 2, 'verwijderen met een doelgroep: verder geen berichten (ingedeeld en gaat niet door)');
select is((select count(*)::int from public.berichten_voor where txid = txid_current()), 0, 'de beginsituaties zijn na de transactie opgeruimd');

select pg_temp.act('T B Geweest', '2020-01-01');
select pg_temp.vlak();
update public.activiteiten set locatie = 'Elders' where naam = 'T B Geweest';
select pg_temp.vlak();
select is(pg_temp.totaal('T B Geweest'), 0, 'een activiteit die al geweest is geeft geen bericht meer');

-- ===== Oppakken door de Worker (claim_berichten) =====
-- Een te oud bericht en een bericht dat al vijf keer is geprobeerd.
insert into public.berichten (lid_id, activiteit_naam, activiteit_datum, tekst, aangemaakt)
values (current_setting('test.t_anna')::uuid, 'T B Oud', date '2099-01-01', 'Oud.', now() - interval '25 hours');
insert into public.berichten (lid_id, activiteit_naam, activiteit_datum, tekst, pogingen)
values (current_setting('test.t_anna')::uuid, 'T B Vaak', date '2099-01-01', 'Vaak.', 5);

create temp table geclaimd as select * from public.claim_berichten(1);
select is((select count(distinct lid_id)::int from geclaimd), 1, 'claim: één groep, dus één lid');
select is((select count(distinct coalesce(activiteit_id::text, activiteit_naam))::int from geclaimd), 1, 'claim: en één activiteit');
select is((select count(*)::int from public.berichten b, (select lid_id, activiteit_id from geclaimd limit 1) g
            where b.lid_id = g.lid_id and b.activiteit_id is not distinct from g.activiteit_id
              and b.status = 'wacht' and b.claim_tot is null), 0,
  'claim: de groep is compleet (alle berichten van dat lid over die activiteit, zodat het één mail kan zijn)');
select ok((select bool_and(pogingen = 1 and claim_tot > clock_timestamp()) from geclaimd),
  'claim: het aantal pogingen telt vóór het versturen, en het bericht is vergrendeld');

create temp table tweede as select * from public.claim_berichten(1000);
select is((select count(*)::int from tweede t join geclaimd g on g.id = t.id), 0, 'een tweede claim pakt wat al is opgepakt niet nog eens');
select is((select status || '/' || fout from public.berichten where activiteit_naam = 'T B Oud'), 'mislukt/verlopen',
  'claim: een bericht ouder dan 24 uur wordt niet meer verstuurd');
select is((select status || '/' || fout from public.berichten where activiteit_naam = 'T B Vaak'), 'mislukt/te_veel_pogingen',
  'claim: na vijf pogingen geven we op');

-- ===== Rechten =====
select ok(not has_table_privilege('authenticated', 'public.berichten', 'select')
          and not has_table_privilege('anon', 'public.berichten', 'select')
          and not has_table_privilege('authenticated', 'public.berichten_voor', 'select'),
  'ingelogd en niet ingelogd lezen de berichten niet');
select ok(not has_function_privilege('authenticated', 'public.claim_berichten(int, int)', 'execute')
          and not has_function_privilege('anon', 'public.claim_berichten(int, int)', 'execute')
          and has_function_privilege('service_role', 'public.claim_berichten(int, int)', 'execute'),
  'alleen service_role mag berichten oppakken');

select * from finish();
rollback;
