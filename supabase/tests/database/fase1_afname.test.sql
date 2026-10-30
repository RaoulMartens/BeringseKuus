-- Databasetests fase 1, afname (review van fase 1 als geheel, 30-10-2026): beheerder_sinds niet in de toekomst (F1-02),
-- het auditspoor voor beheerrechten (F1-07) en een index op elke vreemde sleutel (F1-21). Draaien met: npm run test:db.
-- Alles in één transactie die wordt teruggedraaid. Hangt niet af van de seed: alleen eigen leden ("t_...").
-- Let op: deze file zet app.beheerder_toekomst_toegestaan bewust NIET, behalve waar de test het zegt.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

create temp table gebruikers (naam text primary key, uid uuid not null, lid uuid);

create function pg_temp.maak(p_naam text) returns void
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
  insert into public.leden_prive (lid_id, email) values (v_lid, p_naam || '@example.com');
  insert into pg_temp.gebruikers values (p_naam, v_uid, v_lid);
end
$$;

select pg_temp.maak('t_een');
select pg_temp.maak('t_twee');
create function pg_temp.lid(p_naam text) returns uuid language sql as $$ select lid from pg_temp.gebruikers where naam = p_naam $$;

-- ===== beheerder_sinds niet in de toekomst (F1-02) =====
select is(coalesce(current_setting('app.beheerder_toekomst_toegestaan', true), ''), '',
  'uitgangspunt: de instelling die de toekomst toestaat staat niet aan');

-- Bij het aanzetten van beheer zet de trigger zelf het moment van nu: een meegegeven toekomst wordt genegeerd.
select lives_ok(
  format($$ update public.leden_prive set is_admin = true, beheerder_sinds = now() + interval '1 day' where lid_id = %L $$, pg_temp.lid('t_een')),
  'beheer aanzetten met een beheerder_sinds een dag in de toekomst mag, maar de waarde wordt genegeerd');
select ok((select beheerder_sinds <= clock_timestamp() from public.leden_prive where lid_id = pg_temp.lid('t_een')),
  'en beheerder_sinds staat op het moment van nu, niet in de toekomst');

select throws_ok(
  format($$ insert into public.leden_prive (lid_id, email, is_admin, beheerder_sinds)
            values (gen_random_uuid(), 'nep@example.com', true, timestamptz '2099-01-01') $$),
  'BK001', 'beheerder_sinds_toekomst',
  'een nieuw lid met beheerder_sinds in 2099 wordt geweigerd (de omweg van de eerste kijkdag)');

-- Bevestigen is een update van alleen beheerder_sinds: ook die mag niet naar de toekomst.
update public.leden_prive set is_admin = true where lid_id = pg_temp.lid('t_twee');
select isnt((select beheerder_sinds from public.leden_prive where lid_id = pg_temp.lid('t_twee')), null,
  'beheer aanzetten zet beheerder_sinds op het moment van nu');
select throws_ok(
  format($$ update public.leden_prive set beheerder_sinds = now() + interval '1 hour' where lid_id = %L $$, pg_temp.lid('t_twee')),
  'BK001', 'beheerder_sinds_toekomst',
  'een bevestiging (alleen beheerder_sinds) een uur vooruit wordt geweigerd');
select lives_ok(
  format($$ update public.leden_prive set beheerder_sinds = now() where lid_id = %L $$, pg_temp.lid('t_twee')),
  'een bevestiging op het moment van nu mag');
select lives_ok(
  format($$ update public.leden_prive set beheerder_sinds = timestamptz '2000-01-01' where lid_id = %L $$, pg_temp.lid('t_twee')),
  'een beheerder_sinds in het verleden mag (zo herstelt een beheerder een bevestiging)');
select lives_ok(
  format($$ update public.leden_prive set beheerder_sinds = clock_timestamp() + interval '30 seconds' where lid_id = %L $$, pg_temp.lid('t_twee')),
  'een halve minuut vooruit valt binnen de marge voor klokverschil');

-- Met de instelling mag het wel (de seed en de tests).
set local app.beheerder_toekomst_toegestaan = 'ja';
select lives_ok(
  format($$ update public.leden_prive set beheerder_sinds = timestamptz '2099-01-01' where lid_id = %L $$, pg_temp.lid('t_twee')),
  'met app.beheerder_toekomst_toegestaan = ja mag een beheerder_sinds in de toekomst (alleen seed en tests)');
reset app.beheerder_toekomst_toegestaan;
select throws_ok(
  format($$ update public.leden_prive set beheerder_sinds = timestamptz '2099-02-01' where lid_id = %L $$, pg_temp.lid('t_twee')),
  'BK001', 'beheerder_sinds_toekomst',
  'na het terugzetten van de instelling weigert de database het weer');

-- ===== Auditspoor (F1-07) =====
-- Opnieuw beginnen met een schoon lid, zodat het aantal regels klopt.
select pg_temp.maak('t_drie');
select is((select count(*) from public.wijzigingen_log where tabel = 'leden_prive' and rij_id = pg_temp.lid('t_drie')), 0::bigint,
  'een gewoon lid aanmaken laat geen beheerspoor na');

update public.leden_prive set is_admin = true where lid_id = pg_temp.lid('t_drie');
select is((select actie from public.wijzigingen_log where tabel = 'leden_prive' and rij_id = pg_temp.lid('t_drie') order by id desc limit 1),
  'beheer_aangezet', 'beheer aanzetten staat in de log');

update public.leden_prive set beheerder_sinds = now() where lid_id = pg_temp.lid('t_drie');
select is((select actie from public.wijzigingen_log where tabel = 'leden_prive' and rij_id = pg_temp.lid('t_drie') order by id desc limit 1),
  'beheer_bevestigd', 'een bevestiging (beheerder_sinds opnieuw gezet) staat in de log');

update public.leden_prive set mag_bob = true where lid_id = pg_temp.lid('t_drie');
select is((select count(*) from public.wijzigingen_log where tabel = 'leden_prive' and rij_id = pg_temp.lid('t_drie')), 2::bigint,
  'een andere wijziging aan leden_prive (mag_bob) komt niet in de beheerlog');

update public.leden_prive set is_admin = false where lid_id = pg_temp.lid('t_drie');
select is((select actie from public.wijzigingen_log where tabel = 'leden_prive' and rij_id = pg_temp.lid('t_drie') order by id desc limit 1),
  'beheer_uitgezet', 'beheer uitzetten staat in de log');
select is((select beheerder_sinds from public.leden_prive where lid_id = pg_temp.lid('t_drie')), null,
  'en beheerder_sinds is dan leeg (bestaand gedrag blijft)');

-- Geen privégegevens in het spoor: noch het adres, noch de naam.
select is_empty(
  $$ select 1 from public.wijzigingen_log
      where tabel = 'leden_prive' and (omschrijving ilike '%@%' or omschrijving ilike '%t_drie%' or omschrijving ilike '%Test%') $$,
  'de log bevat geen e-mailadres en geen naam');

-- ===== Een index op elke vreemde sleutel (F1-21) =====
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
