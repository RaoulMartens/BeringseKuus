-- Databasetests voor meerdere activiteiten tegelijk aanmaken (migratie 20261113100000): wie het mag, de controles per regel
-- met het regelnummer, alles of niets, en de idempotentie op aanmaak_id. Draaien met: npm run test:db. Alles in één transactie
-- die wordt teruggedraaid. Alleen eigen namen ("T ...").

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

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

-- Een regel met alles wat verplicht is; de test past velden aan.
create function public.t_regel(p_naam text, p_datum text default '2099-03-01', p_extra jsonb default '{}') returns jsonb
language sql as $$
  select jsonb_build_object('naam', p_naam, 'datum', p_datum, 'starttijd', '19:00', 'locatie', 'T Locatie') || p_extra
$$;
grant execute on function public.t_regel(text, text, jsonb) to authenticated;

select set_config('test.groep', (select id::text from public.groepen where naam = 'Bestuur'), true);

-- ===== 1. Wie het mag =====
select pg_temp.als('t_lid', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.activiteiten_bulk_aanmaken(gen_random_uuid(), '[{"naam": "x"}]') $$), 'geen_admin',
  'een gewoon lid maakt niets aan');
reset role;
select pg_temp.als('t_beheer', 'aal1');
set local role authenticated;
select is(public.t_rz($$ select public.activiteiten_bulk_aanmaken(gen_random_uuid(), '[{"naam": "x"}]') $$), 'geen_admin',
  'een beheerder zonder recente code maakt niets aan');
reset role;

-- ===== 2. Aanmaken =====
select pg_temp.als('t_beheer', 'aal2');
set local role authenticated;
select set_config('test.a1', gen_random_uuid()::text, true);
select set_config('test.res1', public.activiteiten_bulk_aanmaken(current_setting('test.a1')::uuid,
  jsonb_build_array(
    public.t_regel('T Bulk een', '2099-03-01', '{"verzameltijd": "18:30", "eindtijd": "23:00", "notitie": "Let op"}'),
    public.t_regel('T Bulk twee', '2099-03-02', jsonb_build_object('groepen', jsonb_build_array(current_setting('test.groep')))),
    public.t_regel('T Bulk drie', '2099-03-03', '{"plekken": [{"rol_type": "tapper", "aantal": 2}, {"rol_type": "ober", "aantal": 1}]}')
  ))::text, true);
reset role;

select is((current_setting('test.res1')::jsonb ->> 'aantal')::int, 3, 'drie regels, drie activiteiten');
select is((select count(*)::int from public.activiteiten where naam like 'T Bulk %'), 3, 'ze staan in activiteiten');
select ok((select bool_and(status = 'concept' and type = 'seizoen') from public.activiteiten where naam like 'T Bulk %'),
  'alles is een concept van het type seizoen (geen berichten, R18)');
select is((select eindtijd::text || '|' || verzameltijd::text || '|' || notitie from public.activiteiten where naam = 'T Bulk een'),
  '23:00:00|18:30:00|Let op', 'de optionele velden zijn overgenomen');
select is((select count(*)::int from public.rol_slots s join public.activiteiten a on a.id = s.activiteit_id
            where a.naam like 'T Bulk %' and s.rol_type = 'eindverantwoordelijke' and s.bezetter_id is null), 3,
  'elke activiteit heeft precies één lege eindverantwoordelijke-plek');
select is((select array_agg(s.rol_type order by s.volgorde) from public.rol_slots s join public.activiteiten a on a.id = s.activiteit_id
            where a.naam = 'T Bulk drie'), array['eindverantwoordelijke', 'tapper', 'tapper', 'ober'],
  'de gevraagde plekken per rol zijn er, leeg, achter de eindverantwoordelijke');
select is((select count(*)::int from public.activiteit_groep g join public.activiteiten a on a.id = g.activiteit_id
            where a.naam = 'T Bulk twee' and g.groep_id = current_setting('test.groep')::uuid), 1,
  'de doelgroep is gekoppeld');
select is((select count(*)::int from public.activiteit_groep g join public.activiteiten a on a.id = g.activiteit_id
            where a.naam in ('T Bulk een', 'T Bulk drie')), 0, 'zonder groepen is een activiteit voor iedereen');
select is((select count(*)::int from public.wijzigingen_log where actie = 'activiteit_aangemaakt'
            and omschrijving like 'T Bulk % aangemaakt als concept, met meerdere tegelijk'), 3,
  'één logregel per activiteit, door de beheerder');
select is((select count(distinct door_lid_id)::int from public.wijzigingen_log where actie = 'activiteit_aangemaakt'
            and omschrijving like 'T Bulk % aangemaakt als concept, met meerdere tegelijk'), 1, 'door één lid');

-- ===== 3. Dezelfde aanmaak_id twee keer: geen dubbele activiteiten =====
select pg_temp.als('t_beheer', 'aal2');
set local role authenticated;
select set_config('test.res2', public.activiteiten_bulk_aanmaken(current_setting('test.a1')::uuid,
  jsonb_build_array(public.t_regel('T Bulk ander', '2099-04-01')))::text, true);
