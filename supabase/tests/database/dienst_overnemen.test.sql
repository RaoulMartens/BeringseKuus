-- Databasetests voor een dienst overnemen (migratie 20261127140000): wie het mag, wat niet kan, en dat de plek in één stap van eigenaar wisselt. Draaien met: npm run test:db.
-- Alleen eigen namen ("T ...").


begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ===== Hulpen (alleen in deze transactie) =====
create temp table gebruikers (naam text primary key, uid uuid not null, lid uuid);

create function pg_temp.maak(p_naam text, p_admin boolean default false) returns void
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
  insert into public.leden_prive (lid_id, email, is_admin, beheerder_sinds)
  values (v_lid, p_naam || '@example.com', p_admin, case when p_admin then timestamptz '2026-06-01' end);
  if p_admin then
    insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
    values (gen_random_uuid(), v_uid, 'totp', 'verified', timestamptz '2026-05-01', timestamptz '2026-05-01');
  end if;
  insert into pg_temp.gebruikers values (p_naam, v_uid, v_lid);
end
$$;

create function pg_temp.als(p_naam text, p_aal text default 'aal1') returns void
language sql
as $$
  select set_config('request.jwt.claims',
    (json_build_object('sub', (select uid from pg_temp.gebruikers where naam = p_naam),
                       'role', 'authenticated', 'aal', p_aal)::jsonb
     || jsonb_build_object('amr',
          jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint))
          || case when p_aal = 'aal2'
                  then jsonb_build_array(jsonb_build_object('method', 'totp',
                         'timestamp', extract(epoch from now() - interval '1 minute')::bigint))
                  else '[]'::jsonb end))::text, true)
$$;

-- De foutcode van een aanroep als tekst ("geen fout" als het lukt), en het detail van de laatste fout.
create function public.t_rz(p_sql text) returns text
language plpgsql
as $$
declare v_msg text; v_detail text;
begin
  execute p_sql;
  perform set_config('test.detail', '', true);
  return 'geen fout';
exception when others then
  get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
  perform set_config('test.detail', coalesce(v_detail, ''), true);
  return v_msg;
end
$$;
grant execute on function public.t_rz(text) to authenticated;

select pg_temp.maak('t_beheer', true);
select pg_temp.maak('t_lid');
select pg_temp.maak('t_ander');
select set_config('test.lid', (select lid::text from pg_temp.gebruikers where naam = 't_lid'), true);
select set_config('test.ander', (select lid::text from pg_temp.gebruikers where naam = 't_ander'), true);
select set_config('test.beheerder', (select lid::text from pg_temp.gebruikers where naam = 't_beheer'), true);

insert into public.activiteiten (id, naam, datum, starttijd, eindtijd, locatie, status)
values ('00000000-0000-4000-8000-0000000000e1', 'T Overname', date '2099-05-01', '19:00', '23:00', 'T Zaal', 'gepubliceerd'),
       ('00000000-0000-4000-8000-0000000000e2', 'T Overname twee', date '2099-05-02', '19:00', '23:00', 'T Zaal', 'gepubliceerd'),
       ('00000000-0000-4000-8000-0000000000e3', 'T Overname oud', date '2000-05-01', '19:00', '23:00', 'T Zaal', 'gepubliceerd');
insert into public.rol_slots (activiteit_id, rol_type, bezetter_id, volgorde) values
  ('00000000-0000-4000-8000-0000000000e1', 'eindverantwoordelijke', current_setting('test.ander')::uuid, 0),
  ('00000000-0000-4000-8000-0000000000e1', 'werker', current_setting('test.lid')::uuid, 1),
  ('00000000-0000-4000-8000-0000000000e2', 'werker', current_setting('test.lid')::uuid, 1),
  ('00000000-0000-4000-8000-0000000000e2', 'werker', current_setting('test.beheerder')::uuid, 2),
  ('00000000-0000-4000-8000-0000000000e3', 'werker', current_setting('test.lid')::uuid, 1);

