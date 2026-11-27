-- Databasetests voor oud papier automatisch aanmaken (migratie 20261127100000): de eerste vrijdag en zaterdag van elke maand,
-- gevuld vanaf het laatste ingevulde voorbeeld, nooit dubbel, alleen voor de taak. Draaien met: npm run test:db.
-- Alles in één transactie die wordt teruggedraaid. Alleen eigen namen ("T ...").

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Schoon beginnen: geen oud papier uit de seed.
delete from public.activiteiten where type = 'oud_papier';
delete from public.oud_papier_aangemaakt;

-- 1 jan 2030 is een dinsdag: eerste vrijdag 4 jan, eerste zaterdag 5 jan; feb: 1 en 2 feb; mrt: 1 en 2 mrt.
select is(public.oud_papier_aanmaken(3, date '2030-01-01'), 6, 'drie maanden vooruit: 6 concepten (januari, februari, maart)');

select is((select count(*)::int from public.activiteiten where type = 'oud_papier' and datum in
  (date '2030-01-04', date '2030-01-05', date '2030-02-01', date '2030-02-02', date '2030-03-01', date '2030-03-02')),
  6, 'precies de eerste vrijdag en zaterdag van januari, februari en maart');
select is((select count(*)::int from public.activiteiten where type = 'oud_papier' and status = 'concept'), 6, 'allemaal concept');
select is((select count(*)::int from public.rol_slots s join public.activiteiten a on a.id = s.activiteit_id
  where a.type = 'oud_papier' and s.rol_type = 'eindverantwoordelijke'), 6, 'elk concept heeft één eindverantwoordelijke-plek');
select is((select count(*)::int from public.activiteiten where type = 'oud_papier' and starttijd is null), 6,
  'zonder voorbeeld zijn de concepten kaal');

-- Nooit dubbel, ook niet na verwijderen.
select is(public.oud_papier_aanmaken(3, date '2030-01-01'), 0, 'een tweede run maakt niets bij');
delete from public.activiteiten where datum = date '2030-01-04' and type = 'oud_papier';
select is(public.oud_papier_aanmaken(3, date '2030-01-01'), 0, 'een verwijderd concept komt niet terug');

-- Een voorbeeld: een ingevulde vrijdag in april met een werker-plek en een bezette eindverantwoordelijke.
insert into public.leden (id, voornaam, achternaam, type) values ('00000000-0000-4000-8000-0000000000a1', 'T Eind', 'Test', 'lid');
insert into public.activiteiten (id, naam, datum, verzameltijd, starttijd, eindtijd, locatie, type, status)
values ('00000000-0000-4000-8000-0000000000b1', 'Oud papier', date '2030-04-05', '08:30', '09:00', '12:00', 'T Kuuskamp', 'oud_papier', 'gepubliceerd');
insert into public.rol_slots (activiteit_id, rol_type, bezetter_id, volgorde) values
  ('00000000-0000-4000-8000-0000000000b1', 'eindverantwoordelijke', '00000000-0000-4000-8000-0000000000a1', 0),
  ('00000000-0000-4000-8000-0000000000b1', 'werker', null, 1),
  ('00000000-0000-4000-8000-0000000000b1', 'werker', null, 2);

select is(public.oud_papier_aanmaken(1, date '2030-04-06'), 3, 'een maand vooruit: zaterdag 6 april en 3 en 4 mei');
select is((select locatie || ' ' || starttijd::text from public.activiteiten where datum = date '2030-05-03' and type = 'oud_papier'),
  'T Kuuskamp 09:00:00', 'de vrijdag neemt locatie en tijd van de vrijdag-voorbeeld over');
select is((select count(*)::int from public.activiteiten where datum = date '2030-05-04' and type = 'oud_papier' and starttijd is null),
  1, 'de zaterdag heeft geen voorbeeld (geen zaterdag ingevuld) en blijft kaal');
select is((select count(*)::int from public.rol_slots s join public.activiteiten a on a.id = s.activiteit_id
  where a.datum = date '2030-05-03' and s.rol_type = 'werker' and s.bezetter_id is null), 2, 'twee lege werker-plekken, zoals het voorbeeld');
select is((select s.bezetter_id from public.rol_slots s join public.activiteiten a on a.id = s.activiteit_id
  where a.datum = date '2030-05-03' and s.rol_type = 'eindverantwoordelijke'), '00000000-0000-4000-8000-0000000000a1'::uuid,
  'dezelfde eindverantwoordelijke als het voorbeeld');

-- Niet voor ingelogden.
set local role authenticated;
select throws_ok($$select public.oud_papier_aanmaken(1)$$, '42501', null, 'een ingelogde gebruiker mag de functie niet aanroepen');
reset role;

select * from finish();
rollback;