reset role;
select is((current_setting('test.res2')::jsonb ->> 'herhaald')::boolean, true, 'een tweede aanroep met dezelfde id is een herhaling');
select is(current_setting('test.res2')::jsonb -> 'activiteit_ids', current_setting('test.res1')::jsonb -> 'activiteit_ids',
  'en geeft het eerste resultaat terug');
select is((select count(*)::int from public.activiteiten where naam like 'T Bulk %'), 3,
  'de herhaling heeft niets nieuws aangemaakt, ook niet met andere regels');

-- ===== 4. Controles per regel: de foutcode en het regelnummer =====
select pg_temp.als('t_beheer', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.activiteiten_bulk_aanmaken(gen_random_uuid(), '[]') $$), 'veld_ontbreekt', 'een lege lijst kan niet');
select is(public.t_rz($$ select public.activiteiten_bulk_aanmaken(gen_random_uuid(), '{"a": 1}') $$), 'veld_ongeldig', 'regels is een lijst');
select is(public.t_rz($$ select public.activiteiten_bulk_aanmaken(gen_random_uuid(), '[{"naam": "T Bulk fout", "datum": "2099-05-01", "starttijd": "19:00"}]') $$),
  'veld_ontbreekt', 'een regel zonder locatie is een fout');
select is(current_setting('test.detail')::jsonb, '{"velden": ["locatie"], "regel": 0}'::jsonb, 'met het ontbrekende veld en regelnummer 0');
select is(public.t_rz($$ select public.activiteiten_bulk_aanmaken(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('naam', 'T Bulk goed', 'datum', '2099-05-01', 'starttijd', '19:00', 'locatie', 'x'),
  jsonb_build_object('naam', 'T Bulk slecht', 'datum', '2099-13-45', 'starttijd', '19:00', 'locatie', 'x'))) $$),
  'datum_ongeldig', 'een datum die niet klopt heeft een eigen code');
select is((current_setting('test.detail')::jsonb ->> 'regel')::int, 1, 'en het regelnummer van de tweede regel (1)');
select is(public.t_rz($$ select public.activiteiten_bulk_aanmaken(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('naam', 'T Bulk groep', 'datum', '2099-05-01', 'starttijd', '19:00', 'locatie', 'x',
                     'groepen', jsonb_build_array(gen_random_uuid())))) $$),
  'groep_onbekend', 'een onbekende groep is een fout');
select is(public.t_rz($$ select public.activiteiten_bulk_aanmaken(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('naam', 'T Bulk eind', 'datum', '2099-05-01', 'starttijd', '19:00', 'eindtijd', '19:00', 'locatie', 'x'))) $$),
  'veld_ongeldig', 'een eindtijd gelijk aan de starttijd kan niet');
select is(public.t_rz($$ select public.activiteiten_bulk_aanmaken(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('naam', 'T Bulk sleutel', 'datum', '2099-05-01', 'starttijd', '19:00', 'locatie', 'x', 'status', 'gepubliceerd'))) $$),
  'veld_ongeldig', 'een onbekend veld wordt geweigerd: de status kan niet worden meegegeven');
select is(public.t_rz($$ select public.activiteiten_bulk_aanmaken(gen_random_uuid(), jsonb_build_array(
  jsonb_build_object('naam', 'T Bulk rol', 'datum', '2099-05-01', 'starttijd', '19:00', 'locatie', 'x',
                     'plekken', jsonb_build_array(jsonb_build_object('rol_type', 'eindverantwoordelijke', 'aantal', 1))))) $$),
  'veld_ongeldig', 'een extra eindverantwoordelijke-plek kan niet');
select is(public.t_rz($$ select public.activiteiten_bulk_aanmaken(gen_random_uuid(), (select jsonb_agg(
  jsonb_build_object('naam', 'T Bulk veel ' || g, 'datum', '2099-06-01', 'starttijd', '19:00', 'locatie', 'x'))
  from generate_series(1, 201) g)) $$), 'te_veel_regels', 'meer dan 200 regels kan niet');
reset role;

-- ===== 5. Alles of niets =====
select is((select count(*)::int from public.activiteiten where naam like 'T Bulk goed' or naam like 'T Bulk slecht'
             or naam like 'T Bulk fout' or naam like 'T Bulk veel %'), 0,
  'na al die fouten is er niets aangemaakt, ook niet de goede regel voor de foute (alles of niets)');
select is((select count(*)::int from public.activiteiten where naam like 'T Bulk %'), 3, 'alleen de eerste, geslaagde actie staat er');
select is((select count(*)::int from public.bulk_aanmaken where aanmaak_id = current_setting('test.a1')::uuid), 1,
  'alleen een geslaagde actie wordt bewaard');

select * from finish();
rollback;
