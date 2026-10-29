-- Databasetests fase 1: de functies (docs/bouw/Datamodel-fase-1.md punt 4, 5, 7 en 9): activiteit_opslaan,
-- concept_verwijderen, beheeroverzicht en de aantallen aanwezigen. Draaien met: npm run test:db. Alles in één
-- transactie die wordt teruggedraaid. Hangt niet af van de seed: alleen eigen namen ("T ...").

begin;
create extension if not exists pgtap with schema extensions;
select plan(75);

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
    json_build_object('sub', (select uid from pg_temp.gebruikers where naam = p_naam),
                      'role', 'authenticated', 'aal', p_aal)::text, true)
$$;

-- Een lid zonder inlogaccount, voor de tellingen.
create function pg_temp.lid(p_naam text, p_type text default 'lid', p_actief boolean default true) returns uuid
language plpgsql
as $$
declare v_lid uuid;
begin
  insert into public.leden (voornaam, achternaam, type, actief) values (p_naam, 'Test', p_type, p_actief)
  returning id into v_lid;
  insert into public.leden_prive (lid_id, email) values (v_lid, p_naam || '@example.com');
  return v_lid;
end
$$;

select pg_temp.maak('t_mark', true);
select pg_temp.maak('t_truus');

-- Een eigen concept met een bezette plek, een gepubliceerde en een geannuleerde activiteit.
insert into public.activiteiten (naam, datum) values ('T Ander', '2030-04-01');
insert into public.rol_slots (activiteit_id, rol_type)
select id, 'werker' from public.activiteiten where naam = 'T Ander';
insert into public.activiteiten (naam, datum, starttijd, eindtijd, locatie, status) values
  ('T Pub', '2030-04-02', '20:00', '23:00', 'De Kuus', 'gepubliceerd'),
  ('T Weg', '2030-04-03', '20:00', '23:00', 'De Kuus', 'geannuleerd');
select set_config('test.ander_slot', (select s.id::text from public.rol_slots s join public.activiteiten a on a.id = s.activiteit_id where a.naam = 'T Ander'), true);
select set_config('test.groep_bestuur', (select id::text from public.groepen where naam = 'Bestuur'), true);
select set_config('test.log_voor', (select count(*)::text from public.wijzigingen_log), true);

-- ===== Een lid mag niets, ook niet met een onbekend id; er is niets aangemaakt =====
select pg_temp.als('t_truus', 'aal2');
set local role authenticated;
select throws_ok($$ select public.activiteit_opslaan(null, '{"naam": "T Nee", "datum": "2030-01-01"}', '[]') $$,
  'BK001', 'geen_admin', 'lid: activiteit_opslaan geeft geen_admin');
select throws_ok($$ select public.activiteit_opslaan(gen_random_uuid(), '{}', '[]') $$,
  'BK001', 'geen_admin', 'lid: geen_admin gaat voor activiteit_onbekend (eerst wie belt)');
reset role;
select is((select count(*)::int from public.activiteiten where naam = 'T Nee'), 0, 'lid: er is niets aangemaakt');
select is((select count(*)::text from public.wijzigingen_log), current_setting('test.log_voor'), 'lid: er is niets gelogd');

-- ===== Aanmaken =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select set_config('test.nieuw',
  (public.activiteit_opslaan(null, '{"naam": "T Avond", "datum": "2027-01-15"}', '[]')->>'activiteit_id'), true);
reset role;
select is((select (a.status, a.type, a.min_aanwezigen, a.seizoen)::text from public.activiteiten a where a.id = current_setting('test.nieuw')::uuid),
  '(concept,seizoen,13,2026)', 'aanmaken met alleen naam en datum: concept, seizoen, minimum 13, seizoen 2026');
select is((select count(*)::int from public.rol_slots where activiteit_id = current_setting('test.nieuw')::uuid), 1,
  'aanmaken: precies één plek');
