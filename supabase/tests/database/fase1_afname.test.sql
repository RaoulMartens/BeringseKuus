-- Databasetests fase 1, afname (review van fase 1 als geheel, 30-10-2026, en de review van de migratie): beheerder_sinds
-- niet in de toekomst (F1-02), het auditspoor voor beheerrechten (F1-07) en een index op elke vreemde sleutel (F1-21).
-- Draaien met: npm run test:db. Alles in één transactie die wordt teruggedraaid. Hangt niet af van de seed: alleen eigen
-- leden ("t_...").

begin;
create extension if not exists pgtap with schema extensions;
select plan(31);
set local timezone = 'UTC';

create temp table gebruikers (naam text primary key, uid uuid not null, lid uuid);

create function pg_temp.maak(p_naam text, p_admin boolean default false, p_factor boolean default false) returns void
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
  if p_factor then
    insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
    values (gen_random_uuid(), v_uid, 'totp', 'verified', timestamptz '2026-05-01', timestamptz '2026-05-01');
  end if;
  insert into pg_temp.gebruikers values (p_naam, v_uid, v_lid);
end
$$;
create function pg_temp.lid(p_naam text) returns uuid language sql as $$ select lid from pg_temp.gebruikers where naam = p_naam $$;
create function pg_temp.laatste_actie(p_naam text) returns text language sql as $$
  select actie from public.wijzigingen_log where tabel = 'leden_prive' and rij_id = pg_temp.lid(p_naam) order by id desc limit 1
$$;

select pg_temp.maak('t_een');
select pg_temp.maak('t_twee');

-- ===== 1a. beheerder_sinds niet in de toekomst (F1-02) =====
-- Bij het aanzetten van beheer zet de trigger zelf het moment van nu: een meegegeven toekomst wordt genegeerd.
select lives_ok(
  format($$ update public.leden_prive set is_admin = true, beheerder_sinds = now() + interval '1 day' where lid_id = %L $$, pg_temp.lid('t_een')),
  'beheer aanzetten met een beheerder_sinds een dag in de toekomst mag, maar de waarde wordt genegeerd');
select ok((select beheerder_sinds <= clock_timestamp() from public.leden_prive where lid_id = pg_temp.lid('t_een')),
  'en beheerder_sinds staat op het moment van nu, niet in de toekomst');

select throws_ok(
  $$ insert into public.leden_prive (lid_id, email, is_admin, beheerder_sinds)
     values (gen_random_uuid(), 'nep@example.com', true, timestamptz '2099-01-01') $$,
  'BK001', 'beheerder_sinds_toekomst',
  'een nieuw lid met beheerder_sinds in 2099 wordt geweigerd (de omweg van de eerste kijkdag)');
select throws_ok(
  $$ insert into public.leden_prive (lid_id, email, is_admin, beheerder_sinds)
     values (gen_random_uuid(), 'nep@example.com', false, timestamptz '2099-01-01') $$,
  'BK001', 'beheerder_sinds_toekomst',
  'ook voor een lid zonder is_admin: een toekomstige beheerder_sinds is nergens goed voor');

-- Bevestigen is een update van alleen beheerder_sinds: ook die mag niet naar de toekomst.
update public.leden_prive set is_admin = true where lid_id = pg_temp.lid('t_twee');
select throws_ok(
  format($$ update public.leden_prive set beheerder_sinds = now() + interval '1 hour' where lid_id = %L $$, pg_temp.lid('t_twee')),
  'BK001', 'beheerder_sinds_toekomst',
  'een bevestiging (alleen beheerder_sinds) een uur vooruit wordt geweigerd');
select throws_ok(
  format($$ update public.leden_prive set beheerder_sinds = clock_timestamp() + interval '2 minutes' where lid_id = %L $$, pg_temp.lid('t_twee')),
  'BK001', 'beheerder_sinds_toekomst',
  'ook twee minuten vooruit wordt geweigerd: de marge is klein');
select throws_ok(
  format($$ update public.leden_prive set beheerder_sinds = clock_timestamp() + interval '30 seconds' where lid_id = %L $$, pg_temp.lid('t_twee')),
  'BK001', 'beheerder_sinds_toekomst',
  'ook een halve minuut vooruit wordt geweigerd');
select lives_ok(
  format($$ update public.leden_prive set beheerder_sinds = clock_timestamp() + interval '2 seconds' where lid_id = %L $$, pg_temp.lid('t_twee')),
  'twee seconden vooruit valt binnen de marge voor klokverschil');
