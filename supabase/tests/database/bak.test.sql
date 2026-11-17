-- Databasetests BA-8 / R23: de bak (migratie 20261117150000). Draaien met: npm run test:db. Alles in één transactie die wordt
-- teruggedraaid. Eigen namen ("T K ..." en "t_..").

begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

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

-- De bak van een activiteit als tekst, op volgorde: "label:naam" (of "label:-" bij een lege plek).
create function pg_temp.bak(p_act text) returns text
language sql
as $$
  select coalesce(string_agg(s.plek_label || ':' || coalesce(l.voornaam, '-'), ', ' order by s.volgorde), '')
    from public.rol_slots s left join public.leden l on l.id = s.bezetter_id
   where s.activiteit_id = current_setting('test.' || p_act)::uuid and s.rol_type = 'bak'
$$;

create function pg_temp.lid(p_naam text) returns text
language sql
as $$ select current_setting('test.' || p_naam) $$;

-- ===== Leden en activiteiten =====
select pg_temp.maak('t_mark', true);   -- beheerder
select pg_temp.maak('t_anna');
select pg_temp.maak('t_bert');
select pg_temp.maak('t_carla');
select pg_temp.maak('t_dirk');
select pg_temp.maak('t_els');
select pg_temp.maak('t_hugo');          -- extern
select pg_temp.maak('t_gina');          -- inactief
select pg_temp.maak('t_ger');           -- eindverantwoordelijke, met telefoonnummer (R21)
update public.leden_prive set telefoon = '06 12 34 56 78' where lid_id = current_setting('test.t_ger')::uuid;
update public.leden set type = 'extern', auth_user_id = null where id = current_setting('test.t_hugo')::uuid;
update public.leden set actief = false where id = current_setting('test.t_gina')::uuid;

select pg_temp.act('T K Avond', '2099-07-01');
select pg_temp.act('T K Ruil', '2099-07-02');
insert into public.rol_slots (activiteit_id, rol_type, bezetter_id)
values (current_setting('test.t_k_avond')::uuid, 'werker', current_setting('test.t_dirk')::uuid),
       (current_setting('test.t_k_avond')::uuid, 'eindverantwoordelijke', current_setting('test.t_ger')::uuid);
select set_config('test.s_versie', (select versie::text from public.activiteiten where naam = 'T K Avond'), true);

-- ===== Alleen een beheerder =====
select pg_temp.als('t_anna');
set local role authenticated;
select throws_ok(
  format($f$ select public.activiteit_opslaan_met_bak(%L::uuid, '{}'::jsonb, '[]'::jsonb, false, %s, %L::jsonb) $f$,
    current_setting('test.t_k_avond'), current_setting('test.s_versie'), '{"actief": true, "plekken": []}'),
  'BK001', 'geen_admin', 'een gewoon lid zet de bak niet');
reset role;

-- ===== De bak aanzetten, met plekken =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select lives_ok(
  format($f$ select public.activiteit_opslaan_met_bak(%L::uuid, '{}'::jsonb, '[]'::jsonb, false, %s, %L::jsonb) $f$,
    current_setting('test.t_k_avond'), current_setting('test.s_versie'),
    json_build_object('actief', true, 'plekken', json_build_array(
      json_build_object('label', 'prins', 'bezetter_id', current_setting('test.t_anna')),
      json_build_object('label', 'vorst', 'bezetter_id', null),
      json_build_object('label', 'raadslid', 'bezetter_id', current_setting('test.t_bert'))))::text),
  'een beheerder zet de bak aan met drie plekken');
reset role;
select is(pg_temp.bak('t_k_avond'), 'prins:t_anna, vorst:-, raadslid:t_bert', 'de plekken staan in de gevraagde volgorde, ook een lege');
select is((select bak_actief from public.activiteiten where naam = 'T K Avond'), true, 'de schakelaar staat aan');
select is((select count(*)::int from public.berichten where activiteit_naam = 'T K Avond' and lid_id = current_setting('test.t_anna')::uuid
            and tekst = 'Je zit in de bak.'), 1, 'wie in de bak komt, krijgt bericht (de activiteit is gepubliceerd)');