select is((select count(*)::int from public.rol_slots where activiteit_id = current_setting('test.nieuw')::uuid
            and rol_type = 'eindverantwoordelijke' and bezetter_id is null), 1,
  'aanmaken: die plek is een lege eindverantwoordelijke (Bouwbesluiten 4.4)');
select is((select count(*)::int from public.wijzigingen_log where actie = 'activiteit_aangemaakt' and rij_id = current_setting('test.nieuw')::uuid), 1,
  'aanmaken: één logregel');
select is((select (begint_om, eindigt_om)::text from public.activiteiten where id = current_setting('test.nieuw')::uuid),
  '("2027-01-14 23:00:00+00","2027-01-15 23:00:00+00")',
  'zonder tijden: begint om middernacht en eindigt aan het einde van de dag (Amsterdamse tijd)');

-- ===== Fouten in de velden =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select throws_ok($$ select public.activiteit_opslaan(null, '{"datum": "2030-01-01"}', '[]') $$,
  'BK001', 'veld_ontbreekt', 'naam ontbreekt: veld_ontbreekt');
select throws_ok($$ select public.activiteit_opslaan(null, '{"naam": ""}', '[]') $$,
  'BK001', 'veld_ontbreekt', 'een lege naam en geen datum: veld_ontbreekt');
select throws_ok($$ select public.activiteit_opslaan(null, '{"naam": "T X", "datum": "2030-01-01", "kleur": "rood"}', '[]') $$,
  'BK001', 'veld_ongeldig', 'een onbekende sleutel: veld_ongeldig');
select throws_ok($$ select public.activiteit_opslaan(null, '{"naam": "T X", "datum": "2030-13-45"}', '[]') $$,
  'BK001', 'veld_ongeldig', 'een datum die niet bestaat: veld_ongeldig, geen kale databasefout');
select throws_ok($$ select public.activiteit_opslaan(null, '{"naam": 5, "datum": "2030-01-01"}', '[]') $$,
  'BK001', 'veld_ongeldig', 'een getal als naam: veld_ongeldig');
select throws_ok($$ select public.activiteit_opslaan(null, '{"naam": "T X", "datum": "2030-01-01", "starttijd": "20:00", "eindtijd": "20:00"}', '[]') $$,
  'BK001', 'veld_ongeldig', 'eindtijd gelijk aan starttijd: veld_ongeldig (DM-06)');
select throws_ok($$ select public.activiteit_opslaan(null, '{"naam": "T X", "datum": "2030-01-01", "min_aanwezigen": 0}', '[]') $$,
  'BK001', 'veld_ongeldig', 'minimum 0: veld_ongeldig, geen kale 23514');
select throws_ok($$ select public.activiteit_opslaan(null, '{"naam": "T X", "datum": "2030-01-01", "groepen": ["00000000-0000-4000-8000-0000000000ff"]}', '[]') $$,
  'BK001', 'groep_onbekend', 'een onbekende groep: groep_onbekend');
select throws_ok($$ select public.activiteit_opslaan(gen_random_uuid(), '{}', '[]') $$,
  'BK001', 'activiteit_onbekend', 'een onbekende activiteit: activiteit_onbekend');
reset role;
select is((select count(*)::int from public.activiteiten where naam = 'T X'), 0, 'na al die fouten is er niets aangemaakt');

