-- Databasetests UC-010: wie_komt_er, het ledenraster "Wie komt er?" (migratie 20261113120000).
-- Draaien met: npm run test:db. Alles in één transactie die wordt teruggedraaid. Eigen namen ("T F4 ..." en "t_..").

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);


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
select pg_temp.maak('t_mark', true);  -- beheerder en lid
select pg_temp.maak('t_anna');
select pg_temp.maak('t_bert');        -- zit in Dames
select pg_temp.maak('t_carla');
select pg_temp.maak('t_dirk');
select pg_temp.maak('t_els');
select pg_temp.maak('t_fay');         -- afgemeld, met een toelichting die niemand mag zien
select pg_temp.maak('t_gina');        -- inactief
select pg_temp.maak('t_hugo');        -- extern
select pg_temp.maak('t_ivo');         -- niet in Dames
select pg_temp.maak('t_jan');         -- zit in Dames, afgemeld voor Dames
update public.leden set actief = false where id = current_setting('test.t_gina')::uuid;
update public.leden set type = 'extern', auth_user_id = null where id = current_setting('test.t_hugo')::uuid;
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ('f4000000-0000-4000-8000-0000000000aa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'geenlid@example.com', now(), now());
insert into pg_temp.gebruikers values ('t_geenlid', 'f4000000-0000-4000-8000-0000000000aa', null);

select set_config('test.g_dames', (select id::text from public.groepen where naam = 'Dames'), true);
insert into public.lid_groep (lid_id, groep_id) values
  (current_setting('test.t_bert')::uuid, current_setting('test.g_dames')::uuid),
  (current_setting('test.t_jan')::uuid, current_setting('test.g_dames')::uuid);

select pg_temp.act('T F4 Open', '2099-05-01');
select pg_temp.act('T F4 Concept', '2099-05-02', 'concept');
select pg_temp.act('T F4 Geannuleerd', '2099-05-03', 'geannuleerd');
select pg_temp.act('T F4 Dames', '2099-05-04');
insert into public.activiteit_groep (activiteit_id, groep_id)
values (current_setting('test.t_f4_dames')::uuid, current_setting('test.g_dames')::uuid);

insert into public.afmeldingen (activiteit_id, lid_id, toelichting)
values (current_setting('test.t_f4_open')::uuid, current_setting('test.t_fay')::uuid, 'geheime reden'),
       (current_setting('test.t_f4_dames')::uuid, current_setting('test.t_jan')::uuid, null),
       (current_setting('test.t_f4_concept')::uuid, current_setting('test.t_fay')::uuid, null),
       (current_setting('test.t_f4_geannuleerd')::uuid, current_setting('test.t_fay')::uuid, null);

-- ===== Wat de functie teruggeeft =====
reset role;
select pg_temp.als('t_anna');
set local role authenticated;
select is(pg_get_function_result('public.wie_komt_er(uuid)'::regprocedure),
  'TABLE(lid_id uuid, voornaam text, achternaam text, komt boolean)',
  'wie_komt_er geeft alleen id, naam en komt: geen toelichting, e-mail of telefoon');
select is((select count(*)::int from public.wie_komt_er(current_setting('test.t_f4_open')::uuid) where achternaam = 'Test'), 9,
  'een gewoon lid ziet alle negen actieve leden van de activiteit');
select is((select count(*)::int from public.wie_komt_er(current_setting('test.t_f4_open')::uuid) where achternaam = 'Test' and not komt), 1,
  'een gewoon lid ziet dat er één lid is afgemeld');
select is((select voornaam from public.wie_komt_er(current_setting('test.t_f4_open')::uuid) where not komt and achternaam = 'Test'), 't_fay',
  'en wie dat is');
select is((select komt::text from public.wie_komt_er(current_setting('test.t_f4_open')::uuid) where lid_id = current_setting('test.t_anna')::uuid), 'true',
  'wie niet is afgemeld, komt');
select is((select count(*)::int from public.wie_komt_er(current_setting('test.t_f4_open')::uuid)
            where lid_id in (current_setting('test.t_gina')::uuid, current_setting('test.t_hugo')::uuid)), 0,
  'geen inactief lid en geen externe helper');
select ok(not (select string_agg(w::text, ' ') from public.wie_komt_er(current_setting('test.t_f4_open')::uuid) w) like '%geheime%',
  'de toelichting van een afmelding staat nergens in de uitkomst');

-- Een lid leest de tabel afmeldingen nog steeds niet rechtstreeks: alleen zijn eigen regel.
select is((select count(*)::int from public.afmeldingen where activiteit_id = current_setting('test.t_f4_open')::uuid), 0,
  'de tabel afmeldingen blijft voor een lid beperkt tot zijn eigen afmeldingen');

-- ===== Doelgroep (R22) =====
select is((select count(*)::int from public.wie_komt_er(current_setting('test.t_f4_dames')::uuid)), 0,
  'een lid buiten de groep ziet de activiteit niet en dus ook niet wie er komt');
reset role;
select pg_temp.als('t_bert');
set local role authenticated;
select is((select count(*)::int from public.wie_komt_er(current_setting('test.t_f4_dames')::uuid) where achternaam = 'Test'), 2,
  'een lid in de groep ziet alleen de leden van de groep (en niet ivo, anna of de anderen)');
select is((select komt::text from public.wie_komt_er(current_setting('test.t_f4_dames')::uuid) where lid_id = current_setting('test.t_jan')::uuid), 'false',
  'en wie van hen is afgemeld');

-- ===== Alleen gepubliceerd =====
select is((select count(*)::int from public.wie_komt_er(current_setting('test.t_f4_concept')::uuid)), 0, 'een concept: geen rijen');
select is((select count(*)::int from public.wie_komt_er(current_setting('test.t_f4_geannuleerd')::uuid)), 0, 'een geannuleerde activiteit: geen rijen');
select is((select count(*)::int from public.wie_komt_er(gen_random_uuid())), 0, 'een onbekende activiteit: geen rijen, geen fout');

-- ===== Beheerder en sessie zonder lid =====
reset role;
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is((select count(*)::int from public.wie_komt_er(current_setting('test.t_f4_open')::uuid) where achternaam = 'Test'), 9,
  'een beheerder ziet hetzelfde als een lid');
reset role;
select pg_temp.als('t_geenlid');
set local role authenticated;
select is((select count(*)::int from public.wie_komt_er(current_setting('test.t_f4_open')::uuid)), 0, 'een sessie zonder lid ziet niemand');

-- ===== Rechten =====
reset role;
select ok(has_function_privilege('authenticated', 'public.wie_komt_er(uuid)', 'execute'), 'ingelogd mag de functie uitvoeren');
select ok(not has_function_privilege('anon', 'public.wie_komt_er(uuid)', 'execute'), 'niet ingelogd niet');

select * from finish();
rollback;