-- ===== 1. Wie het mag =====
select pg_temp.als('t_lid', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.dienst_overnemen('00000000-0000-4000-8000-0000000000e1', current_setting('test.lid')::uuid, 'werker') $$), 'geen_admin',
  'een gewoon lid neemt niets over');
reset role;
select pg_temp.als('t_beheer', 'aal1');
set local role authenticated;
select is(public.t_rz($$ select public.dienst_overnemen('00000000-0000-4000-8000-0000000000e1', current_setting('test.lid')::uuid, 'werker') $$), 'geen_admin',
  'een beheerder zonder recente code ook niet');
reset role;

-- ===== 2. Wat niet kan =====
select pg_temp.als('t_beheer', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.dienst_overnemen('00000000-0000-4000-8000-0000000000e1', current_setting('test.beheerder')::uuid, 'werker') $$), 'zelf', 'je eigen dienst neem je niet over');
select is(public.t_rz($$ select public.dienst_overnemen('00000000-0000-4000-8000-0000000000e1', current_setting('test.ander')::uuid, 'eindverantwoordelijke') $$), 'rol_niet_overneembaar',
  'de eindverantwoordelijke niet (die heeft een telefoonnummer nodig)');
select is(public.t_rz($$ select public.dienst_overnemen('00000000-0000-4000-8000-0000000000e1', current_setting('test.lid')::uuid, 'drankhaler') $$), 'dienst_gewijzigd',
  'de rol is intussen anders dan het scherm liet zien');
select is(public.t_rz($$ select public.dienst_overnemen('00000000-0000-4000-8000-0000000000e2', current_setting('test.lid')::uuid, 'werker') $$), 'dubbelboeking',
  'niet als je al een plek hebt bij deze activiteit');
select is(public.t_rz($$ select public.dienst_overnemen('00000000-0000-4000-8000-0000000000e3', current_setting('test.lid')::uuid, 'werker') $$), 'activiteit_niet_open',
  'niet bij een activiteit die al is geweest');
select is(public.t_rz($$ select public.dienst_overnemen('00000000-0000-4000-8000-0000000000e1', gen_random_uuid(), 'werker') $$), 'geen_bezetter', 'iemand zonder plek');
reset role;

-- Afgemeld voor deze activiteit.
insert into public.afmeldingen (activiteit_id, lid_id) values ('00000000-0000-4000-8000-0000000000e1', current_setting('test.beheerder')::uuid);
set local role authenticated;
select is(public.t_rz($$ select public.dienst_overnemen('00000000-0000-4000-8000-0000000000e1', current_setting('test.lid')::uuid, 'werker') $$), 'zelf_afgemeld',
  'niet als je je voor deze activiteit hebt afgemeld');
reset role;
delete from public.afmeldingen where lid_id = current_setting('test.beheerder')::uuid;

-- ===== 3. Overnemen =====
set local role authenticated;
select is(public.t_rz($$ select public.dienst_overnemen('00000000-0000-4000-8000-0000000000e1', current_setting('test.lid')::uuid, 'werker') $$), 'geen fout',
  'de beheerder neemt de dienst over');
reset role;
select is((select bezetter_id from public.rol_slots where activiteit_id = '00000000-0000-4000-8000-0000000000e1' and rol_type = 'werker'),
  current_setting('test.beheerder')::uuid, 'de plek staat nu op de beheerder, zonder dat hij leeg was');
select is((select count(*)::int from public.rol_slots where activiteit_id = '00000000-0000-4000-8000-0000000000e1' and rol_type = 'werker'), 1, 'er is geen plek bijgekomen of weggegaan');
select is((select count(*)::int from public.wijzigingen_log where actie = 'dienst_overgenomen' and omschrijving like '%T Overname (01-05-2099)'), 1, 'één logregel met namen');
select is((select count(*)::int from public.wijzigingen_log where actie = 'dienst_overgenomen' and door_lid_id = current_setting('test.beheerder')::uuid), 1, 'door de beheerder');

select * from finish();
rollback;
