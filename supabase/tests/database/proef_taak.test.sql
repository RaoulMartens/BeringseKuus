-- Databasetests voor proefroute 3 (de geplande taak): wie mag wat, en een minuut telt maar één keer mee.
-- Draaien met: npm run test:db. Alles in één transactie die wordt teruggedraaid.

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_table('public', 'proef_taak', 'de tabel proef_taak bestaat');
select has_table('public', 'proef_taak_bericht', 'de tabel proef_taak_bericht bestaat');

-- Alleen de taak (met de geheime sleutel, rol service_role) schrijft; leden en bezoekers zien niets.
select ok(not has_table_privilege('anon', 'public.proef_taak', 'select'),
  'niet ingelogd: proef_taak is niet leesbaar');
select ok(not has_table_privilege('authenticated', 'public.proef_taak', 'select'),
  'ingelogd: proef_taak is niet leesbaar');
select ok(not has_table_privilege('authenticated', 'public.proef_taak', 'insert'),
  'ingelogd: in proef_taak schrijven kan niet');
select ok(not has_table_privilege('authenticated', 'public.proef_taak_bericht', 'insert'),
  'ingelogd: in proef_taak_bericht schrijven kan niet');
select ok(has_table_privilege('service_role', 'public.proef_taak', 'insert'),
  'de taak (service_role) mag in proef_taak schrijven');

-- Een dubbele start in dezelfde minuut telt niet dubbel: de minuut is de sleutel.
insert into public.proef_taak (minuut, status) values ('2026-10-28T14:00Z', 'gelukt');
select throws_ok(
  $$ insert into public.proef_taak (minuut, status) values ('2026-10-28T14:00Z', 'gelukt') $$,
  '23505', null, 'dezelfde minuut kan niet twee keer'
);
select throws_ok(
  $$ insert into public.proef_taak (minuut, status) values ('2026-10-28T14:01Z', 'misschien') $$,
  '23514', null, 'alleen de statussen gelukt en mislukt'
);
select throws_ok(
  $$ insert into public.proef_taak (minuut, status) values ('28-10-2026 14:02', 'gelukt') $$,
  '23514', null, 'de minuut heeft een vaste vorm'
);

-- Het testbericht gaat hooguit één keer: er kan maar één rij in proef_taak_bericht.
insert into public.proef_taak_bericht (id) values (1);
select throws_ok(
  $$ insert into public.proef_taak_bericht (id) values (1) $$,
  '23505', null, 'het testbericht kan maar één keer worden geclaimd'
);
select throws_ok(
  $$ insert into public.proef_taak_bericht (id) values (2) $$,
  '23514', null, 'er is maar één testbericht (id 1)'
);

select * from finish();
rollback;
