-- Databasetests fase 1: wie ziet en doet wat (docs/bouw/Datamodel-fase-1.md punt 9: "Wie is lid", "Beheer",
-- "Rechten op tabellen", "Kolommen", "Vangnet"). Draaien met: npm run test:db. Alles in één transactie die wordt
-- teruggedraaid. De tests tellen alleen wat ze zelf maken (namen die met "T " beginnen, leden die met "t_" beginnen):
-- ze hangen niet af van de seed.

begin;
create extension if not exists pgtap with schema extensions;
select plan(68);

-- Gebruikers en leden, als postgres. De naam is de sleutel in de tests.
create temp table gebruikers (naam text primary key, uid uuid not null, lid uuid);

create function pg_temp.maak(
  p_naam text, p_actief boolean default true, p_admin boolean default false, p_met_lid boolean default true,
  p_factor_na boolean default false, p_factor text default 'verified'
) returns void
language plpgsql
as $$
declare
  v_uid uuid := gen_random_uuid();
  v_lid uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_naam || '@example.com', now(), now());
  if p_met_lid then
    insert into public.leden (auth_user_id, voornaam, achternaam, type, actief)
    values (v_uid, p_naam, 'Test', 'lid', p_actief) returning id into v_lid;
    insert into public.leden_prive (lid_id, email, is_admin, beheerder_sinds)
    values (v_lid, p_naam || '@example.com', p_admin, case when p_admin then timestamptz '2026-06-01' end);
    if p_admin and p_factor <> 'geen' then
      -- Een factor van vóór beheerder_sinds: geverifieerd, of (p_factor = 'unverified') niet.
      insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
      values (gen_random_uuid(), v_uid, 'totp', p_factor::auth.factor_status, timestamptz '2026-05-01', timestamptz '2026-05-01');
    end if;
    if p_factor_na then
      -- Een tweede geverifieerde factor van ná beheerder_sinds (DM-25).
      insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
      values (gen_random_uuid(), v_uid, 'totp', 'verified', timestamptz '2026-08-01', timestamptz '2026-08-01');
    end if;
  end if;
  insert into pg_temp.gebruikers values (p_naam, v_uid, v_lid);
end
$$;

-- De claims van een sessie; aanroepen als postgres, daarna `set local role authenticated`.
create function pg_temp.als(p_naam text, p_aal text default 'aal1') returns void
language sql
as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', (select uid from pg_temp.gebruikers where naam = p_naam),
                      'role', 'authenticated', 'aal', p_aal)::text, true)
$$;

select pg_temp.maak('t_mark', p_admin => true);
select pg_temp.maak('t_truus');
select pg_temp.maak('t_ton');
select pg_temp.maak('t_geen', p_met_lid => false);
select pg_temp.maak('t_weg', p_actief => false);
select pg_temp.maak('t_els', p_admin => true, p_factor_na => true);
select pg_temp.maak('t_piet', p_admin => true);
select pg_temp.maak('t_oud', p_actief => false, p_admin => true);
select pg_temp.maak('t_zonder', p_admin => true, p_factor => 'geen');
select pg_temp.maak('t_onverif', p_admin => true, p_factor => 'unverified');
-- Een sessie met een sub die in geen enkele tabel voorkomt.
insert into pg_temp.gebruikers values ('t_onbekend', gen_random_uuid(), null);

-- Truus zit in twee groepen (Dames en Raad van Elf), Ton in Bestuur, Mark in geen.
insert into public.lid_groep (lid_id, groep_id)
select (select lid from pg_temp.gebruikers where naam = 't_truus'), id from public.groepen where naam in ('Dames', 'Raad van Elf');
insert into public.lid_groep (lid_id, groep_id)
select (select lid from pg_temp.gebruikers where naam = 't_ton'), id from public.groepen where naam = 'Bestuur';

-- Activiteiten: een concept, een gepubliceerde voor iedereen, een voor Bestuur, een geannuleerde, en een voor Dames en
-- een voor de Raad van Elf. Ver in de toekomst, zodat de seed en de datum van vandaag er niets mee te maken hebben.
insert into public.activiteiten (naam, datum, starttijd, eindtijd, locatie, status) values
  ('T Concept', '2099-03-01', null, null, null, 'concept'),
  ('T Gepubliceerd', '2099-03-02', '20:00', '23:00', 'De Kuus', 'gepubliceerd'),
  ('T Bestuur', '2099-03-03', '20:00', '23:00', 'De Kuus', 'gepubliceerd'),
  ('T Geannuleerd', '2099-03-04', '20:00', '23:00', 'De Kuus', 'geannuleerd'),
  ('T Dames', '2099-03-05', '20:00', '23:00', 'De Kuus', 'gepubliceerd'),
  ('T Raad', '2099-03-06', '20:00', '23:00', 'De Kuus', 'gepubliceerd');
