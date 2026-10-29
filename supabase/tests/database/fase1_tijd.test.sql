-- Databasetests fase 1: de tijd (docs/bouw/Datamodel-fase-1.md punt 3 en 9; Bouwbesluiten 4.5). Alles in Amsterdamse
-- tijd, de sessie draait in UTC. Draaien met: npm run test:db.

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Einde van een activiteit (R16): een eindtijd vóór de starttijd is de volgende dag.
select is(intern.activiteit_einde(date '2027-01-15', time '20:11', time '01:11'), timestamptz '2027-01-16 00:11:00+00',
  'eindtijd na middernacht: de Bonte Avond 20:11 tot 01:11 eindigt de volgende dag, 01:11 Amsterdamse tijd');
select is(intern.activiteit_einde(date '2027-01-15', time '20:00', time '23:00'), timestamptz '2027-01-15 22:00:00+00',
  'eindtijd op dezelfde dag');
select is(intern.activiteit_einde(date '2027-01-15', time '20:00', null), timestamptz '2027-01-15 23:00:00+00',
  'zonder eindtijd: het einde van de dag (middernacht Amsterdamse tijd)');
select is(intern.activiteit_einde(date '2027-01-15', null, time '23:00'), timestamptz '2027-01-15 23:00:00+00',
  'zonder starttijd: ook het einde van de dag');
select is(intern.activiteit_begin(date '2027-01-15', time '20:00'), timestamptz '2027-01-15 19:00:00+00', 'begin in Amsterdamse tijd (winter)');
select is(intern.activiteit_begin(date '2027-07-15', time '20:00'), timestamptz '2027-07-15 18:00:00+00', 'begin in Amsterdamse tijd (zomer)');
select is(intern.activiteit_begin(date '2027-01-15', null), timestamptz '2027-01-14 23:00:00+00', 'zonder starttijd: begint om middernacht');

-- Geweest: het exacte eindmoment telt als geweest.
select ok(timestamptz '2027-01-16 00:11:00+00' >= intern.activiteit_einde(date '2027-01-15', time '20:11', time '01:11'),
  'het exacte eindmoment telt als geweest');
select ok(not (timestamptz '2027-01-16 00:10:59.999999+00' >= intern.activiteit_einde(date '2027-01-15', time '20:11', time '01:11')),
  'een microseconde ervoor is het nog bezig');

-- Zomertijd: de dag erbij op de datum, niet op het tijdstip. 28 maart 2027 om 02:00 gaat de klok naar 03:00.
select is(intern.activiteit_einde(date '2027-03-27', time '22:00', time '03:30'), timestamptz '2027-03-28 01:30:00+00',
  'tot 03:30 in de nacht van de overgang naar zomertijd: 03:30 zomertijd (niet een uur later)');
select is(intern.activiteit_einde(date '2027-03-27', time '22:00', time '02:30'), timestamptz '2027-03-28 01:30:00+00',
  '02:30 bestaat op 28 maart 2027 niet: Postgres maakt er 03:30 zomertijd van (vastgelegd, zodat een andere uitkomst opvalt)');
select is(intern.activiteit_einde(date '2027-10-30', time '22:00', time '02:30'), timestamptz '2027-10-31 01:30:00+00',
  '02:30 bestaat op 31 oktober 2027 twee keer: Postgres kiest de wintertijd (vastgelegd)');

-- De deadline (R8): op het moment zelf mag je nog vrij afmelden.
select is(intern.deadline_verstreken(timestamptz '2027-01-10 20:00:00+00', timestamptz '2027-01-10 20:00:00+00'), false,
  'op het deadlinemoment zelf is de deadline niet verstreken');
select is(intern.deadline_verstreken(timestamptz '2027-01-10 20:00:00+00', timestamptz '2027-01-10 20:00:00.000001+00'), true,
  'een microseconde na de deadline is hij verstreken');
select is(intern.deadline_verstreken(null, timestamptz '2027-01-10 20:00:00+00'), false, 'zonder deadline nooit verstreken');

-- Vandaag in Amsterdam, niet in UTC.
select is(intern.vandaag(timestamptz '2027-01-14 23:30:00+00'), date '2027-01-15', '00:30 Amsterdamse tijd is al de nieuwe dag (winter)');
select is(intern.vandaag(timestamptz '2027-01-14 22:30:00+00'), date '2027-01-14', '23:30 Amsterdamse tijd is nog dezelfde dag (winter)');
select is(intern.vandaag(timestamptz '2027-07-14 22:30:00+00'), date '2027-07-15', '00:30 Amsterdamse tijd is al de nieuwe dag (zomer)');

-- Seizoen: de grens is 1 september (besluit 29-10-2026).
select is(intern.seizoen_van(date '2027-01-15'), 2026, '15 januari 2027 hoort bij seizoen 2026');
select is(intern.seizoen_van(date '2027-05-22'), 2026, 'de feestavond van 22 mei 2027 hoort bij seizoen 2026');
select is(intern.seizoen_van(date '2027-09-01'), 2027, '1 september 2027 begint seizoen 2027');
select is(intern.seizoen_van(date '2027-08-31'), 2026, '31 augustus 2027 hoort nog bij seizoen 2026');

select * from finish();
rollback;
