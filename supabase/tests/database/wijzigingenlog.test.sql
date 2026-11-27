-- Databasetests voor het wijzigingenlog bekijken (migratie 20261127120000): wie het mag, het filter, wat er niet in staat (afmeldingen), namen in plaats van id's,
-- de link naar activiteit of lid en bladeren. Draaien met: npm run test:db. Alleen eigen namen ("T ...").


begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

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

-- Eigen logregels: de test begint met een leeg log (wat de seed en andere tests achterlieten telt niet mee).
delete from public.wijzigingen_log;
select set_config('test.beheerder', (select lid::text from pg_temp.gebruikers where naam = 't_beheer'), true);
insert into public.activiteiten (id, naam, datum) values ('00000000-0000-4000-8000-0000000000d1', 'T Log activiteit', date '2099-04-01');
insert into public.leden (id, voornaam, achternaam, type) values
  ('00000000-0000-4000-8000-0000000000d2', 'T Een', 'Lid', 'lid'),
  ('00000000-0000-4000-8000-0000000000d3', 'T Twee', 'Lid', 'lid');
insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving) values
  (current_setting('test.beheerder')::uuid, 'activiteit_aangemaakt', 'activiteiten', '00000000-0000-4000-8000-0000000000d1', 'T Log activiteit (01-04-2099) aangemaakt als concept'),
  (current_setting('test.beheerder')::uuid, 'plek_toegewezen', 'activiteiten', '00000000-0000-4000-8000-0000000000d1', 'T Een Lid ingedeeld als werker bij T Log activiteit (01-04-2099)'),
  (current_setting('test.beheerder')::uuid, 'afgemeld', 'afmeldingen', gen_random_uuid(), 'afgemeld voor activiteit 00000000-0000-4000-8000-0000000000d1'),
  (current_setting('test.beheerder')::uuid, 'afmelding_ingetrokken', 'afmeldingen', gen_random_uuid(), 'afmelding ingetrokken voor activiteit 00000000-0000-4000-8000-0000000000d1'),
  ('00000000-0000-4000-8000-0000000000d2', 'dienst_geruild', 'activiteiten', '00000000-0000-4000-8000-0000000000d1',
     'dienst bij activiteit 00000000-0000-4000-8000-0000000000d1 overgedragen van lid 00000000-0000-4000-8000-0000000000d2 aan lid 00000000-0000-4000-8000-0000000000d3'),
  (null, 'lid_toegevoegd', 'leden', '00000000-0000-4000-8000-0000000000d2', 'Lid toegevoegd en uitgenodigd'),
  (current_setting('test.beheerder')::uuid, 'lid_inactief_gezet', 'leden', gen_random_uuid(), 'Een gewist lid op inactief gezet'),
  (current_setting('test.beheerder')::uuid, 'beheer_aangezet', 'leden_prive', '00000000-0000-4000-8000-0000000000d2', 'Beheerrechten aangezet'),
  (current_setting('test.beheerder')::uuid, 'onbekende_actie', 'leden', null, 'Iets dat het filter niet kent');

-- ===== 1. Wie het mag =====
select pg_temp.als('t_lid', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select * from public.wijzigingen_lezen() $$), 'geen_admin', 'een gewoon lid leest het log niet');
reset role;
select pg_temp.als('t_beheer', 'aal1');
set local role authenticated;
select is(public.t_rz($$ select * from public.wijzigingen_lezen() $$), 'geen_admin', 'een beheerder zonder recente code ook niet');
reset role;
select pg_temp.als('t_beheer', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select * from public.wijzigingen_lezen('onzin') $$), 'veld_ongeldig', 'een onbekend filter');

-- ===== 2. Wat er staat =====
select is((select count(*)::int from public.wijzigingen_lezen()), 7, 'alles: de afmeldingen zijn er niet bij (R42)');
select is((select array_agg(omschrijving order by id) from public.wijzigingen_lezen('diensten')),
  array['T Een Lid ingedeeld als werker bij T Log activiteit (01-04-2099)',
        'Dienst bij T Log activiteit (01-04-2099) overgedragen van T Een Lid aan T Twee Lid'],
  'diensten: ook de overdracht, met namen in plaats van id''s');
select is((select count(*)::int from public.wijzigingen_lezen('activiteiten')), 1, 'activiteiten');
select is((select count(*)::int from public.wijzigingen_lezen('leden')), 2, 'leden');
select is((select count(*)::int from public.wijzigingen_lezen('beheer')), 1, 'beheer');
select is((select count(*)::int from public.wijzigingen_lezen('diensten')) + (select count(*)::int from public.wijzigingen_lezen('activiteiten'))
        + (select count(*)::int from public.wijzigingen_lezen('leden')) + (select count(*)::int from public.wijzigingen_lezen('beheer')), 6,
  'een actie die geen filter kent staat alleen bij alles');

-- ===== 3. Wie en waarheen =====
select is((select door from public.wijzigingen_lezen('leden') order by id limit 1), 'Het systeem', 'zonder wijziger staat er "Het systeem"');
select is((select door from public.wijzigingen_lezen('activiteiten')), 't_beheer Test', 'anders de naam van de wijziger');
select is((select doel_soort || ' ' || (doel_id = '00000000-0000-4000-8000-0000000000d1')::text from public.wijzigingen_lezen('activiteiten')), 'activiteit true',
  'een wijziging van een activiteit linkt naar die activiteit');
select is((select doel_soort from public.wijzigingen_lezen('leden') where omschrijving = 'Lid toegevoegd en uitgenodigd'), 'lid', 'een wijziging van een lid linkt naar dat lid');
select is((select doel_soort from public.wijzigingen_lezen('leden') where omschrijving = 'Een gewist lid op inactief gezet'), null, 'een lid dat er niet meer is: geen link');

-- ===== 4. Bladeren =====
select is((select count(*)::int from public.wijzigingen_lezen('alles', null, 3)), 4, 'drie gevraagd: vier terug, zodat het scherm weet dat er meer is');
select is((select count(*)::int from public.wijzigingen_lezen('alles', (select min(id) + 5 from public.wijzigingen_log), 50)), 3, 'vanaf een id alleen oudere regels');
select is((select max(id) < (select max(id) from public.wijzigingen_log) from public.wijzigingen_lezen('alles', (select max(id) from public.wijzigingen_log), 50)), true,
  'de regel waarvan je bladert zelf staat er niet meer bij');
reset role;

select * from finish();
rollback;
