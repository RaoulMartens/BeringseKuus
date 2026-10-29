-- Fase 1, stap C: het schema (docs/bouw/Datamodel-fase-1.md punt 2 en 3).
-- Eerst het schema intern en de tijdfuncties, dan de tabellen en de referentiegegevens. De rechten (RLS), de
-- hulpfuncties, de triggers en de schrijffuncties staan in de volgende twee migraties.

-- Het schema intern staat niet in de Data API (supabase/config.toml, [api] schemas): wat hier staat is niet als
-- /rest/v1/rpc/... aan te roepen (DM-01). `authenticated` krijgt in de volgende migratie precies de rechten die de
-- RLS-regels nodig hebben.
create schema intern;
revoke all on schema intern from public;
grant usage on schema intern to authenticated, service_role;

-- Een bedoelde fout: de foutcode als message, de bijzonderheden als JSON in detail, en een eigen SQLSTATE zodat de app
-- hem kan onderscheiden van een onverwachte fout (DM-13). De transactie van de aanroeper draait terug.
create function intern.fout(p_code text, p_detail jsonb default '{}'::jsonb) returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'BK001', message = p_code, detail = p_detail::text;
end
$$;

-- Tijd (Bouwbesluiten 4.5). Alles in Europe/Amsterdam; de sessie draait in UTC. De dag erbij wordt op de datum
-- opgeteld en niet op het tijdstip, anders is het rond de zomertijd een uur fout (DM-06).

-- Het beginjaar van het seizoen: 1 september is de grens (besluit 29-10-2026, gelijk aan bouwgids 6.2).
create function intern.seizoen_van(p_datum date) returns int
language sql immutable
set search_path = ''
as $$
  select case when extract(month from p_datum) >= 9 then extract(year from p_datum)::int
              else extract(year from p_datum)::int - 1 end
$$;

create function intern.activiteit_begin(p_datum date, p_starttijd time) returns timestamptz
language sql immutable
set search_path = ''
as $$
  select (p_datum + coalesce(p_starttijd, time '00:00')) at time zone 'Europe/Amsterdam'
$$;

-- Eindtijd vóór de starttijd = de volgende dag (R16). Zonder eindtijd, of zonder starttijd: het einde van de dag.
create function intern.activiteit_einde(p_datum date, p_starttijd time, p_eindtijd time) returns timestamptz
language sql immutable
set search_path = ''
as $$
  select case
    when p_eindtijd is null or p_starttijd is null then (p_datum + 1)::timestamp at time zone 'Europe/Amsterdam'
    else ((p_datum + case when p_eindtijd < p_starttijd then 1 else 0 end) + p_eindtijd)
         at time zone 'Europe/Amsterdam'
  end
$$;

-- Op het deadlinemoment zelf mag je nog vrij afmelden (R8): strikt groter dan.
create function intern.deadline_verstreken(p_deadline timestamptz, p_moment timestamptz) returns boolean
language sql immutable
set search_path = ''
as $$
  select p_deadline is not null and p_moment > p_deadline
$$;

create function intern.vandaag(p_moment timestamptz) returns date
language sql immutable
set search_path = ''
as $$
  select (p_moment at time zone 'Europe/Amsterdam')::date
$$;

-- Een gegenereerde kolom roept zijn functie aan met de rechten van wie invoegt (DM-22). Wijzigt een migratie een van
-- deze functies, dan moet dezelfde migratie de kolommen opnieuw laten vullen: opgeslagen waarden worden niet vanzelf
-- opnieuw berekend.
grant execute on function intern.seizoen_van(date), intern.activiteit_begin(date, time),
  intern.activiteit_einde(date, time, time), intern.deadline_verstreken(timestamptz, timestamptz),
  intern.vandaag(timestamptz) to service_role;

-- De vaste vereniging: de rij van Beringse. Overal de standaardwaarde van vereniging_id; RLS en functies kijken er nog
-- niet naar (Bouwbesluiten 1).
create table public.verenigingen (
  id uuid primary key,
  naam text not null check (naam <> '')
);
alter table public.verenigingen enable row level security;
insert into public.verenigingen (id, naam) values ('b3a17e00-0000-4000-8000-000000000001', 'C.V. De Beringse Kuus');