select is((select count(*)::int from public.wijzigingen_log where actie = 'bak_gewijzigd' and rij_id = current_setting('test.t_k_avond')::uuid),
  1, 'het staat in de wijzigingenlog, zonder namen');

-- ===== Samen met de rest van het scherm: alles of niets =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select throws_ok(
  format($f$ select public.activiteit_opslaan_met_bak(%L::uuid, '{"naam": "T K Nieuwe naam"}'::jsonb, '[]'::jsonb, false, %s, %L::jsonb) $f$,
    current_setting('test.t_k_avond'), (select versie::text from public.activiteiten where naam = 'T K Avond'),
    '{"actief": true, "plekken": [{"label": "koning", "bezetter_id": null}]}'),
  'BK001', 'veld_ongeldig', 'een label dat niet bestaat is een fout');
reset role;
select is((select count(*)::int from public.activiteiten where naam = 'T K Nieuwe naam'), 0,
  'en dan gaat ook de rest van het scherm niet door (alles of niets)');
select is(pg_temp.bak('t_k_avond'), 'prins:t_anna, vorst:-, raadslid:t_bert', 'en de bak is onveranderd');

select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select lives_ok(
  format($f$ select public.activiteit_opslaan_met_bak(%L::uuid, '{"locatie": "Zaal"}'::jsonb, '[]'::jsonb, false, %s, %L::jsonb) $f$,
    current_setting('test.t_k_avond'), (select versie::text from public.activiteiten where naam = 'T K Avond'),
    json_build_object('actief', true, 'plekken', json_build_array(
      json_build_object('slot_id', (select id from public.rol_slots where bezetter_id = current_setting('test.t_anna')::uuid and rol_type = 'bak'),
                        'verwachte_bezetter', current_setting('test.t_anna'), 'label', 'prins', 'bezetter_id', current_setting('test.t_carla')),
      json_build_object('slot_id', (select id from public.rol_slots where plek_label = 'vorst' and rol_type = 'bak'),
                        'verwachte_bezetter', null, 'label', 'vorst', 'bezetter_id', null),
      json_build_object('slot_id', (select id from public.rol_slots where bezetter_id = current_setting('test.t_bert')::uuid and rol_type = 'bak'),
                        'verwachte_bezetter', current_setting('test.t_bert'), 'label', 'raadslid', 'bezetter_id', current_setting('test.t_bert'))))::text),
  'iemand in de bak vervangen, samen met een ander veld');
reset role;
select is(pg_temp.bak('t_k_avond'), 'prins:t_carla, vorst:-, raadslid:t_bert', 'de prins is vervangen');
select is((select locatie from public.activiteiten where naam = 'T K Avond'), 'Zaal', 'en het andere veld is mee opgeslagen');
select is((select count(*)::int from public.berichten where activiteit_naam = 'T K Avond' and lid_id = current_setting('test.t_anna')::uuid
            and tekst = 'Je zit niet meer in de bak.'), 1, 'wie eruit gaat, krijgt bericht');
select is((select count(*)::int from public.berichten where activiteit_naam = 'T K Avond' and lid_id = current_setting('test.t_bert')::uuid), 1,
  'wie blijft zitten krijgt niets nieuws (alleen het bericht van toen hij erin kwam)');

-- ===== Twee beheerders tegelijk: verwachte_bezetter =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select throws_ok(
  format($f$ select public.activiteit_opslaan_met_bak(%L::uuid, '{}'::jsonb, '[]'::jsonb, false, %s, %L::jsonb) $f$,
    current_setting('test.t_k_avond'), (select versie::text from public.activiteiten where naam = 'T K Avond'),
    json_build_object('actief', true, 'plekken', json_build_array(
      json_build_object('slot_id', (select id from public.rol_slots where plek_label = 'prins' and rol_type = 'bak'),
                        'verwachte_bezetter', current_setting('test.t_anna'), 'label', 'prins', 'bezetter_id', current_setting('test.t_els'))))::text),
  'BK001', 'slot_gewijzigd', 'wie de bak wijzigt zonder te weten dat een ander het al deed, krijgt slot_gewijzigd');
