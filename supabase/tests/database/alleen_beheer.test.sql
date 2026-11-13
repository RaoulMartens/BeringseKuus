-- Databasetests: alleen beheer (migratie 20261113130000). Een beheeraccount telt niet mee als lid.
-- Draaien met: npm run test:db. Alles in één transactie die wordt teruggedraaid. Eigen namen ("T F5 ..." en "t_..").

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);


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
select pg_temp.maak('t_mark', true);   -- beheerder
select pg_temp.maak('t_beheer', true); -- beheeraccount: alleen beheer
select pg_temp.maak('t_anna');
select pg_temp.maak('t_bert');

select pg_temp.act('T F5 Open', '2099-06-01');
select pg_temp.slot(current_setting('test.t_f5_open')::uuid, 'werker', current_setting('test.t_anna')::uuid);
insert into public.afmeldingen (activiteit_id, lid_id)
values (current_setting('test.t_f5_open')::uuid, current_setting('test.t_bert')::uuid);

-- Het aantal aanwezigen zonder en met de vlag: het beheeraccount hoort bij een activiteit voor iedereen, dus telt zonder vlag mee.
select set_config('test.zonder_vlag', intern.aantal_aanwezigen(current_setting('test.t_f5_open')::uuid)::text, true);
update public.leden set alleen_beheer = true where id = current_setting('test.t_beheer')::uuid;
select set_config('test.met_vlag', intern.aantal_aanwezigen(current_setting('test.t_f5_open')::uuid)::text, true);

-- ===== De vlag =====
select is((select alleen_beheer::text from public.leden where id = current_setting('test.t_beheer')::uuid), 'true', 'de vlag staat aan');
select is((select alleen_beheer::text from public.leden where id = current_setting('test.t_anna')::uuid), 'false', 'en staat standaard uit');
select ok(has_column_privilege('authenticated', 'public.leden', 'alleen_beheer', 'select'), 'een lid mag de vlag lezen');
select ok(not has_column_privilege('authenticated', 'public.leden', 'alleen_beheer', 'update'), 'maar niet wijzigen');
select is(current_setting('test.zonder_vlag')::int - current_setting('test.met_vlag')::int, 1,
  'aantal_aanwezigen: het beheeraccount telt met de vlag niet meer mee');

-- ===== Wie komt er =====
select pg_temp.als('t_anna');
set local role authenticated;
select is((select count(*)::int from public.wie_komt_er(current_setting('test.t_f5_open')::uuid) where achternaam = 'Test'), 3,
  'wie_komt_er: mark, anna en bert; het beheeraccount staat er niet bij');
select is((select count(*)::int from public.wie_komt_er(current_setting('test.t_f5_open')::uuid) where lid_id = current_setting('test.t_beheer')::uuid), 0,
  'wie_komt_er: het beheeraccount zelf is er niet');
select is((select count(*)::int from public.wie_komt_er(current_setting('test.t_f5_open')::uuid) where not komt and achternaam = 'Test'), 1,
  'wie_komt_er: bert is afgemeld');

-- ===== Vervangers =====
select is((select count(*)::int from public.beschikbare_vervangers(current_setting('test.t_f5_open')::uuid) where lid_id = current_setting('test.t_beheer')::uuid), 0,
  'beschikbare_vervangers: het beheeraccount wordt niet aangeboden');
select is((select count(*)::int from public.beschikbare_vervangers(current_setting('test.t_f5_open')::uuid) where lid_id = current_setting('test.t_mark')::uuid), 1,
  'beschikbare_vervangers: een gewoon lid wel');

-- ===== Beheer werkt nog =====
reset role;
select pg_temp.als('t_beheer', 'aal2');
set local role authenticated;
select is((select public.beheerstatus()), 'ok', 'het beheeraccount kan gewoon beheren');

reset role;
select ok(has_function_privilege('authenticated', 'public.wie_komt_er(uuid)', 'execute'), 'de rechten op de functies zijn gebleven');

select * from finish();
rollback;