insert into public.activiteit_groep (activiteit_id, groep_id)
select a.id, g.id from public.activiteiten a join public.groepen g
  on (a.naam, g.naam) in (('T Bestuur', 'Bestuur'), ('T Dames', 'Dames'), ('T Raad', 'Raad van Elf'));

-- Plekken: één bezet door Truus en één leeg bij T Gepubliceerd; één leeg bij het concept.
insert into public.rol_slots (activiteit_id, rol_type, bezetter_id)
select a.id, 'werker', (select lid from pg_temp.gebruikers where naam = 't_truus')
  from public.activiteiten a where a.naam = 'T Gepubliceerd';
insert into public.rol_slots (activiteit_id, rol_type)
select a.id, 'werker' from public.activiteiten a where a.naam in ('T Gepubliceerd', 'T Concept');

-- Twee afmeldingen bij T Gepubliceerd: Truus en Ton.
insert into public.afmeldingen (activiteit_id, lid_id, toelichting)
select a.id, g.lid, 'privé' from public.activiteiten a, pg_temp.gebruikers g
 where a.naam = 'T Gepubliceerd' and g.naam in ('t_truus', 't_ton');
insert into public.wijzigingen_log (actie, tabel, omschrijving) values ('test', 'activiteiten', 'T logregel');

-- ===== Wie is lid (DM-02, DM-20): wie geen actief lid is, leest niets =====
select pg_temp.als('t_geen');
set local role authenticated;
select is((select count(*)::int from public.leden), 0, 'ingelogd zonder lid: leest geen leden');
select is((select count(*)::int from public.activiteiten where naam like 'T %'), 0,
  'ingelogd zonder lid: ziet ook geen activiteit voor iedereen (DM-20)');
select is((select count(*)::int from public.mijn_activiteiten where naam like 'T %'), 0,
  'ingelogd zonder lid: ziet niets in mijn_activiteiten (DM-20)');
select is((select count(*)::int from public.verenigingsinstellingen), 0, 'ingelogd zonder lid: leest de instellingen niet');
select is((select count(*)::int from public.groepen) + (select count(*)::int from public.roltypen)
         + (select count(*)::int from public.verenigingen), 0,
  'ingelogd zonder lid: leest ook groepen, roltypen en verenigingen niet');
select throws_ok($$ select public.activiteit_opslaan(null, '{"naam": "Nee", "datum": "2099-01-01"}', '[]') $$,
  'BK001', 'geen_admin', 'ingelogd zonder lid: activiteit_opslaan geeft geen_admin');
select throws_ok($$ select public.concept_verwijderen(gen_random_uuid()) $$,
  'BK001', 'geen_admin', 'ingelogd zonder lid: concept_verwijderen geeft geen_admin, ook voor een onbekend id');
select throws_ok($$ select * from public.beheeroverzicht() $$,
  'BK001', 'geen_admin', 'ingelogd zonder lid: beheeroverzicht geeft geen_admin');

reset role;
select pg_temp.als('t_weg');
set local role authenticated;
select is((select count(*)::int from public.leden), 0, 'inactief lid met een geldige sessie: leest niets');

reset role;
select pg_temp.als('t_onbekend');
set local role authenticated;
select is((select count(*)::int from public.leden) + (select count(*)::int from public.activiteiten), 0,
  'een sub die niet bestaat: leest niets');

reset role;
select pg_temp.als('t_oud', 'aal2');
set local role authenticated;
select is((select count(*)::int from public.leden), 0, 'beheerder die inactief is gezet: leest niets');
select throws_ok($$ select * from public.beheeroverzicht() $$, 'BK001', 'geen_admin',
  'beheerder die inactief is gezet: geen beheer');

-- ===== Een lid (Truus: Dames en Raad van Elf, aal1) =====
reset role;
select pg_temp.als('t_truus');
set local role authenticated;
select is((select count(*)::int from public.activiteiten where naam = 'T Concept'), 0, 'lid: ziet geen concept (R15)');
select is((select count(*)::int from public.activiteiten where naam = 'T Bestuur'), 0,
  'lid: ziet de activiteit van een groep waar hij niet in zit niet (R22)');
