-- Proefroute 3 (Fase-0-plan 4): wat de geplande taak elke minuut schrijft. Wegwerp: na de proef weg (fase 1).
--
-- Een rij per minuut, met de minuut als sleutel: start Cloudflare de taak twee keer in dezelfde minuut, dan telt
-- dat maar één keer. Een gedwongen fout laat een rij met status "mislukt" achter. Geen ledengegevens, dus ook
-- geen vereniging_id (Bouwbesluiten 1 geldt voor verenigingsgegevens).
--
-- Alleen de taak schrijft, met de geheime sleutel van Supabase (rol service_role, die RLS overslaat). Leden en
-- bezoekers kunnen niets: RLS staat aan zonder regels, en anon en authenticated krijgen geen rechten
-- (die staan sinds 20261027120000 standaard dicht).

create table public.proef_taak (
  minuut text primary key check (minuut ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$'),
  status text not null check (status in ('gelukt', 'mislukt')),
  melding text,
  gemaakt timestamptz not null default now()
);
alter table public.proef_taak enable row level security;

-- Het testbericht gaat hooguit één keer: de taak claimt eerst deze ene rij, en verstuurt alleen als dat lukt.
create table public.proef_taak_bericht (
  id int primary key check (id = 1),
  geclaimd timestamptz not null default now()
);
alter table public.proef_taak_bericht enable row level security;

grant select, insert, update, delete on public.proef_taak, public.proef_taak_bericht to service_role;
