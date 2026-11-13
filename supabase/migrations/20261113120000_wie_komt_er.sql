-- Wie komt er? (UC-010): een lid ziet per activiteit wie er komt en wie zich heeft afgemeld, als raster van namen.
-- Besluit van de opdrachtgever (13-11-2026): alle leden mogen de afgemelde namen zien, zonder reden. De policy eigen_of_beheerder
-- op afmeldingen blijft zoals ze is: een lid leest de tabel nog steeds niet. Deze functie is de enige route naar de afmeldingen
-- van anderen en geeft alleen id, naam en komt ja/nee. Nooit de toelichting van een afmelding (Bouwbesluiten 4.6), nooit een
-- e-mailadres of telefoonnummer.
--
-- De doelgroep is dezelfde als bij aantal_aanwezigen (R1, R12, R22): actieve leden van type lid die de activiteit mogen zien.
-- Alleen voor een gepubliceerde activiteit die het aanroepende lid zelf mag zien; anders geen rijen, dus geen fout en geen
-- verraad (zoals contact_eindverantwoordelijke en beschikbare_vervangers). Een SQL-functie: in plpgsql worden de kolomnamen
-- van returns table variabelen en geeft elke onbekwalificeerde verwijzing "ambiguous".
create function public.wie_komt_er(p_activiteit_id uuid)
returns table (lid_id uuid, voornaam text, achternaam text, komt boolean)
language sql stable security definer
set search_path = ''
as $$
  select l.id, l.voornaam, l.achternaam, (af.id is null)
    from public.activiteiten a
    join public.leden l on l.actief and l.type = 'lid'
    left join public.afmeldingen af on af.activiteit_id = a.id and af.lid_id = l.id
   where a.id = p_activiteit_id
     and a.status = 'gepubliceerd'
     and intern.lid_mag_zien(a.id, intern.huidig_lid())
     and intern.lid_mag_zien(a.id, l.id)
   order by l.achternaam, l.voornaam, l.id
$$;

revoke all on function public.wie_komt_er(uuid) from public, anon;
grant execute on function public.wie_komt_er(uuid) to authenticated;
