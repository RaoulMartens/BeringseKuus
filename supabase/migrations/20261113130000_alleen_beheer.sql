-- Alleen beheer: een account dat er is om te beheren en niet als lid meetelt.
-- Aanleiding: de opdrachtgever wil zowel als lid als als beheerder kunnen kijken, met twee accounts. Beheer hoort bij een lid
-- (is_admin staat in leden_prive en huidig_lid() eist type lid), dus zo'n beheeraccount is technisch een tweede lidrij. Met deze
-- vlag telt hij nergens mee: niet in het aantal aanwezigen, niet in het raster "Wie komt er?", niet als vervanger en niet in de
-- keuzelijst om in te delen. Hij kan nog wel inloggen en beheren.
--
-- De vlag zet de bouwer (SQL); een scherm om hem aan of uit te zetten komt later (ledenbeheer, fase 4).
alter table public.leden add column alleen_beheer boolean not null default false;

-- Een lid mag de vlag lezen, net als de andere kolommen van leden (kolommen apart, nooit select * : zie fase1_rechten).
grant select (alleen_beheer) on public.leden to authenticated;

-- Aanwezigen (R1, R12, R22): actieve leden van type lid in de doelgroep, elk één keer, min de afmeldingen, zonder beheeraccounts.
create or replace function intern.aantal_aanwezigen(p_activiteit uuid) returns int
language sql stable security definer
set search_path = ''
as $$
  select count(*)::int
    from public.leden l
   where l.actief and l.type = 'lid' and not l.alleen_beheer
     and (
       not exists (select 1 from public.activiteit_groep ag where ag.activiteit_id = p_activiteit)
       or exists (
         select 1
           from public.activiteit_groep ag
           join public.lid_groep lg on lg.groep_id = ag.groep_id
          where ag.activiteit_id = p_activiteit and lg.lid_id = l.id
       )
     )
     and not exists (select 1 from public.afmeldingen af where af.activiteit_id = p_activiteit and af.lid_id = l.id)
$$;

-- Wie komt er? (UC-010): zonder beheeraccounts, net als bij het aantal aanwezigen.
create or replace function public.wie_komt_er(p_activiteit_id uuid)
returns table (lid_id uuid, voornaam text, achternaam text, komt boolean)
language sql stable security definer
set search_path = ''
as $$
  select l.id, l.voornaam, l.achternaam, (af.id is null)
    from public.activiteiten a
    join public.leden l on l.actief and l.type = 'lid' and not l.alleen_beheer
    left join public.afmeldingen af on af.activiteit_id = a.id and af.lid_id = l.id
   where a.id = p_activiteit_id
     and a.status = 'gepubliceerd'
     and intern.lid_mag_zien(a.id, intern.huidig_lid())
     and intern.lid_mag_zien(a.id, l.id)
   order by l.achternaam, l.voornaam, l.id
$$;

-- Wie kan overnemen: een beheeraccount staat er niet bij. ruil_dienst blijft hem technisch toestaan; wie niet in de lijst staat, wordt
-- nergens aangeboden.
create or replace function public.beschikbare_vervangers(p_activiteit_id uuid)
returns table (lid_id uuid, voornaam text, achternaam text, beschikbaar boolean, reden text)
language sql stable security definer
set search_path = ''
as $$
  select l.id, l.voornaam, l.achternaam,
         (af.id is null and bz.id is null),
         case when af.id is not null then 'afgemeld' when bz.id is not null then 'al_ingedeeld' end
    from public.activiteiten a
    join public.leden l on l.actief and l.type = 'lid' and not l.alleen_beheer and l.id <> intern.huidig_lid()
    left join public.afmeldingen af on af.activiteit_id = a.id and af.lid_id = l.id
    left join public.rol_slots bz on bz.activiteit_id = a.id and bz.bezetter_id = l.id
   where a.id = p_activiteit_id
     and a.status = 'gepubliceerd'
     and a.eindigt_om > clock_timestamp()
     and intern.lid_mag_zien(a.id, intern.huidig_lid())
     and intern.lid_mag_zien(a.id, l.id)
     and exists (
       select 1 from public.rol_slots s join public.roltypen r on r.code = s.rol_type
        where s.activiteit_id = a.id and s.bezetter_id = intern.huidig_lid() and r.ruilbaar_door_lid)
   order by l.achternaam, l.voornaam
$$;
