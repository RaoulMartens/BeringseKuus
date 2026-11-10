-- Databasetests voor beheerders beheren in de app (migratie 20261110150000): wie het mag, de statussen, elke foutcode, en
-- dat een bevestigd lid daarna echt beheerder is. Draaien met: npm run test:db. Alles in één transactie die wordt
-- teruggedraaid. Alleen eigen leden ("t_...").

begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

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
  insert into pg_temp.gebruikers values (p_naam, v_uid, v_lid);
end
$$;

create function pg_temp.app(p_naam text, p_status text, p_tijd timestamptz) returns void
language sql
as $$
  insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
  select gen_random_uuid(), uid, 'totp', p_status::auth.factor_status, p_tijd, p_tijd from pg_temp.gebruikers where naam = p_naam
$$;

create function pg_temp.lid(p_naam text) returns uuid language sql as $$ select lid from pg_temp.gebruikers where naam = p_naam $$;

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

-- t_mark is beheerder met een app van vóór beheerder_sinds. t_wacht is beheerder met een app van ná beheerder_sinds
-- (wacht op bevestiging), plus een niet-geverifieerde app. t_dubbel heeft twee geverifieerde apps na beheerder_sinds.
select pg_temp.maak('t_mark', true);
select pg_temp.app('t_mark', 'verified', timestamptz '2026-05-01');
select pg_temp.maak('t_kand');
select pg_temp.maak('t_kand2');
select pg_temp.app('t_kand2', 'verified', timestamptz '2026-05-01');
select pg_temp.maak('t_wacht', true);
select pg_temp.app('t_wacht', 'verified', timestamptz '2026-07-01');
select pg_temp.app('t_wacht', 'unverified', timestamptz '2026-07-02');
select pg_temp.maak('t_dubbel', true);
select pg_temp.app('t_dubbel', 'verified', timestamptz '2026-07-01');
select pg_temp.app('t_dubbel', 'verified', timestamptz '2026-07-02');
select pg_temp.maak('t_zonder');
update public.leden set auth_user_id = null where id = pg_temp.lid('t_zonder');
insert into public.leden (voornaam, achternaam, type) values ('t_extern', '', 'extern');

select set_config('test.kand', pg_temp.lid('t_kand')::text, true);
select set_config('test.kand2', pg_temp.lid('t_kand2')::text, true);
select set_config('test.wacht', pg_temp.lid('t_wacht')::text, true);
select set_config('test.dubbel', pg_temp.lid('t_dubbel')::text, true);
select set_config('test.mark', pg_temp.lid('t_mark')::text, true);
select set_config('test.zonder', pg_temp.lid('t_zonder')::text, true);
select set_config('test.extern', (select id::text from public.leden where voornaam = 't_extern'), true);
select set_config('test.app_wacht',
  (select f.id::text from auth.mfa_factors f join pg_temp.gebruikers g on g.uid = f.user_id
    where g.naam = 't_wacht' and f.status = 'verified'), true);

-- ===== 1. Wie het mag =====
-- Een lid dat geen beheerder is, en een beheerder zonder recente code, krijgt geen_admin.
select pg_temp.als('t_kand', 'aal2');
set local role authenticated;
select is(public.t_rz('select * from public.beheerders_lijst()'), 'geen_admin', 'een gewoon lid ziet de beheerderslijst niet');
select is(public.t_rz('select * from public.beheerder_kandidaten()'), 'geen_admin', 'een gewoon lid ziet de kandidaten niet');
select is(public.t_rz($$ select public.beheerder_maken('$$ || current_setting('test.kand2') || $$') $$), 'geen_admin',
  'een gewoon lid kan geen beheerder maken');
