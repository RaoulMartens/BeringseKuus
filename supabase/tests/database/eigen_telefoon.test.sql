-- Databasetests: een lid zet zijn eigen telefoonnummer (migratie 20261117100000).
-- Draaien met: npm run test:db. Alles in één transactie die wordt teruggedraaid. Eigen namen ("t_..").

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);


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
  perform set_config('test.' || p_naam, v_lid::text, true);
end
$$;

create function pg_temp.als(p_naam text, p_aal text default 'aal1', p_leeftijd interval default interval '1 minute')
returns void
language sql
as $$
  select set_config('request.jwt.claims',
    (json_build_object('sub', (select uid from pg_temp.gebruikers where naam = p_naam),
                       'role', 'authenticated', 'aal', p_aal)::jsonb
     || jsonb_build_object('amr',
          jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint))
          || case when p_aal = 'aal2' and p_leeftijd is not null
                  then jsonb_build_array(jsonb_build_object('method', 'totp',
                         'timestamp', extract(epoch from now() - p_leeftijd)::bigint))
                  else '[]'::jsonb end))::text, true)
$$;

-- Een activiteit, rechtstreeks (de tests draaien als postgres); datum en tijden zodat hij ver in de toekomst of in het verleden valt.
create function pg_temp.act(p_naam text, p_datum date, p_status text default 'gepubliceerd') returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  insert into public.activiteiten (naam, datum, starttijd, eindtijd, locatie, status)
  values (p_naam, p_datum, case when p_status = 'concept' then null else time '20:00' end,
          case when p_status = 'concept' then null else time '23:00' end,
          case when p_status = 'concept' then null else 'De Kuus' end, p_status)
  returning id into v_id;
  perform set_config('test.' || replace(lower(p_naam), ' ', '_'), v_id::text, true);
  return v_id;
end
$$;

create function pg_temp.slot(p_act uuid, p_rol text, p_lid uuid default null, p_label text default null) returns uuid
language sql
as $$
  insert into public.rol_slots (activiteit_id, rol_type, bezetter_id, plek_label)
  values (p_act, p_rol, p_lid, p_label) returning id
$$;

-- ===== Leden =====
select pg_temp.maak('t_anna');
select pg_temp.maak('t_bert');
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ('f7000000-0000-4000-8000-0000000000aa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'geenlid@example.com', now(), now());
insert into pg_temp.gebruikers values ('t_geenlid', 'f7000000-0000-4000-8000-0000000000aa', null);

-- ===== Een lid zet zijn eigen nummer =====
select pg_temp.als('t_anna');
set local role authenticated;
select lives_ok($$ select public.zet_eigen_telefoon('06 12 34 56 78') $$, 'een geldig nummer wordt aangenomen');
reset role;
select is((select telefoon from public.leden_prive where lid_id = current_setting('test.t_anna')::uuid), '06 12 34 56 78',
  'en staat bij het lid zelf');
select pg_temp.als('t_anna');
set local role authenticated;
select lives_ok($$ select public.zet_eigen_telefoon('  +31   6 1234 5678 ') $$, 'een nummer met plus en extra spaties wordt aangenomen');
reset role;
select is((select telefoon from public.leden_prive where lid_id = current_setting('test.t_anna')::uuid), '+31 6 1234 5678',
  'spaties worden één spatie en de randen vallen weg');
select is((select telefoon from public.leden_prive where lid_id = current_setting('test.t_bert')::uuid), null,
  'het nummer van een ander lid is niet geraakt');

-- ===== Wat niet kan =====
select pg_temp.als('t_anna');
set local role authenticated;
select throws_ok($$ select public.zet_eigen_telefoon('abc') $$, 'BK001', 'telefoon_ongeldig', 'letters: geen nummer');
select throws_ok($$ select public.zet_eigen_telefoon('0612') $$, 'BK001', 'telefoon_ongeldig', 'te kort');
select throws_ok($$ select public.zet_eigen_telefoon('612345678') $$, 'BK001', 'telefoon_ongeldig',
  'zonder 0 of plus (een Excel-nummer zonder voorloopnul)');
select throws_ok($$ select public.zet_eigen_telefoon('') $$, 'BK001', 'telefoon_ongeldig', 'leeg wissen kan niet');
select throws_ok($$ select public.zet_eigen_telefoon(null) $$, 'BK001', 'telefoon_ongeldig', 'null ook niet');
select throws_ok($$ select public.zet_eigen_telefoon('0612345678901234567890') $$, 'BK001', 'telefoon_ongeldig', 'te lang');
reset role;
select is((select telefoon from public.leden_prive where lid_id = current_setting('test.t_anna')::uuid), '+31 6 1234 5678',
  'na al die fouten staat het vorige nummer er nog');

-- ===== Wie het mag =====
select pg_temp.als('t_geenlid');
set local role authenticated;
select throws_ok($$ select public.zet_eigen_telefoon('06 12 34 56 78') $$, 'BK001', 'geen_lid', 'een sessie zonder lid kan niets zetten');
reset role;
select ok(has_function_privilege('authenticated', 'public.zet_eigen_telefoon(text)', 'execute'), 'ingelogd mag de functie uitvoeren');
select ok(not has_function_privilege('anon', 'public.zet_eigen_telefoon(text)', 'execute'), 'niet ingelogd niet');

select * from finish();
rollback;
