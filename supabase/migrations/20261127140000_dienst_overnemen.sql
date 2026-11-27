-- Een dienst overnemen (bestuur): een beheerder die zelf lid is neemt in één stap de dienst van een ander lid over, zonder de activiteit te bewerken, de plek leeg te
-- maken, zichzelf te kiezen en op te slaan. Bedoeld voor het moment dat iemand afvalt en het bestuur het zelf oplost.
--
-- Regels:
--   * alleen een beheerder met een recente code, en die is zelf een actief lid (een beheeraccount heeft geen eigen diensten);
--   * de plek van een ander lid, bij een concept of gepubliceerde activiteit die nog niet is afgelopen; niet de eindverantwoordelijke (die heeft een telefoonnummer
--     nodig, R21) en niet de bak;
--   * niet als je al een plek hebt bij deze activiteit (dubbelboeking), en niet als je je voor deze activiteit hebt afgemeld;
--   * de rol die het scherm liet zien moet nog dezelfde zijn (het bestuur kan het intussen anders hebben ingedeeld);
--   * dezelfde locks als ruil_dienst en activiteit_opslaan: eerst de activiteit, dan de plek;
--   * wie de dienst had, krijgt het bericht "eraf" en de overnemer "ingedeeld" via de bestaande triggers op rol_slots, behalve de wijziger zelf (R18);
--   * één logregel met namen, in dezelfde transactie.

create function public.dienst_overnemen(p_activiteit_id uuid, p_lid_id uuid, p_rol text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ik public.leden%rowtype;
  v_act public.activiteiten%rowtype;
  v_slot public.rol_slots%rowtype;
  v_oud public.leden%rowtype;
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  select * into v_ik from public.leden where id = intern.huidig_lid();
  if v_ik.id is null or not v_ik.actief or v_ik.type <> 'lid' or v_ik.alleen_beheer then
    perform intern.fout('geen_lid');
  end if;
  if p_lid_id = v_ik.id then
    perform intern.fout('zelf');
  end if;

  select * into v_act from public.activiteiten where id = p_activiteit_id for update;
  if v_act.id is null then
    perform intern.fout('geen_bezetter');
  end if;
  if v_act.status not in ('concept', 'gepubliceerd') then
    perform intern.fout('activiteit_niet_open', jsonb_build_object('reden', 'geannuleerd'));
  end if;
  if v_act.eindigt_om <= clock_timestamp() then
    perform intern.fout('activiteit_niet_open', jsonb_build_object('reden', 'afgelopen'));
  end if;

  select * into v_slot from public.rol_slots where activiteit_id = v_act.id and bezetter_id = p_lid_id for update;
  if v_slot.id is null then
    perform intern.fout('geen_bezetter');
  end if;
  if v_slot.rol_type is distinct from p_rol then
    perform intern.fout('dienst_gewijzigd');
  end if;
  if v_slot.rol_type in ('eindverantwoordelijke', 'bak') then
    perform intern.fout('rol_niet_overneembaar');
  end if;
  if exists (select 1 from public.rol_slots s where s.activiteit_id = v_act.id and s.bezetter_id = v_ik.id) then
    perform intern.fout('dubbelboeking');
  end if;
  if exists (select 1 from public.afmeldingen af where af.activiteit_id = v_act.id and af.lid_id = v_ik.id) then
    perform intern.fout('zelf_afgemeld');
  end if;

  select * into v_oud from public.leden where id = p_lid_id;
  update public.rol_slots set bezetter_id = v_ik.id where id = v_slot.id;

  -- Zoals bij ruil_dienst: leden moeten zien dat de bezetting is veranderd, dus bijgewerkt verschuift.
  perform set_config('bk.zichtbaar', v_act.id::text, true);
  update public.activiteiten set naam = naam where id = v_act.id;
  perform set_config('bk.zichtbaar', '', true);

  insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
  values (v_ik.id, 'dienst_overgenomen', 'rol_slots', v_slot.id,
          format('%s %s nam de dienst %s van %s %s over bij %s (%s)', v_ik.voornaam, v_ik.achternaam, v_slot.rol_type,
                 v_oud.voornaam, v_oud.achternaam, v_act.naam, to_char(v_act.datum, 'DD-MM-YYYY')));

  return jsonb_build_object('activiteit_id', v_act.id, 'rol', v_slot.rol_type);
end
$$;

revoke all on function public.dienst_overnemen(uuid, uuid, text) from public, anon;
grant execute on function public.dienst_overnemen(uuid, uuid, text) to authenticated;

-- Het wijzigingenlog kent de nieuwe actie bij "Diensten".

create or replace function public.wijzigingen_lezen(p_soort text default 'alles', p_voor_id bigint default null, p_aantal int default 50)
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
                                              'helper_toegevoegd', 'dienst_geruild', 'dienst_overgenomen', 'bak_gewijzigd')
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