select is((select count(*)::int from public.activiteiten where naam = 'T Geannuleerd'), 1, 'lid: ziet een geannuleerde activiteit');
select is((select count(*)::int from public.activiteiten where naam = 'T Gepubliceerd'), 1, 'lid: ziet een activiteit voor iedereen');
select is((select count(*)::int from public.activiteiten where naam in ('T Dames', 'T Raad')), 2,
  'lid in twee groepen: ziet de activiteit van elk van beide');
select is((select count(*)::int from public.rol_slots where activiteit_id = (select id from public.activiteiten where naam = 'T Gepubliceerd')), 1,
  'lid: ziet alleen de bezette plek, geen lege (R13)');
select is((select count(*)::int from public.rol_slots), (select count(*)::int from public.rol_slots where bezetter_id is not null),
  'lid: ziet geen enkele lege plek');
select is((select count(*)::int from public.leden_prive), 1, 'lid: leest alleen zijn eigen leden_prive');
select is((select count(*)::int from public.afmeldingen), 1, 'lid: ziet alleen zijn eigen afmelding, niet die van Ton');
select is((select count(*)::int from public.wijzigingen_log), 0, 'lid: leest de auditlog niet');
select is((select count(*)::int from public.lid_groep), 2, 'lid: leest alleen zijn eigen groepen');
select is((select count(*)::int from public.leden where voornaam like 't\_%'), 9,
  'lid: leest alle leden, met een kolomlijst');
select throws_ok('select * from public.leden', '42501', null,
  'lid: select * op leden geeft een fout; leden lees je met een kolomlijst (DM-10)');
select is((select count(*)::int from public.verenigingsinstellingen), 1, 'lid: leest de instellingen van de vereniging');
select is((select count(*)::int from public.activiteit_groep where activiteit_id = (select id from public.activiteiten where naam = 'T Bestuur')), 0,
  'lid: ziet de doelgroep van een verborgen activiteit niet');

-- ===== Een bestuurslid dat geen beheerder is (Ton: groep Bestuur, geen is_admin, aal2) =====
reset role;
select pg_temp.als('t_ton', 'aal2');
set local role authenticated;
select is((select count(*)::int from public.activiteiten where naam = 'T Bestuur'), 1, 'groep Bestuur: ziet de bestuursactiviteit');
select is((select count(*)::int from public.activiteit_groep where activiteit_id = (select id from public.activiteiten where naam = 'T Bestuur')), 1,
  'groep Bestuur: ziet de doelgroep van die activiteit');
select throws_ok($$ select public.activiteit_opslaan(null, '{"naam": "Nee", "datum": "2099-01-01"}', '[]') $$,
  'BK001', 'geen_admin', 'groep Bestuur geeft geen beheerrechten, ook niet met aal2 (V8 12)');

-- ===== Een beheerder (Mark: is_admin, factor van vóór beheerder_sinds, aal2) =====
reset role;
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is((select count(*)::int from public.activiteiten where naam like 'T %'), 6, 'beheerder: ziet alle activiteiten, ook het concept');
select is((select count(*)::int from public.rol_slots where activiteit_id = (select id from public.activiteiten where naam = 'T Gepubliceerd')), 2,
  'beheerder: ziet ook de lege plek');
select is((select count(*)::int from public.mijn_activiteiten where naam = 'T Concept'), 0,
  'beheerder: ziet in mijn_activiteiten (het welkomscherm) geen concept (DM-03)');
select is((select count(*)::int from public.mijn_activiteiten where naam like 'T %'), 2,
  'beheerder: ziet in mijn_activiteiten alleen wat een lid zou zien: geen groepsactiviteit waar hij niet in zit (DM-03)');
select is((select count(*)::int from public.wijzigingen_log where omschrijving = 'T logregel'), 1, 'beheerder: leest de auditlog');
select is((select count(*)::int from public.leden_prive where email like 't\_%@example.com'), 9, 'beheerder: leest alle leden_prive');
select is((select count(*)::int from public.afmeldingen where activiteit_id = (select id from public.activiteiten where naam = 'T Gepubliceerd')), 2,
  'beheerder: ziet alle afmeldingen');
select lives_ok($$ select * from public.beheeroverzicht() $$, 'beheerder: beheeroverzicht werkt');

-- ===== Wanneer een beheerder geen beheerder is =====
reset role;
select pg_temp.als('t_mark', 'aal1');
set local role authenticated;
select throws_ok($$ select * from public.beheeroverzicht() $$, 'BK001', 'geen_admin',
  'beheerder zonder aal2 (alleen de inloglink): geen beheer (Bouwbesluiten 4.3)');