create table public.verenigingsinstellingen (
  vereniging_id uuid primary key default 'b3a17e00-0000-4000-8000-000000000001'
    references public.verenigingen (id),
  bus_vertrekplaats text
);
alter table public.verenigingsinstellingen enable row level security;
insert into public.verenigingsinstellingen (vereniging_id) values ('b3a17e00-0000-4000-8000-000000000001');

-- BA-6, aanname: een tabel in plaats van vaste waarden. Gedeeld, zonder vereniging_id.
create table public.roltypen (
  code text primary key,
  naam text not null,
  ruilbaar_door_lid boolean not null,
  alleen_admin boolean not null,
  volgorde int not null
);
alter table public.roltypen enable row level security;
insert into public.roltypen (code, naam, ruilbaar_door_lid, alleen_admin, volgorde) values
  ('eindverantwoordelijke', 'Eindverantwoordelijke', false, true, 1),
  ('bob', 'BOB', false, true, 2),
  ('werker', 'Werker', true, false, 3),
  ('drankhaler', 'Drankhaler', true, false, 4),
  ('fotograaf', 'Fotograaf', true, false, 5),
  ('bak', 'Bak', false, true, 6);

-- Groepen (V8 3.6): vast gevuld, zonder beheerscherm in de pilot. Referentiegegevens zoals roltypen, dus hier en niet
-- in de seed: het ontwikkelproject en de pilot krijgen de seed niet, en hebben de groepen wel nodig.
create table public.groepen (
  id uuid primary key default gen_random_uuid(),
  vereniging_id uuid not null default 'b3a17e00-0000-4000-8000-000000000001' references public.verenigingen (id),
  naam text not null check (naam <> ''),
  volgorde int not null,
  unique (vereniging_id, naam)
);
alter table public.groepen enable row level security;
insert into public.groepen (naam, volgorde) values
  ('Bestuur', 1), ('Raad van Elf', 2), ('Dames', 3), ('Overige leden', 4);

-- Leden (Bouwbesluiten 4.1): elk lid een eigen id, ook een externe helper. Wat andere leden mogen zien staat hier;
-- de rest in leden_prive.
create table public.leden (
  id uuid primary key default gen_random_uuid(),
  vereniging_id uuid not null default 'b3a17e00-0000-4000-8000-000000000001' references public.verenigingen (id),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  voornaam text not null check (voornaam <> ''),
  achternaam text not null check (achternaam <> ''),
  type text not null check (type in ('lid', 'extern')),
  actief boolean not null default true,
  aangemaakt timestamptz not null default now(),
  -- Een externe helper logt niet in.
  check (type = 'lid' or auth_user_id is null)
);
alter table public.leden enable row level security;

create table public.leden_prive (
  lid_id uuid primary key references public.leden (id) on delete cascade,
  email text not null unique check (email = lower(email)),
  telefoon text,
  is_admin boolean not null default false,
  -- Wanneer is_admin aanging: een MFA-factor van ná dit moment zet het beheer stil (Datamodel punt 3, DM-25).
  beheerder_sinds timestamptz,
  mag_bob boolean not null default false,
  mag_eindverantw boolean not null default false,
  check (not is_admin or beheerder_sinds is not null)
);
alter table public.leden_prive enable row level security;

create table public.lid_groep (
  lid_id uuid not null references public.leden (id) on delete cascade,
  groep_id uuid not null references public.groepen (id) on delete cascade,
  primary key (lid_id, groep_id)
);
create index lid_groep_groep on public.lid_groep (groep_id);
alter table public.lid_groep enable row level security;

