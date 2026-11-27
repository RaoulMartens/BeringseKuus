-- Het wijzigingenlog bekijken (UC-015, wireframe admin-wijzigingen): wie wanneer wat heeft gewijzigd, van nieuw naar oud, met een filter.
--
-- Het log wordt al gevuld door elke schrijffunctie, in dezelfde transactie (V8 3.5). Deze functie leest het voor het scherm:
--   * alleen een beheerder met een recente code (R41); wie het niet mag, krijgt geen_admin;
--   * de naam van de wijziger erbij (leeg is "Het systeem": de taken-Worker of de database zelf);
--   * afmeldingen en het intrekken ervan staan er niet in (R42): de regel noemt alleen een activiteit en wie het was, en een afmelding is voor het
--     bestuur geen wijziging die iets verandert aan wie er staat;
--   * een dienst die een lid overdroeg staat in het log met alleen id's; hier worden dat namen;
--   * per regel waar het scherm naartoe kan linken: de activiteit of het lid, als die er nog is;
--   * een filter (alles, diensten, activiteiten, leden, beheer) en bladeren met het id van de laatste regel die je zag.
-- Een actie die het filter niet kent staat alleen bij "alles". Geeft één regel meer dan gevraagd, zodat het scherm weet of er meer is.

create function public.wijzigingen_lezen(p_soort text default 'alles', p_voor_id bigint default null, p_aantal int default 50)
returns table (id bigint, moment timestamptz, door text, omschrijving text, doel_soort text, doel_id uuid)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_aantal int := greatest(least(coalesce(p_aantal, 50), 100), 1);
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  if p_soort is null or p_soort not in ('alles', 'diensten', 'activiteiten', 'leden', 'beheer') then
    perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'soort'));
  end if;

  return query
  with gekozen as (
    select w.*
      from public.wijzigingen_log w
     where (p_voor_id is null or w.id < p_voor_id)
       and w.actie not in ('afgemeld', 'afmelding_ingetrokken')
       and case p_soort
             when 'alles' then true
             when 'diensten' then w.actie in ('plek_toegewezen', 'plek_leeggemaakt', 'plek_toegevoegd', 'plek_weggehaald',
                                              'helper_toegevoegd', 'dienst_geruild', 'bak_gewijzigd')
             when 'activiteiten' then w.actie in ('activiteit_aangemaakt', 'activiteit_gewijzigd', 'doelgroep_gewijzigd',
                                                  'activiteit_gepubliceerd', 'concept_verwijderd', 'activiteit_verwijderd')
             when 'leden' then w.actie like 'lid\_%' or w.actie in ('uitnodiging_gestuurd', 'adres_gecorrigeren', 'herinnering_gestuurd')
             else w.actie like 'beheer%'
           end
     order by w.id desc
     limit v_aantal + 1
  )
  select g.id,
         g.moment,
         coalesce(d.voornaam || ' ' || d.achternaam, 'Het systeem'),
         -- Een overdracht noemt alleen id's: de activiteit en de twee leden worden namen.
         coalesce(
           (select format('Dienst bij %s (%s) overgedragen van %s aan %s', a.naam, to_char(a.datum, 'DD-MM-YYYY'),
                          coalesce(l1.voornaam || ' ' || l1.achternaam, 'een lid'), coalesce(l2.voornaam || ' ' || l2.achternaam, 'een lid'))
              from regexp_match(g.omschrijving, 'activiteit ([0-9a-f-]{36}) overgedragen van lid ([0-9a-f-]{36}) aan lid ([0-9a-f-]{36})') m
              join public.activiteiten a on a.id = m[1]::uuid
              left join public.leden l1 on l1.id = m[2]::uuid
              left join public.leden l2 on l2.id = m[3]::uuid
             where g.actie = 'dienst_geruild'),
           g.omschrijving),
         case when ac.id is not null then 'activiteit' when li.id is not null then 'lid' end,
         coalesce(ac.id, li.id)
    from gekozen g
    left join public.leden d on d.id = g.door_lid_id
    left join public.activiteiten ac
           on ac.id = case g.tabel when 'activiteiten' then g.rij_id
                                   when 'rol_slots' then (select s.activiteit_id from public.rol_slots s where s.id = g.rij_id) end
    left join public.leden li on li.id = g.rij_id and g.tabel = 'leden' and li.type = 'lid' and not li.alleen_beheer
   order by g.id desc;
end
$$;

revoke all on function public.wijzigingen_lezen(text, bigint, int) from public, anon;
grant execute on function public.wijzigingen_lezen(text, bigint, int) to authenticated;