reset role;

-- ===== Wie niet in de bak kan =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select throws_ok(
  format($f$ select public.activiteit_opslaan_met_bak(%L::uuid, '{}'::jsonb, '[]'::jsonb, false, %s, %L::jsonb) $f$,
    current_setting('test.t_k_avond'), (select versie::text from public.activiteiten where naam = 'T K Avond'),
    json_build_object('actief', true, 'plekken', json_build_array(
      json_build_object('label', 'raadslid', 'bezetter_id', current_setting('test.t_els')),
      json_build_object('label', 'raadslid', 'bezetter_id', current_setting('test.t_els'))))::text),
  'BK001', 'dubbelboeking', 'niemand twee keer in de bak');
select throws_ok(
  format($f$ select public.activiteit_opslaan_met_bak(%L::uuid, '{}'::jsonb, '[]'::jsonb, false, %s, %L::jsonb) $f$,
    current_setting('test.t_k_avond'), (select versie::text from public.activiteiten where naam = 'T K Avond'),
    json_build_object('actief', true, 'plekken', json_build_array(
      json_build_object('label', 'raadslid', 'bezetter_id', current_setting('test.t_dirk'))))::text),
  'BK001', 'dubbelboeking', 'ook niet iemand die al een andere plek bij deze activiteit heeft (dirk is werker)');
select throws_ok(
  format($f$ select public.activiteit_opslaan_met_bak(%L::uuid, '{}'::jsonb, '[]'::jsonb, false, %s, %L::jsonb) $f$,
    current_setting('test.t_k_avond'), (select versie::text from public.activiteiten where naam = 'T K Avond'),
    json_build_object('actief', true, 'plekken', json_build_array(
      json_build_object('label', 'raadslid', 'bezetter_id', current_setting('test.t_hugo'))))::text),
  'BK001', 'veld_ongeldig', 'een externe helper kan niet in de bak');
select throws_ok(
  format($f$ select public.activiteit_opslaan_met_bak(%L::uuid, '{}'::jsonb, '[]'::jsonb, false, %s, %L::jsonb) $f$,
    current_setting('test.t_k_avond'), (select versie::text from public.activiteiten where naam = 'T K Avond'),
    json_build_object('actief', true, 'plekken', json_build_array(
      json_build_object('label', 'raadslid', 'bezetter_id', current_setting('test.t_gina'))))::text),
  'BK001', 'veld_ongeldig', 'een inactief lid ook niet');
select throws_ok(
  format($f$ select public.activiteit_opslaan_met_bak(%L::uuid, '{}'::jsonb, '[]'::jsonb, false, %s, %L::jsonb) $f$,
    current_setting('test.t_k_avond'), (select versie::text from public.activiteiten where naam = 'T K Avond'),
    json_build_object('actief', true, 'plekken', json_build_array(
      json_build_object('slot_id', gen_random_uuid(), 'label', 'raadslid', 'bezetter_id', null)))::text),
  'BK001', 'veld_ongeldig', 'een bakplek die niet bij deze activiteit hoort is een fout');
reset role;
select is(pg_temp.bak('t_k_avond'), 'prins:t_carla, vorst:-, raadslid:t_bert', 'na al die fouten is de bak onveranderd');

-- ===== Plekken eraf, en de bak uit =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select lives_ok(
  format($f$ select public.activiteit_opslaan_met_bak(%L::uuid, '{}'::jsonb, '[]'::jsonb, false, %s, %L::jsonb) $f$,
    current_setting('test.t_k_avond'), (select versie::text from public.activiteiten where naam = 'T K Avond'),
    json_build_object('actief', true, 'plekken', json_build_array(
      json_build_object('slot_id', (select id from public.rol_slots where bezetter_id = current_setting('test.t_bert')::uuid and rol_type = 'bak'),
                        'verwachte_bezetter', current_setting('test.t_bert'), 'label', 'raadslid', 'bezetter_id', current_setting('test.t_bert'))))::text),
  'een lijst met minder plekken haalt de rest weg');
reset role;
select is(pg_temp.bak('t_k_avond'), 'raadslid:t_bert', 'alleen de genoemde plek blijft');