select is(public.t_rz($$ select public.beheerder_bevestigen('$$ || current_setting('test.wacht') || $$', '$$
  || current_setting('test.app_wacht') || $$') $$), 'geen_admin', 'een gewoon lid kan geen toegang bevestigen');
select is(public.t_rz($$ select public.beheerder_intrekken('$$ || current_setting('test.wacht') || $$') $$), 'geen_admin',
  'een gewoon lid kan geen beheerrechten intrekken');
reset role;

select pg_temp.als('t_mark', 'aal1');
set local role authenticated;
select is(public.t_rz('select * from public.beheerders_lijst()'), 'geen_admin',
  'een beheerder zonder recente code ziet de lijst niet (zoals voor alle beheer)');
reset role;

-- ===== 2. Kandidaten en lijst =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select set_config('test.kandidaten',
  (select coalesce(jsonb_agg(k.voornaam order by k.voornaam), '[]') from public.beheerder_kandidaten() k
    where k.voornaam like 't\_%')::text, true);
select set_config('test.lijst',
  (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.beheerders_lijst() b where b.voornaam like 't\_%')::text, true);
reset role;

select is(current_setting('test.kandidaten')::jsonb, '["t_kand", "t_kand2"]'::jsonb,
  'kandidaten: actieve leden met een account die geen beheerder zijn (niet een beheerder, niet zonder account, niet een externe)');
select is((select b ->> 'status' from jsonb_array_elements(current_setting('test.lijst')::jsonb) b where b ->> 'voornaam' = 't_mark'),
  'beheerder', 'een beheerder met een app van vóór beheerder_sinds heeft status beheerder');
select ok((select (b ->> 'is_ik')::boolean from jsonb_array_elements(current_setting('test.lijst')::jsonb) b where b ->> 'voornaam' = 't_mark'),
  'de aanroeper herkent zichzelf in de lijst (is_ik)');
select is((select b ->> 'status' from jsonb_array_elements(current_setting('test.lijst')::jsonb) b where b ->> 'voornaam' = 't_wacht'),
  'wacht_op_bevestiging', 'een app van ná beheerder_sinds: wacht op bevestiging');
select is((select b ->> 'app_id' from jsonb_array_elements(current_setting('test.lijst')::jsonb) b where b ->> 'voornaam' = 't_wacht'),
  current_setting('test.app_wacht'), 'de lijst noemt de geverifieerde app, niet de niet-geverifieerde');
select is((select (b ->> 'aantal_apps')::int from jsonb_array_elements(current_setting('test.lijst')::jsonb) b where b ->> 'voornaam' = 't_dubbel'),
  2, 'het aantal geverifieerde apps staat erbij');

-- ===== 3. Beheerder maken =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select set_config('test.maken', public.beheerder_maken(current_setting('test.kand2')::uuid)::text, true);
reset role;
select is(current_setting('test.maken')::jsonb ->> 'voornaam', 't_kand2', 'maken geeft de naam terug voor de melding');
select ok((select is_admin and beheerder_sinds <= clock_timestamp() from public.leden_prive where lid_id = pg_temp.lid('t_kand2')),
  'het lid is beheerder met beheerder_sinds op het moment van nu');
select is((select count(*)::int from auth.mfa_factors f join pg_temp.gebruikers g on g.uid = f.user_id where g.naam = 't_kand2'), 0,
  'een app van vóór het maken is weg: anders telt hij als bevestigd');
select is((select actie || '|' || (door_lid_id = pg_temp.lid('t_mark'))::text from public.wijzigingen_log
            where tabel = 'leden_prive' and rij_id = pg_temp.lid('t_kand2') order by id desc limit 1),
  'beheer_aangezet|true', 'het staat in het spoor, met de beheerder die het deed');

select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.beheerder_maken('$$ || current_setting('test.kand2') || $$') $$), 'al_beheerder',
  'iemand die al beheerder is, kun je niet nog eens maken');
select is(public.t_rz($$ select public.beheerder_maken(gen_random_uuid()) $$), 'lid_onbekend', 'een onbekend lid kan niet');
select is(public.t_rz($$ select public.beheerder_maken('$$ || current_setting('test.extern') || $$') $$), 'lid_onbekend',
  'een externe helper kan niet (geen account)');
select is(public.t_rz($$ select public.beheerder_maken('$$ || current_setting('test.zonder') || $$') $$), 'lid_geen_account',
  'een lid zonder inlogaccount kan niet');
reset role;

-- ===== 4. Toegang bevestigen =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.beheerder_bevestigen('$$ || current_setting('test.mark') || $$', gen_random_uuid()) $$), 'zelf',
  'je kunt je eigen toegang niet bevestigen');