-- ===== Plekken toevoegen en weghalen =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select set_config('test.plekken', public.activiteit_opslaan(current_setting('test.nieuw')::uuid, '{}',
  '[{"handeling": "plek_toevoegen", "rol_type": "werker", "tijdelijk_id": "a"},
    {"handeling": "plek_toevoegen", "rol_type": "drankhaler", "tijdelijk_id": "b"}]')::text, true);
reset role;
select is((select count(*)::int from public.rol_slots where activiteit_id = current_setting('test.nieuw')::uuid), 3,
  'twee plekken toegevoegd in één aanroep: nu drie');
select ok((current_setting('test.plekken')::jsonb -> 'plekken' ->> 'a')::uuid in (select id from public.rol_slots)
      and (current_setting('test.plekken')::jsonb -> 'plekken' ->> 'b')::uuid in (select id from public.rol_slots),
  'het antwoord geeft bij elk tijdelijk_id het echte id van de nieuwe plek');
select is((select count(*)::int from public.wijzigingen_log where actie = 'plek_toegevoegd'), 2, 'elke toegevoegde plek is gelogd');
select set_config('test.ev', (select id::text from public.rol_slots where activiteit_id = current_setting('test.nieuw')::uuid and rol_type = 'eindverantwoordelijke'), true);
select set_config('test.werker', (select id::text from public.rol_slots where activiteit_id = current_setting('test.nieuw')::uuid and rol_type = 'werker'), true);

select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select throws_ok($$ select public.activiteit_opslaan(current_setting('test.nieuw')::uuid, '{}',
  '[{"handeling": "plek_toevoegen", "rol_type": "werker", "tijdelijk_id": "x"}, {"handeling": "plek_toevoegen", "rol_type": "werker", "tijdelijk_id": "x"}]') $$,
  'BK001', 'wijziging_ongeldig', 'een dubbele tijdelijk_id: wijziging_ongeldig');
select throws_ok($$ select public.activiteit_opslaan(current_setting('test.nieuw')::uuid, '{}', '{"handeling": "plek_toevoegen"}') $$,
  'BK001', 'wijziging_ongeldig', 'wijzigingen die geen lijst is: wijziging_ongeldig');
select throws_ok($$ select public.activiteit_opslaan(current_setting('test.nieuw')::uuid, '{}', '[{"handeling": "opruimen"}]') $$,
  'BK001', 'wijziging_ongeldig', 'een onbekende handeling: wijziging_ongeldig');
select throws_ok($$ select public.activiteit_opslaan(current_setting('test.nieuw')::uuid, '{}',
  '[{"handeling": "plek_toevoegen", "rol_type": "kapitein", "tijdelijk_id": "k"}]') $$,
  'BK001', 'wijziging_ongeldig', 'een onbekend rol_type: wijziging_ongeldig');
select throws_ok($$ select public.activiteit_opslaan(current_setting('test.nieuw')::uuid, '{}',
  format('[{"handeling": "plek_weghalen", "rol_slot_id": "%s"}]', current_setting('test.ev'))::jsonb) $$,
  'BK001', 'eindverantwoordelijke_verplicht', 'de eindverantwoordelijke weghalen: eindverantwoordelijke_verplicht');
select throws_ok($$ select public.activiteit_opslaan(current_setting('test.nieuw')::uuid, '{}',
  format('[{"handeling": "plek_weghalen", "rol_slot_id": "%s"}]', current_setting('test.ander_slot'))::jsonb) $$,
  'BK001', 'plek_onbekend', 'een plek van een andere activiteit weghalen: plek_onbekend (Bouwbesluiten 4.4)');
reset role;
select is((select count(*)::int from public.rol_slots where id = current_setting('test.ander_slot')::uuid), 1,
  'de plek van de andere activiteit is er nog');

-- Een bezette plek kan niet weg.
update public.rol_slots set bezetter_id = (select lid from pg_temp.gebruikers where naam = 't_truus')
 where id = current_setting('test.werker')::uuid;
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select throws_ok($$ select public.activiteit_opslaan(current_setting('test.nieuw')::uuid, '{}',
  format('[{"handeling": "plek_weghalen", "rol_slot_id": "%s"}]', current_setting('test.werker'))::jsonb) $$,
  'BK001', 'plek_niet_leeg', 'een bezette plek weghalen: plek_niet_leeg');
reset role;
update public.rol_slots set bezetter_id = null where id = current_setting('test.werker')::uuid;
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select lives_ok($$ select public.activiteit_opslaan(current_setting('test.nieuw')::uuid, '{}',
  format('[{"handeling": "plek_weghalen", "rol_slot_id": "%s"}]', current_setting('test.werker'))::jsonb) $$,
  'een lege plek weghalen lukt');
reset role;
select is((select count(*)::int from public.rol_slots where activiteit_id = current_setting('test.nieuw')::uuid), 2, 'daarna zijn er twee plekken');
select is((select count(*)::int from public.wijzigingen_log where actie = 'plek_weggehaald'), 1, 'het weghalen is gelogd');

-- ===== Wat nog niet kan in fase 1 =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select throws_ok($$ select public.activiteit_opslaan(current_setting('test.nieuw')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s"}]', current_setting('test.ev'), gen_random_uuid())::jsonb) $$,
  'BK001', 'niet_ondersteund', 'toewijzen is van fase 2: niet_ondersteund');
select throws_ok($$ select public.activiteit_opslaan(current_setting('test.nieuw')::uuid, '{}',
  format('[{"handeling": "leegmaken", "rol_slot_id": "%s"}]', current_setting('test.ev'))::jsonb) $$,
  'BK001', 'niet_ondersteund', 'leegmaken is van fase 2: niet_ondersteund');
select throws_ok($$ select public.activiteit_opslaan(current_setting('test.nieuw')::uuid, '{}', '[]', true) $$,
  'BK001', 'niet_ondersteund', 'publiceren is van fase 2: niet_ondersteund');
select throws_ok($$ select public.activiteit_opslaan((select id from public.activiteiten where naam = 'T Pub'), '{"naam": "T Pub 2"}', '[]') $$,
  'BK001', 'niet_ondersteund', 'een gepubliceerde activiteit wijzigen is van fase 2: niet_ondersteund');
reset role;
select is((select naam from public.activiteiten where naam like 'T Pub%'), 'T Pub', 'de gepubliceerde activiteit is niet gewijzigd');

-- ===== Wijzigen van een concept: gedeeltelijk, alles of niets =====
select set_config('test.bijgewerkt', (select bijgewerkt::text from public.activiteiten where id = current_setting('test.nieuw')::uuid), true);
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select lives_ok($$ select public.activiteit_opslaan(current_setting('test.nieuw')::uuid,
  '{"locatie": "De Kuus", "starttijd": "20:11", "eindtijd": "01:11", "groepen": [], "notitie": "Zaal klaar"}', '[]') $$,
  'een concept wijzigen lukt');
select lives_ok($$ select public.activiteit_opslaan(current_setting('test.nieuw')::uuid, '{"naam": "T Avond"}', '[]') $$,
  'een wijziging met alleen een naam');
reset role;
select is((select (locatie, starttijd, eindtijd, notitie)::text from public.activiteiten where id = current_setting('test.nieuw')::uuid),
  '("De Kuus",20:11:00,01:11:00,"Zaal klaar")', 'een sleutel die ontbreekt blijft zoals hij was');
select isnt((select bijgewerkt::text from public.activiteiten where id = current_setting('test.nieuw')::uuid), current_setting('test.bijgewerkt'),
  'bijgewerkt is veranderd');
select is((select eindigt_om::text from public.activiteiten where id = current_setting('test.nieuw')::uuid), '2027-01-16 00:11:00+00',
  'eindtijd 01:11 bij starttijd 20:11: de volgende dag (R16), in Amsterdamse tijd');
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select lives_ok($$ select public.activiteit_opslaan(current_setting('test.nieuw')::uuid, '{"locatie": null, "datum": "2027-09-01"}', '[]') $$,
  'null maakt een veld leeg');
reset role;
select is((select (locatie, seizoen)::text from public.activiteiten where id = current_setting('test.nieuw')::uuid), '(,2027)',
  'locatie leeg, en het seizoen volgt de gewijzigde datum: 1 september 2027 is seizoen 2027');

-- Doelgroep.
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select lives_ok(format($f$ select public.activiteit_opslaan(%L::uuid, '{"groepen": ["%s"]}', '[]') $f$,
  current_setting('test.nieuw'), current_setting('test.groep_bestuur')), 'de doelgroep instellen');
reset role;
select is((select count(*)::int from public.activiteit_groep where activiteit_id = current_setting('test.nieuw')::uuid), 1, 'de doelgroep staat er');
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select lives_ok($$ select public.activiteit_opslaan(current_setting('test.nieuw')::uuid, '{"groepen": []}', '[]') $$, 'een lege lijst = iedereen');
reset role;
select is((select count(*)::int from public.activiteit_groep where activiteit_id = current_setting('test.nieuw')::uuid), 0, 'de doelgroep is weer leeg');

-- Alles of niets: een fout in de laatste regel laat ook de velden en de eerdere regels niet doorgaan.
select set_config('test.log_voor', (select count(*)::text from public.wijzigingen_log), true);
select set_config('test.plekken_voor', (select count(*)::text from public.rol_slots where activiteit_id = current_setting('test.nieuw')::uuid), true);
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select throws_ok($$ select public.activiteit_opslaan(current_setting('test.nieuw')::uuid, '{"naam": "T Gewijzigd"}',
  '[{"handeling": "plek_toevoegen", "rol_type": "werker", "tijdelijk_id": "z"}, {"handeling": "opruimen"}]') $$,
  'BK001', 'wijziging_ongeldig', 'een fout in de laatste regel van wijzigingen');
reset role;
select is((select naam from public.activiteiten where id = current_setting('test.nieuw')::uuid), 'T Avond', 'alles of niets: de naam is niet gewijzigd');
select is((select count(*)::text from public.rol_slots where activiteit_id = current_setting('test.nieuw')::uuid), current_setting('test.plekken_voor'),
  'alles of niets: de eerdere regel (een plek erbij) is teruggedraaid');
select is((select count(*)::text from public.wijzigingen_log), current_setting('test.log_voor'), 'alles of niets: er is niets gelogd');

-- ===== concept_verwijderen =====
-- Een concept met plekken, een doelgroep, een afmelding, en een ander concept dat ernaar verwijst als bron.
insert into public.activiteiten (id, naam, datum) values ('a0000000-0000-4000-8000-0000000000d1', 'T Verwijder', '2030-05-01');
insert into public.rol_slots (activiteit_id, rol_type) values ('a0000000-0000-4000-8000-0000000000d1', 'werker');
insert into public.activiteit_groep (activiteit_id, groep_id) values ('a0000000-0000-4000-8000-0000000000d1', current_setting('test.groep_bestuur')::uuid);
insert into public.afmeldingen (activiteit_id, lid_id) values ('a0000000-0000-4000-8000-0000000000d1', (select lid from pg_temp.gebruikers where naam = 't_truus'));
insert into public.activiteiten (naam, datum, bron_activiteit_id) values ('T Kopie', '2031-05-01', 'a0000000-0000-4000-8000-0000000000d1');
select set_config('test.kopie_bijgewerkt', (select bijgewerkt::text from public.activiteiten where naam = 'T Kopie'), true);
-- R18: wat er niet mag veranderen.
select set_config('test.tellers_voor', (select (select count(*) from public.leden)::text || '/' || (select count(*) from public.leden_prive)::text
  || '/' || (select count(*) from public.lid_groep)::text || '/' || (select count(*) from public.groepen)::text), true);

select pg_temp.als('t_truus', 'aal2');
set local role authenticated;
select throws_ok($$ select public.concept_verwijderen('a0000000-0000-4000-8000-0000000000d1') $$,
  'BK001', 'geen_admin', 'lid: concept_verwijderen geeft geen_admin');
reset role;
select is((select count(*)::int from public.activiteiten where naam = 'T Verwijder'), 1, 'lid: het concept bestaat nog');
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select throws_ok($$ select public.concept_verwijderen(gen_random_uuid()) $$, 'BK001', 'activiteit_onbekend',
  'beheerder: een onbekende activiteit geeft activiteit_onbekend');
select throws_ok($$ select public.concept_verwijderen((select id from public.activiteiten where naam = 'T Pub')) $$,
  'BK001', 'alleen_concept', 'een gepubliceerde activiteit verwijderen: alleen_concept');
select throws_ok($$ select public.concept_verwijderen((select id from public.activiteiten where naam = 'T Weg')) $$,
  'BK001', 'alleen_concept', 'een geannuleerde activiteit verwijderen: alleen_concept');
reset role;
select is((select count(*)::int from public.activiteiten where naam in ('T Pub', 'T Weg')), 2, 'beide bestaan nog');
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is((public.concept_verwijderen('a0000000-0000-4000-8000-0000000000d1'))::text, '{"naam": "T Verwijder", "datum": "2030-05-01"}',
  'een concept verwijderen geeft naam en datum terug voor de melding');
reset role;
select is((select (select count(*) from public.activiteiten where id = 'a0000000-0000-4000-8000-0000000000d1')
         + (select count(*) from public.rol_slots where activiteit_id = 'a0000000-0000-4000-8000-0000000000d1')
         + (select count(*) from public.activiteit_groep where activiteit_id = 'a0000000-0000-4000-8000-0000000000d1')
         + (select count(*) from public.afmeldingen where activiteit_id = 'a0000000-0000-4000-8000-0000000000d1'))::int, 0,
  'het concept is weg, met plekken, doelgroep en afmeldingen');
select is((select count(*)::int from public.wijzigingen_log where actie = 'concept_verwijderd'
            and rij_id = 'a0000000-0000-4000-8000-0000000000d1' and omschrijving like 'T Verwijder%'), 1,
  'één logregel met naam en datum, ook al bestaat de activiteit niet meer');
select is((select bron_activiteit_id from public.activiteiten where naam = 'T Kopie'), null,
  'een ander concept dat ernaar verwees, heeft nu een lege bronverwijzing');
select is((select bijgewerkt::text from public.activiteiten where naam = 'T Kopie'), current_setting('test.kopie_bijgewerkt'),
  'en bijgewerkt van dat andere concept is niet veranderd (DM-24)');
select is((select (select count(*) from public.leden)::text || '/' || (select count(*) from public.leden_prive)::text
  || '/' || (select count(*) from public.lid_groep)::text || '/' || (select count(*) from public.groepen)::text),
  current_setting('test.tellers_voor'),
  'R18: leden, groepen en groepslidmaatschappen zijn niet veranderd door opslaan en verwijderen');
select is(to_regclass('public.meldingen')::text, null, 'R18: er bestaat nog geen meldingentabel (fase 7)');

-- ===== Aanwezigen (R1, R12, R22) =====
-- Een eigen doelgroep: twee testgroepen met een lid in beide (telt één keer), een externe helper en een inactief lid
-- (tellen niet), en een afgemeld lid (telt niet).
insert into public.groepen (naam, volgorde) values ('T Groep 1', 90), ('T Groep 2', 91);
select set_config('test.g1', (select id::text from public.groepen where naam = 'T Groep 1'), true);
select set_config('test.g2', (select id::text from public.groepen where naam = 'T Groep 2'), true);
select set_config('test.a', pg_temp.lid('t_a')::text, true);
select set_config('test.b', pg_temp.lid('t_b')::text, true);
select set_config('test.c', pg_temp.lid('t_c', 'extern')::text, true);
select set_config('test.d', pg_temp.lid('t_d', 'lid', false)::text, true);
select set_config('test.e', pg_temp.lid('t_e')::text, true);
insert into public.lid_groep (lid_id, groep_id) values
  (current_setting('test.a')::uuid, current_setting('test.g1')::uuid),
  (current_setting('test.b')::uuid, current_setting('test.g1')::uuid),
  (current_setting('test.b')::uuid, current_setting('test.g2')::uuid),
  (current_setting('test.c')::uuid, current_setting('test.g1')::uuid),
  (current_setting('test.d')::uuid, current_setting('test.g2')::uuid),
  (current_setting('test.e')::uuid, current_setting('test.g2')::uuid);
insert into public.activiteiten (id, naam, datum, starttijd, eindtijd, locatie, status)
values ('a0000000-0000-4000-8000-0000000000e1', 'T Groepsavond', '2030-06-01', '20:00', '23:00', 'De Kuus', 'gepubliceerd'),
       ('a0000000-0000-4000-8000-0000000000e2', 'T Iedereenavond', '2030-06-02', '20:00', '23:00', 'De Kuus', 'gepubliceerd');
insert into public.activiteit_groep (activiteit_id, groep_id) values
  ('a0000000-0000-4000-8000-0000000000e1', current_setting('test.g1')::uuid),
  ('a0000000-0000-4000-8000-0000000000e1', current_setting('test.g2')::uuid);
insert into public.afmeldingen (activiteit_id, lid_id) values
  ('a0000000-0000-4000-8000-0000000000e1', current_setting('test.e')::uuid);
select is(intern.aantal_aanwezigen('a0000000-0000-4000-8000-0000000000e1'), 2,
  'groepsactiviteit: alleen de doelgroep; een lid in twee groepen telt één keer; een externe helper, een inactief lid en een afgemeld lid tellen niet');
select set_config('test.iedereen_voor', intern.aantal_aanwezigen('a0000000-0000-4000-8000-0000000000e2')::text, true);
insert into public.afmeldingen (activiteit_id, lid_id) values ('a0000000-0000-4000-8000-0000000000e2', current_setting('test.a')::uuid);
select is(intern.aantal_aanwezigen('a0000000-0000-4000-8000-0000000000e2'), current_setting('test.iedereen_voor')::int - 1,
  'activiteit voor iedereen: één afmelding minder aanwezigen');
insert into public.afmeldingen (activiteit_id, lid_id) values
  ('a0000000-0000-4000-8000-0000000000e2', current_setting('test.c')::uuid),
  ('a0000000-0000-4000-8000-0000000000e2', current_setting('test.d')::uuid);
select is(intern.aantal_aanwezigen('a0000000-0000-4000-8000-0000000000e2'), current_setting('test.iedereen_voor')::int - 1,
  'een afmelding van een externe helper of een inactief lid verandert niets (R12)');

-- ===== Het beheeroverzicht (V8 5.6) =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is((select (starttijd_ontbreekt, eindtijd_ontbreekt, locatie_ontbreekt, eindverantwoordelijke_ontbreekt, lege_plekken)::text
             from public.beheeroverzicht() where naam = 'T Ander'),
  '(t,t,t,f,1)', 'het overzicht toont per activiteit wat ontbreekt: T Ander heeft een lege werker en geen eindverantwoordelijke-plek');
select is((select (select coalesce(sum(lege_plekken), 0) from public.beheeroverzicht())::text), (
  select count(*)::text from public.rol_slots s join public.activiteiten a on a.id = s.activiteit_id
   where s.bezetter_id is null and s.rol_type <> 'bak' and a.eindigt_om > now() and a.status <> 'geannuleerd'),
  'de teller "diensten nog in te delen" is gelijk aan het aantal lege plekken in de lijst (V8 12)');
select is((select count(*)::int from public.beheeroverzicht() where naam = 'T Weg'), 0, 'een geannuleerde activiteit staat er niet in');
select is((select alleen_groepen from public.beheeroverzicht() where naam = 'T Groepsavond'), true, 'een groepsactiviteit is herkenbaar');
select is((select aanwezigen from public.beheeroverzicht() where naam = 'T Groepsavond'), 2, 'het overzicht gebruikt dezelfde aantallen aanwezigen');
select is((select lege_plekken_per_rol::text from public.beheeroverzicht() where naam = 'T Ander'), '{"werker": 1}', 'lege plekken per rol');

select * from finish();
rollback;
