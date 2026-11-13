-- Databasetests voor meerdere dagen tegelijk bewerken (migratie 20261113150000): wie het mag, dat alle dagen dezelfde gegevens
-- krijgen, publiceren van alle dagen tegelijk, en dat het alles of niets is. Draaien met: npm run test:db. Alles in één
-- transactie die wordt teruggedraaid. Alleen eigen namen ("T ...").

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- ===== Hulpen (alleen in deze transactie) =====
create temp table gebruikers (naam text primary key, uid uuid not null, lid uuid);

create function pg_temp.maak(p_naam text, p_admin boolean default false, p_telefoon text default null) returns void
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
  insert into public.leden_prive (lid_id, email, telefoon, is_admin, beheerder_sinds)
  values (v_lid, p_naam || '@example.com', p_telefoon, p_admin, case when p_admin then timestamptz '2026-06-01' end);
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

-- De dagen als lijst van {id, versie} voor de namen die met dit begin beginnen, op datum.
create function public.t_dagen(p_begin text) returns jsonb
language sql as $$
  select jsonb_agg(jsonb_build_object('id', id, 'versie', versie) order by datum)
    from public.activiteiten where naam like p_begin || '%'
$$;
grant execute on function public.t_dagen(text) to authenticated;

select pg_temp.maak('t_beheer', true);
select pg_temp.maak('t_lid');
select pg_temp.maak('t_ev', false, '06 12 34 56 78');
select pg_temp.maak('t_zonder');
select set_config('test.ev', (select lid::text from pg_temp.gebruikers where naam = 't_ev'), true);
select set_config('test.zonder', (select lid::text from pg_temp.gebruikers where naam = 't_zonder'), true);
select set_config('test.groep', (select id::text from public.groepen where naam = 'Bestuur'), true);
-- De eindverantwoordelijke hoort bij de doelgroep (R22), anders weigert activiteit_opslaan hem.
insert into public.lid_groep (lid_id, groep_id) values (current_setting('test.ev')::uuid, current_setting('test.groep')::uuid);

-- Een reeks van drie concepten (zoals de verkoopdagen) en nog een, voor de proef met een fout. Elk met de lege eindverantwoordelijke.
insert into public.activiteiten (naam, datum) values
  ('T Reeks a', '2099-01-04'), ('T Reeks a', '2099-01-05'), ('T Reeks a', '2099-01-06'),
  ('T Reeks b', '2099-02-04'), ('T Reeks b', '2099-02-05'), ('T Reeks b', '2099-02-06'),
  ('T Reeks c', '2099-03-04'), ('T Reeks c', '2099-03-05');
insert into public.rol_slots (activiteit_id, rol_type, volgorde)
  select id, 'eindverantwoordelijke', 0 from public.activiteiten where naam like 'T Reeks %';

-- ===== 1. Wie het mag =====
select pg_temp.als('t_lid', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.activiteiten_bulk_wijzigen(public.t_dagen('T Reeks a'), '{"locatie": "x"}') $$), 'geen_admin',
  'een gewoon lid wijzigt niets');
reset role;

-- ===== 2. Alle dagen krijgen dezelfde gegevens =====
select pg_temp.als('t_beheer', 'aal2');
set local role authenticated;
select set_config('test.res1', public.activiteiten_bulk_wijzigen(public.t_dagen('T Reeks a'),
  jsonb_build_object('starttijd', '10:00', 'eindtijd', '12:00', 'locatie', 'T Plek', 'notitie', 'Voor alle dagen',
                     'groepen', jsonb_build_array(current_setting('test.groep'))),
  current_setting('test.ev')::uuid, false)::text, true);
reset role;

select is((current_setting('test.res1')::jsonb ->> 'aantal')::int, 3, 'drie dagen gewijzigd');
select is((select count(*)::int from public.activiteiten where naam = 'T Reeks a'
            and starttijd = '10:00' and eindtijd = '12:00' and locatie = 'T Plek' and notitie = 'Voor alle dagen'), 3,
  'alle drie hebben dezelfde tijden, plaats en notitie');
select is((select count(*)::int from public.activiteit_groep g join public.activiteiten a on a.id = g.activiteit_id
            where a.naam = 'T Reeks a' and g.groep_id = current_setting('test.groep')::uuid), 3, 'en dezelfde doelgroep');
select is((select count(*)::int from public.rol_slots s join public.activiteiten a on a.id = s.activiteit_id
            where a.naam = 'T Reeks a' and s.rol_type = 'eindverantwoordelijke' and s.bezetter_id = current_setting('test.ev')::uuid), 3,
  'en dezelfde eindverantwoordelijke');
select is((select string_agg(versie::text, ',' order by datum) from public.activiteiten where naam = 'T Reeks a'), '2,2,2',
  'de versie van elke dag is omhoog (de optimistische controle van activiteit_opslaan)');
select is((select string_agg(status, ',') from public.activiteiten where naam = 'T Reeks a'), 'concept,concept,concept',
  'zonder te publiceren blijven het concepten');
select is((select count(*)::int from public.wijzigingen_log where actie = 'activiteit_gewijzigd' and omschrijving like 'T Reeks a (%'), 3,
  'het logboek heeft per dag een regel, zoals bij één activiteit');

-- ===== 3. Alle dagen tegelijk publiceren =====
select pg_temp.als('t_beheer', 'aal2');
set local role authenticated;
select set_config('test.res2', public.activiteiten_bulk_wijzigen(public.t_dagen('T Reeks a'), '{}', null, true)::text, true);
reset role;
select is((select string_agg(status, ',') from public.activiteiten where naam = 'T Reeks a'), 'gepubliceerd,gepubliceerd,gepubliceerd',
  'alle dagen zijn tegelijk gepubliceerd');