reset role;
select pg_temp.als('t_zonder', 'aal2');
set local role authenticated;
select throws_ok($$ select * from public.beheeroverzicht() $$, 'BK001', 'geen_admin',
  'is_admin en aal2 maar geen enkele factor: geen beheer');
reset role;
select pg_temp.als('t_onverif', 'aal2');
set local role authenticated;
select throws_ok($$ select * from public.beheeroverzicht() $$, 'BK001', 'geen_admin',
  'is_admin en aal2 maar alleen een niet-geverifieerde factor: geen beheer');
reset role;
select pg_temp.als('t_mark', null);
set local role authenticated;
select throws_ok($$ select * from public.beheeroverzicht() $$, 'BK001', 'geen_admin',
  'een token zonder aal-claim: geen beheer');

reset role;
select pg_temp.als('t_els', 'aal2');
set local role authenticated;
select throws_ok($$ select * from public.beheeroverzicht() $$, 'BK001', 'geen_admin',
  'een factor van ná beheerder_sinds, ook met een oudere factor erbij: geen beheer (DM-25)');
reset role;
update public.leden_prive set beheerder_sinds = timestamptz '2026-09-01'
 where lid_id = (select lid from pg_temp.gebruikers where naam = 't_els');
select pg_temp.als('t_els', 'aal2');
set local role authenticated;
select lives_ok($$ select * from public.beheeroverzicht() $$,
  'beheerder_sinds opnieuw gezet door een andere beheerder: weer beheerder');

reset role;
select pg_temp.als('t_piet', 'aal2');
set local role authenticated;
select lives_ok($$ select * from public.beheeroverzicht() $$, 'beheerder: werkt vóór het intrekken');
reset role;
update public.leden_prive set is_admin = false where lid_id = (select lid from pg_temp.gebruikers where naam = 't_piet');
select pg_temp.als('t_piet', 'aal2');
set local role authenticated;
select throws_ok($$ select * from public.beheeroverzicht() $$, 'BK001', 'geen_admin',
  'is_admin ingetrokken in dezelfde sessie: direct geen beheer');
select is((select count(*)::int from public.activiteiten where naam = 'T Concept'), 0,
  'is_admin ingetrokken: ziet het concept direct niet meer');

-- ===== Kolommen en structuur, als postgres =====
reset role;
select ok(not has_column_privilege('authenticated', 'public.leden', 'auth_user_id', 'select'),
  'authenticated leest leden.auth_user_id niet');
select ok(not has_column_privilege('authenticated', 'public.leden', 'vereniging_id', 'select'),
  'authenticated leest leden.vereniging_id niet');
select ok(not has_column_privilege('authenticated', 'public.leden', 'aangemaakt', 'select'),
  'authenticated leest leden.aangemaakt niet');
select ok(not has_column_privilege('authenticated', 'public.activiteiten', 'bron_activiteit_id', 'select')
      and not has_column_privilege('authenticated', 'public.activiteiten', 'vereniging_id', 'select')
      and has_column_privilege('authenticated', 'public.activiteiten', 'naam', 'select'),
  'authenticated leest van activiteiten geen bron_activiteit_id en vereniging_id (PR22-13)');
select ok(has_column_privilege('authenticated', 'public.leden', 'voornaam', 'select')
      and not has_table_privilege('authenticated', 'public.leden', 'select'),
  'authenticated leest van leden alleen kolommen, geen tabelbrede select (DM-10)');

-- Elke tabel in public heeft vereniging_id of staat op de lijst "afgeleid via een ouder" of "gedeeld" (2.10).
select is_empty(
  $$ select t.tablename::text
       from pg_tables t
      where t.schemaname = 'public'
        and not exists (select 1 from information_schema.columns c
                         where c.table_schema = 'public' and c.table_name = t.tablename and c.column_name = 'vereniging_id')
        and t.tablename <> all (array['leden_prive', 'lid_groep', 'rol_slots', 'afmeldingen', 'activiteit_groep',
                                      'verenigingen', 'roltypen']) $$,
  'elke tabel heeft vereniging_id of staat op de lijst afgeleid of gedeeld'
);
select is_empty(
  $$ select l.id from public.leden l left join public.leden_prive p on p.lid_id = l.id where p.lid_id is null $$,
  'elk lid heeft precies één leden_prive-rij');
select throws_ok(
  $$ insert into public.leden (auth_user_id, voornaam, achternaam, type)
     values ((select uid from pg_temp.gebruikers where naam = 't_geen'), 'Hulp', 'Extern', 'extern') $$,
  '23514', null, 'een externe helper heeft geen inlogaccount');

