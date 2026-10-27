-- Databasetests: rechten per rij en standaardrechten (bouwgids 14.4, Bouwbesluiten 4.3).
-- Draaien met: npm run test:db (lokale database in Docker). Alles in één transactie die wordt teruggedraaid.

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- 1. Elke tabel in public heeft rechten per rij (RLS) aan. Een test die faalt zodra er één zonder bestaat.
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0,
  'elke tabel in public heeft rechten per rij (RLS) aan'
);

-- 2. Een nieuwe tabel en functie krijgen vanzelf geen rechten voor wie niet of wel is ingelogd.
create table public.proef_rechten (id int primary key);
create function public.proef_functie() returns int language sql as $$ select 1 $$;

select ok(not has_table_privilege('anon', 'public.proef_rechten', 'select'),
  'niet ingelogd: een nieuwe tabel is niet leesbaar');
select ok(not has_table_privilege('authenticated', 'public.proef_rechten', 'select'),
  'ingelogd: een nieuwe tabel is niet leesbaar zonder expliciet recht');
select ok(not has_table_privilege('authenticated', 'public.proef_rechten', 'insert'),
  'ingelogd: in een nieuwe tabel schrijven kan niet zonder expliciet recht');
select ok(not has_function_privilege('anon', 'public.proef_functie()', 'execute'),
  'niet ingelogd: een nieuwe functie is niet uit te voeren');
select ok(not has_function_privilege('authenticated', 'public.proef_functie()', 'execute'),
  'ingelogd: een nieuwe functie is niet uit te voeren zonder expliciet recht');

select * from finish();
rollback;
