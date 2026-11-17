-- Databasetests O-1: berichten per mail (migratie 20261117120000). De database zet berichten klaar in `berichten`; de
-- taken-Worker verstuurt ze (die test staat in taken/). Draaien met: npm run test:db. Alles in één transactie die wordt
-- teruggedraaid. Eigen namen ("T B ..." en "t_..").

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

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

-- Aantal berichten voor een lid over een activiteit, waarvan de tekst bij het patroon past.
create function pg_temp.aantal(p_act text, p_lid text, p_patroon text default '%') returns int
language sql
as $$
  select count(*)::int from public.berichten
   where activiteit_naam = p_act and lid_id = current_setting('test.' || p_lid)::uuid and tekst like p_patroon
$$;

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
update public.activiteiten set starttijd = null, eindtijd = null, locatie = null where naam = 'T B Open';
insert into public.rol_slots (activiteit_id, rol_type, bezetter_id)
values (current_setting('test.t_b_open')::uuid, 'werker', current_setting('test.t_anna')::uuid);
update public.activiteiten set locatie = 'Zaal', starttijd = time '20:00', eindtijd = time '23:00' where naam = 'T B Open';
select is(pg_temp.totaal('T B Open'), 0, 'een concept wijzigen en indelen geeft geen bericht');

update public.activiteiten set status = 'gepubliceerd' where naam = 'T B Open';
select is(pg_temp.aantal('T B Open', 't_anna', 'Je staat ingedeeld als werker.'), 1, 'publiceren: wie een plek heeft hoort het');
select is(pg_temp.totaal('T B Open'), 1, 'publiceren: alleen wie een plek heeft');

insert into public.afmeldingen (activiteit_id, lid_id) values
  (current_setting('test.t_b_open')::uuid, current_setting('test.t_fay')::uuid);

-- ===== Een veld wijzigen: alle leden die de activiteit zien en niet zijn afgemeld =====
update public.activiteiten set starttijd = time '19:30', locatie = 'Grote zaal' where naam = 'T B Open';
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
select is(pg_temp.totaal('T B Open'), 5, 'een notitie of een opslag zonder verschil geeft geen bericht');

-- Het type en het seizoen: nooit (BA-4).
update public.activiteiten set type = 'oud_papier' where naam = 'T B Open';
select is(pg_temp.totaal('T B Open'), 5, 'het type wijzigen geeft geen bericht');
update public.activiteiten set type = 'seizoen' where naam = 'T B Open';

-- ===== De wijziger zelf hoort het niet =====
select pg_temp.als('t_carla');
update public.activiteiten set eindtijd = time '23:30' where naam = 'T B Open';
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

-- ===== De doelgroep: wie de activiteit niet meer ziet, krijgt bericht =====
select pg_temp.act('T B Dames', '2099-06-02');
insert into public.activiteit_groep values (current_setting('test.t_b_dames')::uuid, current_setting('test.g_dames')::uuid);
-- Dames eruit, Raad van Elf erin, in één handeling: bert (alleen Dames) ziet hem niet meer, jan (ook Raad van Elf) wel.
delete from public.activiteit_groep where activiteit_id = current_setting('test.t_b_dames')::uuid;
insert into public.activiteit_groep values (current_setting('test.t_b_dames')::uuid, current_setting('test.g_raad')::uuid);
set constraints all immediate;
set constraints all deferred;
select is(pg_temp.aantal('T B Dames', 't_bert', 'Deze activiteit is niet meer voor jou%'), 1, 'andere doelgroep: wie hem niet meer ziet, hoort het');
select is(pg_temp.totaal('T B Dames'), 1, 'andere doelgroep: wie hem nog ziet, hoort niets');

-- Dezelfde groep eruit en er direct weer in: niemand verliest iets.
delete from public.activiteit_groep where activiteit_id = current_setting('test.t_b_dames')::uuid;
insert into public.activiteit_groep values (current_setting('test.t_b_dames')::uuid, current_setting('test.g_raad')::uuid);
set constraints all immediate;
set constraints all deferred;
select is(pg_temp.totaal('T B Dames'), 1, 'een groep eruit en er weer in geeft geen nieuw bericht');

-- ===== Verwijderen en afgelopen =====
select pg_temp.act('T B Weg', '2099-06-03', 'concept');
insert into public.rol_slots (activiteit_id, rol_type, bezetter_id)
values (current_setting('test.t_b_weg')::uuid, 'werker', current_setting('test.t_anna')::uuid);
update public.activiteiten set status = 'gepubliceerd' where naam = 'T B Weg';
select set_config('bk.verwijderen', current_setting('test.t_b_weg'), true);
delete from public.activiteiten where id = current_setting('test.t_b_weg')::uuid;
select set_config('bk.verwijderen', '', true);
select is(pg_temp.aantal('T B Weg', 't_anna', 'Deze activiteit gaat niet door%'), 1, 'verwijderen: wie een plek had, hoort het');
select is(pg_temp.aantal('T B Weg', 't_anna', 'Je staat niet meer%'), 0, 'verwijderen: niet ook nog "niet meer ingedeeld"');

select pg_temp.act('T B Geweest', '2020-01-01');
update public.activiteiten set locatie = 'Elders' where naam = 'T B Geweest';
select is(pg_temp.totaal('T B Geweest'), 0, 'een activiteit die al geweest is geeft geen bericht meer');

-- ===== Rechten =====
select ok(not has_table_privilege('authenticated', 'public.berichten', 'select')
          and not has_table_privilege('anon', 'public.berichten', 'select'),
  'ingelogd en niet ingelogd lezen de berichten niet');

select * from finish();
rollback;