select is((current_setting('test.res2')::jsonb ->> 'gepubliceerd')::boolean, true, 'het resultaat zegt dat het publiceren was');

-- Een gepubliceerde dag laat de functie niet los: er zouden leden bij horen.
select pg_temp.als('t_beheer', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.activiteiten_bulk_wijzigen(public.t_dagen('T Reeks a'), '{"locatie": "anders"}') $$), 'alleen_concept',
  'een reeks die al gepubliceerd is, wijzig je hier niet');
reset role;

-- ===== 4. Alles of niets: een dag die niet kan, blokkeert alle dagen =====
-- Reeks b: de derde dag krijgt een versie die niet klopt. Er verandert niets, ook niet voor de eerste twee dagen.
select pg_temp.als('t_beheer', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.activiteiten_bulk_wijzigen(
    (select jsonb_agg(jsonb_build_object('id', id, 'versie', case when datum = '2099-02-06' then 9 else versie end) order by datum)
       from public.activiteiten where naam = 'T Reeks b'),
    '{"locatie": "Nooit"}') $$), 'versie_verouderd', 'een verouderde versie bij één dag is een fout');
select is((current_setting('test.detail')::jsonb ->> 'dag')::int, 2, 'met het nummer van die dag (de derde, vanaf 0)');
select ok((current_setting('test.detail')::jsonb ->> 'activiteit_id')::uuid =
          (select id from public.activiteiten where naam = 'T Reeks b' and datum = '2099-02-06'), 'en de activiteit zelf');
reset role;
select is((select count(*)::int from public.activiteiten where naam = 'T Reeks b' and locatie is not null), 0,
  'er is niets gewijzigd, ook niet voor de dagen die wel kloppen');
select is((select string_agg(versie::text, ',') from public.activiteiten where naam = 'T Reeks b'), '1,1,1', 'en geen versie is omhoog');

-- Publiceren kan alleen als elke dag compleet is: zonder eindtijd en eindverantwoordelijke gebeurt er niets.
select pg_temp.als('t_beheer', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.activiteiten_bulk_wijzigen(public.t_dagen('T Reeks b'),
    '{"starttijd": "10:00", "locatie": "T Plek"}', null, true) $$), 'publiceren_niet_mogelijk',
  'publiceren zonder eindtijd en eindverantwoordelijke kan niet');
select is(current_setting('test.detail')::jsonb -> 'ontbreekt', '["eindtijd", "eindverantwoordelijke"]'::jsonb, 'met wat er ontbreekt');
-- Een eindverantwoordelijke zonder telefoonnummer is ook niet genoeg.
select is(public.t_rz($$ select public.activiteiten_bulk_wijzigen(public.t_dagen('T Reeks b'),
    '{"starttijd": "10:00", "eindtijd": "12:00", "locatie": "T Plek"}', current_setting('test.zonder')::uuid, true) $$),
  'publiceren_niet_mogelijk', 'een eindverantwoordelijke zonder telefoonnummer kan niet publiceren');
select is(current_setting('test.detail')::jsonb -> 'ontbreekt', '["telefoon_eindverantwoordelijke"]'::jsonb, 'dat zegt de melding');
reset role;
select is((select count(*)::int from public.activiteiten where naam = 'T Reeks b' and (status <> 'concept' or locatie is not null)), 0,
  'na al die fouten staat reeks b er nog zoals hij was');

-- ===== 5. Invoer =====
select pg_temp.als('t_beheer', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.activiteiten_bulk_wijzigen('[]') $$), 'veld_ontbreekt', 'een lege lijst kan niet');
select is(public.t_rz($$ select public.activiteiten_bulk_wijzigen(public.t_dagen('T Reeks c'), '{"naam": "Andere naam"}') $$), 'veld_ongeldig',
  'naam is per dag en kan hier niet worden meegegeven');
select is(public.t_rz($$ select public.activiteiten_bulk_wijzigen(public.t_dagen('T Reeks c'), '{"datum": "2099-04-01"}') $$), 'veld_ongeldig',
  'de datum ook niet');
select is(public.t_rz($$ select public.activiteiten_bulk_wijzigen(jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'versie', 1))) $$), 'activiteit_onbekend', 'een onbekende activiteit kan niet');
select is(public.t_rz($$ select public.activiteiten_bulk_wijzigen(
    (select jsonb_build_array(jsonb_build_object('id', id, 'versie', versie), jsonb_build_object('id', id, 'versie', versie))
       from public.activiteiten where naam = 'T Reeks c' limit 1)) $$), 'wijziging_ongeldig', 'dezelfde dag twee keer kan niet');
select is(public.t_rz($$ select public.activiteiten_bulk_wijzigen((select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'versie', 1))
    from generate_series(1, 51))) $$), 'te_veel_regels', 'meer dan 50 dagen is geen reeks meer');
select is(public.t_rz($$ select public.activiteiten_bulk_wijzigen(public.t_dagen('T Reeks c'), '{"starttijd": "abc"}') $$), 'veld_ongeldig',
  'een veld dat niet klopt, wordt zoals bij één activiteit geweigerd');
reset role;
select is((select count(*)::int from public.activiteiten where naam = 'T Reeks c' and (starttijd is not null or versie <> 1)), 0,
  'reeks c is nooit gewijzigd');

select * from finish();
rollback;
