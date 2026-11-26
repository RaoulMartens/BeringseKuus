-- Databasetests voor leden beheren in de app (migratie 20261126100000): wie het mag, de lijst, lezen, opslaan (telefoon, groepen, aanmerkingen,
-- de blokkade bij een dienst), op inactief zetten (R30 t/m R33: de plekken vallen leeg, de historie blijft, geen jezelf of beheerder) en
-- weer actief maken. Draaien met: npm run test:db. Alles in één transactie die wordt teruggedraaid. Alleen eigen leden ("t_...").

begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- ===== Hulpen (alleen in deze transactie) =====
create temp table gebruikers (naam text primary key, uid uuid not null, lid uuid);

create function pg_temp.maak(p_naam text, p_admin boolean default false, p_type text default 'lid') returns void
language plpgsql
as $$
declare
  v_uid uuid := gen_random_uuid();
  v_lid uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_naam || '@example.com', now(), now());
  insert into public.leden (auth_user_id, voornaam, achternaam, type) values (v_uid, p_naam, 'Test', p_type)
  returning id into v_lid;
  insert into public.leden_prive (lid_id, email, is_admin, beheerder_sinds)
  values (v_lid, p_naam || '@example.com', p_admin, case when p_admin then timestamptz '2026-06-01' end);
  insert into pg_temp.gebruikers values (p_naam, v_uid, v_lid);
end
$$;

create function pg_temp.app(p_naam text, p_tijd timestamptz) returns void
language sql
as $$
  insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
  select gen_random_uuid(), uid, 'totp', 'verified'::auth.factor_status, p_tijd, p_tijd from pg_temp.gebruikers where naam = p_naam
$$;

create function pg_temp.lid(p_naam text) returns uuid language sql as $$ select lid from pg_temp.gebruikers where naam = p_naam $$;

create function pg_temp.groep(p_naam text) returns uuid language sql as $$ select id from public.groepen where naam = p_naam $$;

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

create function pg_temp.act(p_naam text, p_datum date, p_status text) returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  insert into public.activiteiten (naam, datum, starttijd, eindtijd, locatie, status)
  values (p_naam, p_datum, case when p_status = 'concept' then null else time '20:00' end,
          case when p_status = 'concept' then null else time '23:00' end,
          case when p_status = 'concept' then null else 'De Kuus' end, p_status)
  returning id into v_id;
  return v_id;
end
$$;

create function pg_temp.plek(p_act uuid, p_rol text, p_lid uuid) returns uuid
language sql
as $$
  insert into public.rol_slots (activiteit_id, rol_type, bezetter_id) values (p_act, p_rol, p_lid) returning id
$$;

-- De foutcode van een aanroep als tekst ("geen fout" als het lukt); een fout rolt alleen die aanroep terug.
create function public.t_rz(p_sql text) returns text
language plpgsql
as $$
declare v_msg text;
begin
  execute p_sql;
  return 'geen fout';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end
$$;
grant execute on function public.t_rz(text) to authenticated;

-- t_mark en t_adm2 zijn beheerders. t_lid is een gewoon lid in Dames en Bestuur. t_ander is een gewoon lid zonder diensten. t_beheeracc is een
-- beheeraccount (telt nergens als lid mee) en t_extern een externe helper.
select pg_temp.maak('t_mark', true);
select pg_temp.maak('t_adm2', true);
select pg_temp.app('t_mark', timestamptz '2026-05-01');
select pg_temp.app('t_adm2', timestamptz '2026-05-01');
select pg_temp.maak('t_lid');
select pg_temp.maak('t_ander');
select pg_temp.maak('t_beheeracc');
update public.leden set alleen_beheer = true where id = pg_temp.lid('t_beheeracc');
insert into public.leden (voornaam, achternaam, type) values ('t_extern', '', 'extern');

insert into public.lid_groep (lid_id, groep_id) values
  (pg_temp.lid('t_lid'), pg_temp.groep('Dames')),
  (pg_temp.lid('t_lid'), pg_temp.groep('Bestuur')),
  (pg_temp.lid('t_ander'), pg_temp.groep('Overige leden'));

-- A: een concept met een werker-plek van t_lid. B: gepubliceerd, alleen voor Bestuur, met t_lid als eindverantwoordelijke.
-- C: gisteren geweest, met een plek van t_lid (de historie).
select set_config('test.a', pg_temp.act('t_concept', current_date + 10, 'concept')::text, true);
select set_config('test.b', pg_temp.act('t_gepubliceerd', current_date + 20, 'gepubliceerd')::text, true);
select set_config('test.c', pg_temp.act('t_geweest', current_date - 1, 'gepubliceerd')::text, true);
select pg_temp.plek(current_setting('test.a')::uuid, 'werker', pg_temp.lid('t_lid'));
select pg_temp.plek(current_setting('test.b')::uuid, 'eindverantwoordelijke', pg_temp.lid('t_lid'));
select pg_temp.plek(current_setting('test.c')::uuid, 'werker', pg_temp.lid('t_lid'));
insert into public.activiteit_groep (activiteit_id, groep_id) values (current_setting('test.b')::uuid, pg_temp.groep('Bestuur'));

