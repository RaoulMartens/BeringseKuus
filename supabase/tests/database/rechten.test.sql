-- Databasetests: rechten per rij en standaardrechten (bouwgids 14.4, Bouwbesluiten 4.3).
-- Draaien met: npm run test:db (lokale database in Docker). Alles in één transactie die wordt teruggedraaid.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

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

-- Functies die anon of authenticated mogen uitvoeren (ook via PUBLIC). Bewust toegestaan: nog geen.
select is_empty(
  $$ select p.oid::regprocedure::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute')) $$,
  'geen functie in public is uit te voeren voor anon of authenticated, tenzij bewust toegestaan'
);

-- Een security definer-functie draait met de rechten van de eigenaar; zonder vaste search_path kan een aanroeper
-- hem een eigen tabel of functie met dezelfde naam laten gebruiken (bouwgids 14.4).
select is_empty(
  $$ select p.oid::regprocedure::text
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') $$,
  'elke security definer-functie in public heeft een vaste search_path'
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

-- Een materialized view of foreign table kent geen rechten per rij: wie hem mag lezen, leest alles.
select is_empty(
  $$ select c.oid::regclass::text
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('m', 'f')
        and has_any_column_privilege('authenticated', c.oid, 'select') $$,
  'ingelogd: geen materialized view of foreign table in public leesbaar'
);

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
