-- Een beheeraccount (leden.alleen_beheer) ziet als lid alles wat voor welke groep dan ook is, zonder in groepen te staan.
-- Aanleiding: de opdrachtgever wil met zijn beheeraccount ook zien wat leden zien. Een beheeraccount staat in geen groep, dus hij zag
-- op Start en in het programma alleen activiteiten voor iedereen. Door hem in elke groep te zetten (lid_groep) zou elke nieuwe groep
-- weer handwerk zijn; liever geldt het voor het account zelf. Hij telt nog steeds nergens mee als lid (aantal aanwezigen, Wie komt er,
-- vervangers, keuzelijsten: zie 20261113130000_alleen_beheer.sql), dus leden merken er niets van.
--
-- Een gewoon lid, ook een beheerder die zelf in groepen zit, ziet nog precies wat zijn groepen bepalen (R15, R22).
create or replace function intern.lid_mag_zien(p_activiteit uuid, p_lid uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_lid is not null and exists (
    select 1
      from public.activiteiten a
     where a.id = p_activiteit
       and a.status in ('gepubliceerd', 'geannuleerd')
       and (
         not exists (select 1 from public.activiteit_groep ag where ag.activiteit_id = a.id)
         or exists (
           select 1
             from public.activiteit_groep ag
             join public.lid_groep lg on lg.groep_id = ag.groep_id
            where ag.activiteit_id = a.id and lg.lid_id = p_lid
         )
         or exists (select 1 from public.leden b where b.id = p_lid and b.alleen_beheer)
       )
  )
$$;