-- Activiteiten (V8 3.2). Een concept heeft alleen naam en datum verplicht (besluit 2); starttijd, eindtijd en locatie
-- zijn verplicht om te publiceren, met een check als vangnet.
create table public.activiteiten (
  id uuid primary key default gen_random_uuid(),
  vereniging_id uuid not null default 'b3a17e00-0000-4000-8000-000000000001' references public.verenigingen (id),
  naam text not null check (naam <> ''),
  datum date not null,
  verzameltijd time,
  starttijd time,
  eindtijd time,
  locatie text,
  bus_vertrektijd time,
  bus_locatie text,
  notitie text,
  type text not null default 'seizoen' check (type in ('seizoen', 'oud_papier')),
  seizoen int not null generated always as (intern.seizoen_van(datum)) stored,
  status text not null default 'concept' check (status in ('concept', 'gepubliceerd', 'geannuleerd')),
  afmeld_deadline timestamptz,
  min_aanwezigen int check (min_aanwezigen >= 1),
  bak_actief boolean not null default false,
  bron_activiteit_id uuid references public.activiteiten (id) on delete set null,
  -- Niet "begin": dat is in PL/pgSQL een gereserveerd woord (DM-21). Met deze kolommen is op het einde te filteren
  -- via de Data API (DM-07).
  begint_om timestamptz not null generated always as (intern.activiteit_begin(datum, starttijd)) stored,
  eindigt_om timestamptz not null generated always as (intern.activiteit_einde(datum, starttijd, eindtijd)) stored,
  aangemaakt timestamptz not null default now(),
  bijgewerkt timestamptz not null default now(),
  constraint eindtijd_ongelijk_aan_starttijd check (eindtijd <> starttijd),
  -- Alleen gepubliceerd eist tijden en locatie: een concept mag direct geannuleerd worden (V8 5.4), ook zonder.
  constraint publiceren_vereist_tijden_en_locatie check (
    status <> 'gepubliceerd' or (starttijd is not null and eindtijd is not null and locatie is not null)
  )
);
create index activiteiten_datum on public.activiteiten (datum);
alter table public.activiteiten enable row level security;

create table public.activiteit_groep (
  activiteit_id uuid not null references public.activiteiten (id) on delete cascade,
  groep_id uuid not null references public.groepen (id) on delete restrict,
  primary key (activiteit_id, groep_id)
);
alter table public.activiteit_groep enable row level security;

create table public.rol_slots (
  id uuid primary key default gen_random_uuid(),
  activiteit_id uuid not null references public.activiteiten (id) on delete cascade,
  rol_type text not null references public.roltypen (code),
  -- Een lid wordt nooit verwijderd (actief = false); wissen op verzoek is anonimiseren (Datamodel punt 12).
  bezetter_id uuid references public.leden (id) on delete restrict,
  plek_label text check (plek_label in ('prins', 'adjudant', 'vorst', 'raadslid')),
  volgorde int not null default 0,
  check ((rol_type = 'bak') = (plek_label is not null)),
  -- Geen dubbelboeking (V8 3.3). Uitgesteld: pas bij commit. activiteit_opslaan (fase 2) toetst de eindtoestand zelf en
  -- zet hem aan het eind op immediate, zodat dit alleen het vangnet is (DM-12).
  constraint geen_dubbelboeking unique (activiteit_id, bezetter_id) deferrable initially deferred
);
-- Hooguit één eindverantwoordelijke per activiteit; activiteit_opslaan maakt hem bij het aanmaken.
create unique index rol_slots_een_eindverantwoordelijke on public.rol_slots (activiteit_id)
  where rol_type = 'eindverantwoordelijke';
alter table public.rol_slots enable row level security;

create table public.afmeldingen (
  id uuid primary key default gen_random_uuid(),
  activiteit_id uuid not null references public.activiteiten (id) on delete cascade,
  lid_id uuid not null references public.leden (id) on delete restrict,
  toelichting text,
  aangemaakt timestamptz not null default now(),
  unique (activiteit_id, lid_id)
);
alter table public.afmeldingen enable row level security;

-- Auditlog (V8 3.5). Eigen vereniging_id: na het verwijderen van een concept bestaat de activiteit niet meer.
-- Geen afmeldtoelichtingen of andere privévelden erin (Bouwbesluiten 4.6).
create table public.wijzigingen_log (
  id bigint generated always as identity primary key,
  vereniging_id uuid not null default 'b3a17e00-0000-4000-8000-000000000001' references public.verenigingen (id),
  moment timestamptz not null default clock_timestamp(),
  door_lid_id uuid references public.leden (id) on delete set null,
  actie text not null,
  tabel text not null,
  rij_id uuid,
  omschrijving text not null
);
alter table public.wijzigingen_log enable row level security;
