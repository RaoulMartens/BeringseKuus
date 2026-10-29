-- Databasetests: rechten per rij en standaardrechten (bouwgids 14.4, Bouwbesluiten 4.3).
-- Draaien met: npm run test:db (lokale database in Docker). Alles in één transactie die wordt teruggedraaid.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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

-- 3. Wat er in public staat, ongeacht wie het maakte (review F0-10). Test 2 dekt alleen objecten van de rol
-- postgres (de migraties); een extensie of een wijziging via het dashboard maakt objecten als supabase_admin, en
-- die krijgen nog de ruime standaardrechten van Supabase. Deze tests kijken naar het resultaat, niet naar de
-- standaard. Krijgt een functie of tabel in fase 1 bewust een recht, dan komt hij hier op de lijst, met de reden.

-- Functies die anon of authenticated mogen uitvoeren (ook via PUBLIC). Bewust toegestaan voor ingelogd, in public:
-- precies de drie die de app aanroept (Datamodel-fase-1.md punt 6). Voor anon niets.
select is_empty(
  $$ select p.oid::regprocedure::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') $$,
  'niet ingelogd: geen enkele functie in public is uit te voeren'
);
select is_empty(
  $$ select p.oid::regprocedure::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
        and p.proname <> all (array['activiteit_opslaan', 'concept_verwijderen', 'beheeroverzicht']) $$,
  'ingelogd: in public alleen de functies die de app aanroept zijn uit te voeren'
);

-- Het schema intern (DM-01): niet in de Data API, en daarin voor ingelogd alleen de vier hulpfuncties die de regels
-- nodig hebben. Voor anon niets, ook niet via PUBLIC.
select is_empty(
  $$ select p.oid::regprocedure::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'intern' and has_function_privilege('anon', p.oid, 'execute') $$,
  'niet ingelogd: geen enkele functie in intern is uit te voeren'
);
select is_empty(
  $$ select p.oid::regprocedure::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'intern' and has_function_privilege('authenticated', p.oid, 'execute')
        and p.proname <> all (array['huidig_lid', 'is_beheerder', 'lid_mag_zien']) $$,
  'ingelogd: in intern alleen de hulpfuncties van de regels zijn uit te voeren'
);
select ok(not has_schema_privilege('anon', 'intern', 'usage'), 'niet ingelogd: geen toegang tot het schema intern');
-- De hulpfuncties die tabellen lezen moeten security definer zijn met eigenaar postgres: als security invoker roept de
-- regel op activiteiten zichzelf eindeloos aan (DM-18). Zo valt een latere "opschoning" direct op.
select is_empty(
  $$ select p.proname::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'intern'
        and p.proname in ('huidig_lid', 'is_beheerder', 'lid_mag_zien', 'aantal_aanwezigen')
        and not (p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres') $$,
  'de hulpfuncties in intern zijn security definer met eigenaar postgres'
);

-- Een security definer-functie draait met de rechten van de eigenaar; zonder vaste search_path kan een aanroeper
-- hem een eigen tabel of functie met dezelfde naam laten gebruiken (bouwgids 14.4). Ook in intern.
select is_empty(
  $$ select p.oid::regprocedure::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'intern') and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') $$,
  'elke security definer-functie in public en intern heeft een vaste search_path'
);

-- Een view zonder security_invoker leest met de rechten van zijn eigenaar, en slaat zo de rechten per rij over.
-- Postgres bewaart de optie zoals hij is geschreven (true, on, yes, 1); die tellen allemaal (review PR14-02).
select is_empty(
  $$ select c.oid::regclass::text
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
        and not exists (select 1 from pg_options_to_table(c.reloptions) o
                         where o.option_name = 'security_invoker'
                           and lower(o.option_value) in ('true', 'on', 'yes', '1')) $$,
  'elke view in public heeft security_invoker'
);

-- Niet ingelogd leest niets uit public: geen tabel, view of reeks, ook niet één kolom (review PR14-02).
-- Bewust toegestaan: nog niets.
select is_empty(
  $$ select c.oid::regclass::text
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
        and (has_table_privilege('anon', c.oid, 'select')
          or (c.relkind <> 'S' and has_any_column_privilege('anon', c.oid, 'select'))) $$,
  'niet ingelogd: niets in public is leesbaar'
);

-- Schrijven gaat alleen via de databasefuncties (bouwgids 14.4), dus niemand schrijft rechtstreeks in een tabel,
-- ook niet in één kolom. TRUNCATE valt bovendien buiten de rechten per rij (review PR14-02).
select is_empty(
  $$ select r.rol || ': ' || c.oid::regclass::text
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
            cross join (values ('anon'), ('authenticated')) r(rol)
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'f')
        and (has_table_privilege(r.rol, c.oid, 'insert, update, delete, truncate')
          or has_any_column_privilege(r.rol, c.oid, 'insert, update')) $$,
  'anon en authenticated schrijven nergens rechtstreeks in public'
);

-- Ingelogd leest alleen tabellen en views die daar bewust voor op de lijst staan, met de reden (review PR14-02). Elke
-- tabel op de lijst heeft rechten per rij; wat een lid daarvan ziet, toetsen de tests per tabel en per rol (14.4).
-- Een materialized view of foreign table kent geen rechten per rij en komt nooit op de lijst.
create function pg_temp.leesbaar_voor_ingelogd() returns setof text language sql as $$
  select c.oid::regclass::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
     and (has_table_privilege('authenticated', c.oid, 'select')
       or has_any_column_privilege('authenticated', c.oid, 'select'))
     and (c.relkind in ('m', 'f') or c.relname <> all (array['verenigingen', 'verenigingsinstellingen', 'roltypen',
       'groepen', 'leden', 'leden_prive', 'lid_groep', 'activiteiten', 'mijn_activiteiten', 'activiteit_groep',
       'rol_slots', 'afmeldingen', 'wijzigingen_log']))
$$;

-- Wat een ingelogd lid bewust mag lezen (Datamodel-fase-1.md punt 6), met rechten per rij op elke tabel; wat een lid
-- ervan ziet, toetst fase1_rechten.test.sql. mijn_activiteiten is een view met security_invoker.
-- Eerst bewijzen dat deze test rood kan worden (review PR19-04): een tabel die ingelogd leesbaar is en niet op de
-- lijst staat, komt in het resultaat. Daarna weg, en dan de echte toets.
create table public.proef_lezen (id int primary key);
alter table public.proef_lezen enable row level security;
grant select on public.proef_lezen to authenticated;
select isnt_empty('select * from pg_temp.leesbaar_voor_ingelogd()',
  'controle: de lijsttest ziet een tabel die ingelogd leesbaar is');
drop table public.proef_lezen;

select is_empty('select * from pg_temp.leesbaar_voor_ingelogd()',
  'ingelogd: alleen tabellen en views op de lijst zijn leesbaar, nooit een materialized view of foreign table');

-- Extensies horen in het schema extensions, nooit in public: daar zouden hun functies en tabellen via de Data API
-- bereikbaar zijn, met de rechten van supabase_admin.
select is_empty(
  $$ select e.extname::text
       from pg_extension e join pg_namespace n on n.oid = e.extnamespace
      where n.nspname = 'public' $$,
  'geen extensie in public'
);

select * from finish();
rollback;
