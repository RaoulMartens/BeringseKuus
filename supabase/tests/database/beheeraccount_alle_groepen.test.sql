-- Databasetests: een beheeraccount (alleen_beheer) ziet als lid alles (migratie 20261113160000).
-- Draaien met: npm run test:db. Alles in één transactie die wordt teruggedraaid. Eigen namen ("T F6 ..." en "t_..").

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);


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

-- ===== Leden, groepen en activiteiten =====
select pg_temp.maak('t_beheer', true); -- beheeraccount: alleen beheer, in geen groep
select pg_temp.maak('t_mark', true);   -- beheerder en gewoon lid, in geen groep
select pg_temp.maak('t_anna');         -- gewoon lid, in geen groep
select pg_temp.maak('t_bert');         -- gewoon lid, in Dames
update public.leden set alleen_beheer = true where id = current_setting('test.t_beheer')::uuid;

select set_config('test.g_dames', (select id::text from public.groepen where naam = 'Dames'), true);
insert into public.lid_groep (lid_id, groep_id) values (current_setting('test.t_bert')::uuid, current_setting('test.g_dames')::uuid);

select pg_temp.act('T F6 Dames', '2099-07-01');
select pg_temp.act('T F6 Concept', '2099-07-02', 'concept');
insert into public.activiteit_groep (activiteit_id, groep_id)
values (current_setting('test.t_f6_dames')::uuid, current_setting('test.g_dames')::uuid);

-- ===== lid_mag_zien =====
select is(intern.lid_mag_zien(current_setting('test.t_f6_dames')::uuid, current_setting('test.t_beheer')::uuid), true,
  'een beheeraccount ziet een activiteit voor een groep waar hij niet in zit');
select is(intern.lid_mag_zien(current_setting('test.t_f6_dames')::uuid, current_setting('test.t_anna')::uuid), false,
  'een gewoon lid buiten de groep niet');
select is(intern.lid_mag_zien(current_setting('test.t_f6_dames')::uuid, current_setting('test.t_mark')::uuid), false,
  'een beheerder die ook gewoon lid is en niet in de groep zit, ook niet');
select is(intern.lid_mag_zien(current_setting('test.t_f6_dames')::uuid, current_setting('test.t_bert')::uuid), true,
  'een lid in de groep wel');
select is(intern.lid_mag_zien(current_setting('test.t_f6_concept')::uuid, current_setting('test.t_beheer')::uuid), false,
  'ook een beheeraccount ziet een concept niet als lid');

-- ===== Wat het scherm van een lid leest =====
select pg_temp.als('t_beheer', 'aal2');
set local role authenticated;
select is((select count(*)::int from public.mijn_activiteiten where id = current_setting('test.t_f6_dames')::uuid), 1,
  'mijn_activiteiten: het beheeraccount ziet de activiteit voor Dames');
select is((select count(*)::int from public.wie_komt_er(current_setting('test.t_f6_dames')::uuid) where achternaam = 'Test'), 1,
  'wie_komt_er: hij ziet wie er komt (bert), maar telt zelf niet mee');
select is((select count(*)::int from public.wie_komt_er(current_setting('test.t_f6_dames')::uuid) where lid_id = current_setting('test.t_beheer')::uuid), 0,
  'wie_komt_er: het beheeraccount zelf staat er niet in');

reset role;
select pg_temp.als('t_anna');
set local role authenticated;
select is((select count(*)::int from public.mijn_activiteiten where id = current_setting('test.t_f6_dames')::uuid), 0,
  'mijn_activiteiten: een gewoon lid buiten de groep ziet hem niet');

reset role;
select * from finish();
rollback;