select lives_ok(
  format($$ update public.leden_prive set beheerder_sinds = now() where lid_id = %L $$, pg_temp.lid('t_twee')),
  'een bevestiging op het moment van nu mag');
select lives_ok(
  format($$ update public.leden_prive set beheerder_sinds = timestamptz '2000-01-01' where lid_id = %L $$, pg_temp.lid('t_twee')),
  'een beheerder_sinds in het verleden mag (zo herstelt een beheerder een bevestiging)');
select throws_ok(
  format($$ insert into public.leden_prive (lid_id, email, is_admin, beheerder_sinds) values (%L, 'dubbel@example.com', true, timestamptz '2099-01-01')
            on conflict (lid_id) do update set beheerder_sinds = timestamptz '2099-01-01' $$, pg_temp.lid('t_twee')),
  'BK001', 'beheerder_sinds_toekomst',
  'ook via INSERT ... ON CONFLICT DO UPDATE kan geen toekomstwaarde worden gezet');

-- Er is geen uitzondering meer: ook niet met een instelling in de sessie (zo liet de eerste versie seed en tests het toe).
set local app.beheerder_toekomst_toegestaan = 'ja';
select throws_ok(
  format($$ update public.leden_prive set beheerder_sinds = timestamptz '2099-02-01' where lid_id = %L $$, pg_temp.lid('t_twee')),
  'BK001', 'beheerder_sinds_toekomst',
  'een instelling in de sessie verandert niets: er is geen ontsnappingsluik');
reset app.beheerder_toekomst_toegestaan;

-- service_role (de sleutel van een script of later de taken-Worker) mag beheer aanzetten, en krijgt dezelfde weigering
-- als iedereen, geen "permission denied" (review M-02). De uitdrukkingen staan hier vooraf: onder service_role is de
-- tijdelijke tabel met leden niet te lezen.
select pg_temp.maak('t_script');
select set_config('test.script', pg_temp.lid('t_script')::text, true);
set local role service_role;
select lives_ok($$ update public.leden_prive set is_admin = true where lid_id = current_setting('test.script')::uuid $$,
  'service_role mag is_admin aanzetten');
select throws_ok(
  $$ update public.leden_prive set beheerder_sinds = timestamptz '2099-01-01' where lid_id = current_setting('test.script')::uuid $$,
  'BK001', 'beheerder_sinds_toekomst',
  'service_role krijgt voor een toekomstwaarde BK001 en geen "permission denied"');
reset role;
select is(pg_temp.laatste_actie('t_script'), 'beheer_aangezet', 'wat service_role deed, staat in het spoor');

-- ===== 1c. De leeskant negeert een toekomstwaarde =====
-- Iemand met voldoende rechten die de trigger uitzet, mag nog steeds geen beheerder maken met een toekomstwaarde.
select pg_temp.maak('t_lees', p_admin => true, p_factor => true);
create function pg_temp.als(p_naam text) returns void language sql as $$
  select set_config('request.jwt.claims',
    (jsonb_build_object('sub', (select uid from pg_temp.gebruikers where naam = p_naam), 'role', 'authenticated', 'aal', 'aal2')
     || jsonb_build_object('amr', jsonb_build_array(
          jsonb_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint),
          jsonb_build_object('method', 'totp', 'timestamp', extract(epoch from now() - interval '1 minute')::bigint))))::text, true)
$$;
select pg_temp.als('t_lees');
set local role authenticated;
select is(public.beheerstatus(), 'ok', 'uitgangspunt: een beheerder met app en code van vóór de bevestiging is ok');
reset role;
alter table public.leden_prive disable trigger beheerder_sinds_zetten;
update public.leden_prive set beheerder_sinds = timestamptz '2099-01-01' where lid_id = pg_temp.lid('t_lees');
alter table public.leden_prive enable trigger beheerder_sinds_zetten;
select pg_temp.als('t_lees');
set local role authenticated;
select is(public.beheerstatus(), 'wacht_op_bevestiging',
  'met een toekomstige beheerder_sinds (trigger omzeild): wacht_op_bevestiging, niet ok');
select is(intern.is_beheerder(), false, 'en is_beheerder() is onwaar');
reset role;