select set_config('test.lid', pg_temp.lid('t_lid')::text, true);
select set_config('test.ander', pg_temp.lid('t_ander')::text, true);
select set_config('test.adm2', pg_temp.lid('t_adm2')::text, true);
select set_config('test.mark', pg_temp.lid('t_mark')::text, true);
select set_config('test.acc', pg_temp.lid('t_beheeracc')::text, true);
select set_config('test.extern', (select id::text from public.leden where voornaam = 't_extern'), true);
select set_config('test.dames', pg_temp.groep('Dames')::text, true);
select set_config('test.bestuur', pg_temp.groep('Bestuur')::text, true);
select set_config('test.versie_b', (select versie::text from public.activiteiten where id = current_setting('test.b')::uuid), true);

-- ===== 1. Wie het mag =====
select pg_temp.als('t_ander', 'aal2');
set local role authenticated;
select is(public.t_rz('select * from public.leden_beheer_lijst()'), 'geen_admin', 'een gewoon lid ziet de ledenlijst niet');
select is(public.t_rz($$ select public.lid_beheer_lezen('$$ || current_setting('test.lid') || $$') $$), 'geen_admin',
  'een gewoon lid kan een lid niet lezen');
select is(public.t_rz($$ select public.lid_opslaan('$$ || current_setting('test.lid') || $$', null, array['$$
  || current_setting('test.dames') || $$']::uuid[], null, null) $$), 'geen_admin', 'een gewoon lid kan geen lid opslaan');
select is(public.t_rz($$ select public.lid_inactief_zetten('$$ || current_setting('test.lid') || $$') $$), 'geen_admin',
  'een gewoon lid kan niemand op inactief zetten');
select is(public.t_rz($$ select public.lid_actief_zetten('$$ || current_setting('test.lid') || $$') $$), 'geen_admin',
  'een gewoon lid kan niemand weer actief maken');
reset role;

select pg_temp.als('t_mark', 'aal1');
set local role authenticated;
select is(public.t_rz('select * from public.leden_beheer_lijst()'), 'geen_admin', 'een beheerder zonder recente code ziet de ledenlijst niet');
reset role;

-- ===== 2. De lijst =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is((select count(*)::int from public.leden_beheer_lijst() where lid_id = current_setting('test.lid')::uuid), 1,
  'een lid staat in de lijst');
select is((select count(*)::int from public.leden_beheer_lijst()
            where lid_id in (current_setting('test.extern')::uuid, current_setting('test.acc')::uuid)), 0,
  'een externe helper en een beheeraccount staan er niet in');
select is((select groepen from public.leden_beheer_lijst() where lid_id = current_setting('test.lid')::uuid), array['Bestuur', 'Dames'],
  'de groepen staan er op volgorde bij');
select is((select ooit_ingelogd from public.leden_beheer_lijst() where lid_id = current_setting('test.lid')::uuid), false,
  'wie nog nooit is ingelogd, staat als zodanig in de lijst');

-- ===== 3. Eén lid lezen =====
select is(public.t_rz($$ select public.lid_beheer_lezen('$$ || current_setting('test.extern') || $$') $$), 'lid_onbekend',
  'een externe helper is geen lid om te beheren');
select is(jsonb_array_length(public.lid_beheer_lezen(current_setting('test.lid')::uuid) -> 'diensten'), 2,
  'de komende diensten staan erbij (het concept en de gepubliceerde, niet die van gisteren)');
select is((select count(*)::int from jsonb_array_elements(public.lid_beheer_lezen(current_setting('test.lid')::uuid) -> 'groepen') g
            where (g ->> 'gekozen')::boolean), 2, 'de groepen van het lid zijn gekozen');
reset role;

-- ===== 4. Opslaan =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.lid_opslaan('$$ || current_setting('test.lid') || $$', '12345', array['$$
  || current_setting('test.dames') || $$', '$$ || current_setting('test.bestuur') || $$']::uuid[], null, null) $$), 'telefoon_ongeldig',
  'een telefoonnummer dat niet klopt wordt geweigerd');
select is(public.t_rz($$ select public.lid_opslaan('$$ || current_setting('test.lid') || $$', null, '{}'::uuid[], null, null) $$), 'groep_nodig',
  'een lid moet in minstens één groep blijven');
select is(public.t_rz($$ select public.lid_opslaan('$$ || current_setting('test.lid') || $$', null, array[gen_random_uuid()], null, null) $$),
  'groep_onbekend', 'een groep die niet bestaat wordt geweigerd');
select is(public.t_rz($$ select public.lid_opslaan('$$ || current_setting('test.lid') || $$', null, array['$$
  || current_setting('test.dames') || $$']::uuid[], null, null) $$), 'dienst_blokkeert',
  'uit Bestuur halen kan niet zolang het lid een plek heeft bij een activiteit voor Bestuur');
select is(public.t_rz($$ select public.lid_opslaan('$$ || current_setting('test.lid') || $$', '06 12 34 56 78', array['$$
  || current_setting('test.dames') || $$', '$$ || current_setting('test.bestuur') || $$']::uuid[], true, false) $$), 'geen fout',
  'telefoon en aanmerkingen opslaan lukt');
reset role;
select is((select telefoon from public.leden_prive where lid_id = current_setting('test.lid')::uuid), '06 12 34 56 78', 'het telefoonnummer staat erin');
select is((select mag_bob from public.leden_prive where lid_id = current_setting('test.lid')::uuid), true, 'mag_bob staat aan');

set local role authenticated;
select is(public.t_rz($$ select public.lid_opslaan('$$ || current_setting('test.lid') || $$', '', array['$$
  || current_setting('test.dames') || $$', '$$ || current_setting('test.bestuur') || $$']::uuid[], null, null) $$), 'geen fout',
  'een leeg telefoonveld is geen fout');
reset role;
select is((select telefoon from public.leden_prive where lid_id = current_setting('test.lid')::uuid), '06 12 34 56 78',
  'een leeg telefoonveld wist het nummer niet');

-- ===== 5. Op inactief zetten =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.lid_inactief_zetten('$$ || current_setting('test.mark') || $$') $$), 'zelf', 'jezelf kun je niet op inactief zetten');
select is(public.t_rz($$ select public.lid_inactief_zetten('$$ || current_setting('test.adm2') || $$') $$), 'is_beheerder',
  'een beheerder kan niet op inactief: eerst de rechten intrekken');
select is(public.t_rz($$ select public.lid_inactief_zetten('$$ || current_setting('test.extern') || $$') $$), 'lid_onbekend',
  'een externe helper is geen lid om op inactief te zetten');
select is((public.lid_inactief_zetten(current_setting('test.lid')::uuid) ->> 'plekken_open')::int, 2,
  'op inactief zetten maakt twee komende plekken leeg');
reset role;
select is((select actief from public.leden where id = current_setting('test.lid')::uuid), false, 'het lid is inactief');
select is((select count(*)::int from public.rol_slots where bezetter_id = current_setting('test.lid')::uuid and activiteit_id <> current_setting('test.c')::uuid), 0,
  'de plekken van het lid bij komende activiteiten zijn leeg');
select is((select count(*)::int from public.rol_slots where bezetter_id = current_setting('test.lid')::uuid and activiteit_id = current_setting('test.c')::uuid), 1,
  'wat het lid deed blijft staan (eerdere diensten)');
select ok((select versie from public.activiteiten where id = current_setting('test.b')::uuid) > current_setting('test.versie_b')::int,
  'een activiteit waar een plek openviel is gewijzigd, zodat een open scherm van een ander dat merkt');
select is((select count(*)::int from public.wijzigingen_log where actie = 'lid_inactief_gezet' and rij_id = current_setting('test.lid')::uuid), 1,
  'het staat in het wijzigingenlog');

set local role authenticated;
select is(public.t_rz($$ select public.lid_inactief_zetten('$$ || current_setting('test.lid') || $$') $$), 'al_inactief', 'twee keer inactief zetten kan niet');

-- ===== 6. Weer actief =====
select is(public.t_rz($$ select public.lid_actief_zetten('$$ || current_setting('test.ander') || $$') $$), 'al_actief', 'een actief lid weer actief maken kan niet');
select is(public.t_rz($$ select public.lid_actief_zetten('$$ || current_setting('test.lid') || $$') $$), 'geen fout', 'weer actief maken lukt');
reset role;
select is((select actief from public.leden where id = current_setting('test.lid')::uuid), true, 'het lid is weer actief');
select is((select count(*)::int from public.rol_slots where bezetter_id = current_setting('test.lid')::uuid and activiteit_id <> current_setting('test.c')::uuid), 0,
  'de plekken van eerder komen niet terug');

select * from finish();
rollback;