select is(public.t_rz($$ select public.beheerder_bevestigen('$$ || current_setting('test.kand') || $$', gen_random_uuid()) $$), 'geen_beheerder',
  'wie geen beheerder is, valt niets te bevestigen');
select is(public.t_rz($$ select public.beheerder_bevestigen('$$ || current_setting('test.kand2') || $$', gen_random_uuid()) $$), 'niets_te_bevestigen',
  'een beheerder zonder app heeft niets te bevestigen');
select is(public.t_rz($$ select public.beheerder_bevestigen('$$ || current_setting('test.dubbel') || $$', gen_random_uuid()) $$), 'app_onduidelijk',
  'bij twee geverifieerde apps bevestig je niet: onduidelijk welke de zijne is');
select is(public.t_rz($$ select public.beheerder_bevestigen('$$ || current_setting('test.wacht') || $$', gen_random_uuid()) $$), 'app_gewijzigd',
  'een andere app dan die je zag: app_gewijzigd, en er gebeurt niets');
reset role;
select ok((select beheerder_sinds = timestamptz '2026-06-01' from public.leden_prive where lid_id = pg_temp.lid('t_wacht')),
  'na de geweigerde pogingen staat beheerder_sinds nog zoals hij was');

select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select set_config('test.bevestigd',
  public.beheerder_bevestigen(current_setting('test.wacht')::uuid, current_setting('test.app_wacht')::uuid)::text, true);
reset role;
select is(current_setting('test.bevestigd')::jsonb ->> 'voornaam', 't_wacht', 'bevestigen geeft de naam terug voor de melding');
select ok((select beheerder_sinds > timestamptz '2026-07-02' from public.leden_prive where lid_id = pg_temp.lid('t_wacht')),
  'beheerder_sinds staat nu ná de app');
select is((select count(*)::int from auth.mfa_factors f join pg_temp.gebruikers g on g.uid = f.user_id
            where g.naam = 't_wacht' and f.status <> 'verified'), 0, 'een niet-geverifieerde app is bij het bevestigen weggehaald');
select is((select actie from public.wijzigingen_log where tabel = 'leden_prive' and rij_id = pg_temp.lid('t_wacht')
            order by id desc limit 1), 'beheerder_sinds_gewijzigd', 'de bevestiging staat in het spoor');

-- Het lid is nu echt beheerder (met een recente code van zijn app).
select pg_temp.als('t_wacht', 'aal2');
set local role authenticated;
select is(public.beheerstatus(), 'ok', 'na de bevestiging is het lid beheerder (beheerstatus ok)');
reset role;

-- ===== 5. Intrekken =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.beheerder_intrekken('$$ || current_setting('test.mark') || $$') $$), 'zelf',
  'je kunt je eigen beheerrechten niet intrekken, zodat er altijd een beheerder overblijft');
select is(public.t_rz($$ select public.beheerder_intrekken('$$ || current_setting('test.kand') || $$') $$), 'geen_beheerder',
  'iemand die geen beheerder is, kun je niet intrekken');
select set_config('test.ingetrokken', public.beheerder_intrekken(current_setting('test.wacht')::uuid)::text, true);
reset role;
select is(current_setting('test.ingetrokken')::jsonb ->> 'voornaam', 't_wacht', 'intrekken geeft de naam terug voor de melding');
select ok((select not is_admin and beheerder_sinds is null from public.leden_prive where lid_id = pg_temp.lid('t_wacht')),
  'het lid is geen beheerder meer en beheerder_sinds is leeg');
select is((select count(*)::int from auth.mfa_factors f join pg_temp.gebruikers g on g.uid = f.user_id where g.naam = 't_wacht'), 0,
  'zijn apps zijn losgekoppeld');
select is((select actie from public.wijzigingen_log where tabel = 'leden_prive' and rij_id = pg_temp.lid('t_wacht')
            order by id desc limit 1), 'beheer_uitgezet', 'het intrekken staat in het spoor');

select pg_temp.als('t_wacht', 'aal2');
set local role authenticated;
select is(public.beheerstatus(), 'geen_beheerder', 'na het intrekken is hij geen beheerder meer');
reset role;

select * from finish();
rollback;