-- ===== 2. Auditspoor (F1-07) =====
select pg_temp.maak('t_drie');
select is((select count(*) from public.wijzigingen_log where tabel = 'leden_prive' and rij_id = pg_temp.lid('t_drie')), 0::bigint,
  'een gewoon lid aanmaken laat geen beheerspoor na');

select pg_temp.maak('t_nieuwadmin', p_admin => true);
select is(pg_temp.laatste_actie('t_nieuwadmin'), 'beheer_aangezet', 'een nieuw lid dat meteen beheerder is, staat in de log');

update public.leden_prive set is_admin = true where lid_id = pg_temp.lid('t_drie');
select is(pg_temp.laatste_actie('t_drie'), 'beheer_aangezet', 'beheer aanzetten staat in de log');

update public.leden_prive set beheerder_sinds = timestamptz '2026-10-01 12:00+00' where lid_id = pg_temp.lid('t_drie');
select is(pg_temp.laatste_actie('t_drie'), 'beheerder_sinds_gewijzigd', 'beheerder_sinds wijzigen staat in de log');
select ok((select omschrijving like '%naar 2026-10-01 12:00:00+00' from public.wijzigingen_log
            where tabel = 'leden_prive' and rij_id = pg_temp.lid('t_drie') order by id desc limit 1),
  'met de nieuwe waarde erbij (terugzetten naar vroeger is te zien als terugzetten)');

update public.leden_prive set mag_bob = true where lid_id = pg_temp.lid('t_drie');
select is((select count(*) from public.wijzigingen_log where tabel = 'leden_prive' and rij_id = pg_temp.lid('t_drie')), 2::bigint,
  'een andere wijziging aan leden_prive (mag_bob) komt niet in de beheerlog');

update public.leden_prive set is_admin = false where lid_id = pg_temp.lid('t_drie');
select is(pg_temp.laatste_actie('t_drie'), 'beheer_uitgezet', 'beheer uitzetten staat in de log');
select is((select beheerder_sinds from public.leden_prive where lid_id = pg_temp.lid('t_drie')), null,
  'en beheerder_sinds is dan leeg (bestaand gedrag blijft)');

-- Wie het deed, als er een sessie is (de app: een beheerder met een eigen sessie; hier met claims als postgres).
select set_config('request.jwt.claims',
  jsonb_build_object('sub', (select uid from pg_temp.gebruikers where naam = 't_een'), 'role', 'authenticated')::text, true);
update public.leden_prive set is_admin = true where lid_id = pg_temp.lid('t_drie');
select is((select door_lid_id from public.wijzigingen_log where tabel = 'leden_prive' and rij_id = pg_temp.lid('t_drie') order by id desc limit 1),
  pg_temp.lid('t_een'), 'met een sessie staat in de log welk lid de wijziging deed');
select set_config('request.jwt.claims', '', true);

-- Een beheerder wordt verwijderd (ook via het verwijderen van het lid): ook dat staat erin.
delete from public.leden_prive where lid_id = pg_temp.lid('t_drie');
select is(pg_temp.laatste_actie('t_drie'), 'beheer_verwijderd', 'een beheerder verwijderen staat in de log');
select pg_temp.maak('t_gewoon');
delete from public.leden_prive where lid_id = pg_temp.lid('t_gewoon');
select is((select count(*) from public.wijzigingen_log where rij_id = pg_temp.lid('t_gewoon')), 0::bigint,
  'een gewoon lid verwijderen is geen beheerwijziging');

-- Geen privégegevens in het spoor: noch het adres, noch de naam.
select is_empty(
  $$ select 1 from public.wijzigingen_log
      where tabel = 'leden_prive' and (omschrijving ilike '%@%' or omschrijving ilike '%t_drie%' or omschrijving ilike '%Test%') $$,
  'de log bevat geen e-mailadres en geen naam');

-- ===== 3. Een index op elke vreemde sleutel (F1-21) =====
-- Zoals de Performance Advisor van Supabase het controleert: een vreemde sleutel zonder index waarvan de eerste kolom de
-- sleutelkolom is. Een tabel of sleutel die later bijkomt, moet dus zijn eigen index meenemen.
select is_empty(
  $$ select c.conrelid::regclass || '.' || a.attname
       from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace
        and not exists (
          select 1 from pg_index i
           where i.indrelid = c.conrelid and i.indisvalid and i.indkey[0] = c.conkey[1]) $$,
  'elke vreemde sleutel in public heeft een index die met die kolom begint');

select * from finish();
rollback;