select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select lives_ok(
  format($f$ select public.activiteit_opslaan_met_bak(%L::uuid, '{}'::jsonb, '[]'::jsonb, false, %s, %L::jsonb) $f$,
    current_setting('test.t_k_avond'), (select versie::text from public.activiteiten where naam = 'T K Avond'),
    '{"actief": false}'),
  'de bak uitzetten');
reset role;
select is(pg_temp.bak('t_k_avond'), '', 'uit betekent geen bakplekken');
select is((select bak_actief from public.activiteiten where naam = 'T K Avond'), false, 'en de schakelaar staat uit');

-- ===== Zonder bak in de aanroep verandert er niets aan de bak =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select lives_ok(
  format($f$ select public.activiteit_opslaan_met_bak(%L::uuid, '{"locatie": "Hal"}'::jsonb, '[]'::jsonb, false, %s) $f$,
    current_setting('test.t_k_avond'), (select versie::text from public.activiteiten where naam = 'T K Avond')),
  'zonder bak in de aanroep werkt het als gewoon opslaan');
reset role;

-- ===== Een bak zonder verschil verandert niets: de versie loopt niet extra op en er komt niets in het log =====
-- Het scherm stuurt de bak bij elke opslag mee. Gewoon opslaan verhoogt de versie met 1; de bak voegt daar niets aan toe.
select set_config('test.v_voor', (select versie::text from public.activiteiten where naam = 'T K Avond'), true);
select set_config('test.log_voor', (select count(*)::text from public.wijzigingen_log where actie = 'bak_gewijzigd'), true);
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select lives_ok(
  format($f$ select public.activiteit_opslaan_met_bak(%L::uuid, '{"locatie": "Hal 2"}'::jsonb, '[]'::jsonb, false, %s, '{"actief": false}'::jsonb) $f$,
    current_setting('test.t_k_avond'), current_setting('test.v_voor')),
  'opslaan met een bak die uit blijft staan');
reset role;
select is((select versie from public.activiteiten where naam = 'T K Avond') - current_setting('test.v_voor')::int, 1,
  'een bak zonder verschil verhoogt de versie niet extra');
select is((select count(*)::int from public.wijzigingen_log where actie = 'bak_gewijzigd'), current_setting('test.log_voor')::int,
  'en schrijft niets in het log');

-- ===== Wat een lid ziet, en wat een lid niet kan =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select lives_ok(
  format($f$ select public.activiteit_opslaan_met_bak(%L::uuid, '{}'::jsonb, '[]'::jsonb, false, %s, %L::jsonb) $f$,
    current_setting('test.t_k_avond'), (select versie::text from public.activiteiten where naam = 'T K Avond'),
    json_build_object('actief', true, 'plekken', json_build_array(
      json_build_object('label', 'vorst', 'bezetter_id', current_setting('test.t_anna'))))::text),
  'de bak weer aan, met een vorst');
reset role;

select pg_temp.als('t_els');
set local role authenticated;
select is((select count(*)::int from public.rol_slots where activiteit_id = current_setting('test.t_k_avond')::uuid and rol_type = 'bak'
            and bezetter_id is not null), 1, 'een gewoon lid ziet wie in de bak zit');
reset role;

select pg_temp.als('t_anna');
set local role authenticated;
select throws_ok(
  format($f$ select public.meld_af(%L::uuid, null) $f$, current_setting('test.t_k_avond')),
  'BK001', 'heeft_adminrol', 'een lid in de bak kan zich er niet voor afmelden (R23)');
reset role;

select ok(not has_function_privilege('authenticated', 'intern.bak_zetten(uuid, jsonb)', 'execute')
          and not has_function_privilege('anon', 'public.activiteit_opslaan_met_bak(uuid, jsonb, jsonb, boolean, int, jsonb)', 'execute')
          and has_function_privilege('authenticated', 'public.activiteit_opslaan_met_bak(uuid, jsonb, jsonb, boolean, int, jsonb)', 'execute'),
  'alleen ingelogde leden roepen de nieuwe functie aan, de hulpfunctie niemand');

select * from finish();
rollback;