-- Dubbelboeking en de ene eindverantwoordelijke (het vangnet van de database).
set constraints public.geen_dubbelboeking immediate;
select throws_ok(
  $$ insert into public.rol_slots (activiteit_id, rol_type, bezetter_id)
     select activiteit_id, 'drankhaler', bezetter_id from public.rol_slots where bezetter_id is not null limit 1 $$,
  '23505', null, 'hetzelfde lid twee keer op één activiteit: de database weigert (R6, R20)');
insert into public.rol_slots (activiteit_id, rol_type)
select id, 'eindverantwoordelijke' from public.activiteiten where naam = 'T Gepubliceerd';
select throws_ok(
  $$ insert into public.rol_slots (activiteit_id, rol_type)
     select id, 'eindverantwoordelijke' from public.activiteiten where naam = 'T Gepubliceerd' $$,
  '23505', null, 'hooguit één eindverantwoordelijke per activiteit');
select throws_ok(
  $$ update public.activiteiten set status = 'gepubliceerd' where naam = 'T Concept' $$,
  '23514', null, 'publiceren zonder starttijd, eindtijd en locatie weigert de database (vangnet)');

-- ===== Het vangnet voor wie buiten de functies om schrijft (DM-14, DM-23) =====
select throws_ok(
  $$ update public.activiteiten set status = 'concept' where naam = 'T Gepubliceerd' $$,
  'P0001', 'vangnet_status', 'een gepubliceerde activiteit gaat niet terug naar concept, ook niet als postgres');
select throws_ok(
  $$ delete from public.activiteiten where naam = 'T Gepubliceerd' $$,
  'P0001', 'vangnet_alleen_concept', 'een gepubliceerde activiteit verwijderen kan niet, ook niet als postgres');

-- bijgewerkt verandert alleen als een veld verandert dat leden zien (DM-24).
select set_config('test.bijgewerkt', (select bijgewerkt::text from public.activiteiten where naam = 'T Concept'), true);
update public.activiteiten set bron_activiteit_id = (select id from public.activiteiten where naam = 'T Gepubliceerd')
 where naam = 'T Concept';
select is((select bijgewerkt::text from public.activiteiten where naam = 'T Concept'), current_setting('test.bijgewerkt'),
  'bijgewerkt blijft staan als alleen de bronverwijzing verandert');
update public.activiteiten set notitie = 'nieuw' where naam = 'T Concept';
select isnt((select bijgewerkt::text from public.activiteiten where naam = 'T Concept'), current_setting('test.bijgewerkt'),
  'bijgewerkt verandert als een zichtbaar veld verandert');

-- ===== service_role en beheerder_sinds (PR22-07, PR22-08) =====
select is_empty(
  $$ select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege('service_role', c.oid, 'truncate') $$,
  'service_role mag geen enkele tabel leegmaken (truncate slaat de triggers over)');
select ok(not has_table_privilege('service_role', 'public.wijzigingen_log', 'update')
      and not has_table_privilege('service_role', 'public.wijzigingen_log', 'delete'),
  'service_role mag de auditlog niet wijzigen of wissen');
set local role service_role;
select lives_ok($$ insert into public.activiteiten (naam, datum) values ('T Service', '2099-07-01') $$,
  'service_role kan een activiteit invoegen: de gegenereerde kolommen werken met zijn rechten (DM-22)');
reset role;

update public.leden_prive set is_admin = true where lid_id = (select lid from pg_temp.gebruikers where naam = 't_truus');
select isnt((select beheerder_sinds from public.leden_prive where lid_id = (select lid from pg_temp.gebruikers where naam = 't_truus')), null,
  'is_admin aanzetten zet beheerder_sinds op het moment van nu');
update public.leden_prive set is_admin = false where lid_id = (select lid from pg_temp.gebruikers where naam = 't_truus');
select is((select beheerder_sinds from public.leden_prive where lid_id = (select lid from pg_temp.gebruikers where naam = 't_truus')), null,
  'is_admin uitzetten maakt beheerder_sinds leeg');

-- Een concept kan direct geannuleerd worden, ook zonder tijden (V8 5.4); alleen publiceren eist ze.
insert into public.activiteiten (naam, datum) values ('T Annuleer', '2099-08-01');
select lives_ok($$ update public.activiteiten set status = 'geannuleerd' where naam = 'T Annuleer' $$,
  'een concept zonder tijden kan direct geannuleerd worden');

select * from finish();
rollback;
