-- De bak bij de Bonte Avond (BA-8, R23): een lijst plekken die alleen de beheerder wijzigt, met de plaats in de bak als label
-- (prins, adjudant, vorst of raadslid). Leden zien wie erin zit (alleen lezen). De kolommen bestonden al (rol_slots met rol_type
-- 'bak' en een plek_label, activiteiten.bak_actief); `activiteit_opslaan` weigert een bakplek nog met niet_ondersteund en blijft
-- dat doen. Dit voegt twee dingen toe, zonder die grote functie aan te raken:
--
--  1. intern.bak_zetten: zet de bak van één activiteit in één keer op de gevraagde lijst (plekken erbij, een andere bezetter,
--     plekken eraf) en de schakelaar bak_actief;
--  2. public.activiteit_opslaan_met_bak: roept activiteit_opslaan aan en daarna bak_zetten, in één transactie. Faalt het een of
--     het ander, dan gaat er niets door: "alles of niets" geldt voor het hele scherm, de bak erbij.
--
-- De lijst is de gewenste eindtoestand, zoals de rest van het scherm: een plek met slot_id wordt bijgewerkt, een plek zonder
-- slot_id is nieuw, en een bakplek van de activiteit die niet in de lijst staat, gaat weg. Een bakplek die niet bij deze
-- activiteit hoort, een label dat niet bestaat, of iemand die al een andere plek heeft (dubbelboeking, R6) is een fout.
-- `verwachte_bezetter` beschermt tegen twee beheerders tegelijk, zoals bij andere plekken (UC-005 AF-8).
-- Berichten: een bakplek erbij of eraf geeft hetzelfde bericht als elke plek (bericht_na_plek, BA-4).

create function intern.bak_zetten(p_activiteit uuid, p_bak jsonb) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  c_labels constant text[] := array['prins', 'adjudant', 'vorst', 'raadslid'];
  c_max constant int := 30;
  v_actief boolean := false;
  v_plekken jsonb := '[]'::jsonb;
  v_plek jsonb;
  v_nr int := -1;
  v_label text;
  v_slot public.rol_slots%rowtype;
  v_slot_id uuid;
  v_bezetter uuid;
  v_verwacht uuid;
  v_behouden uuid[] := '{}';
  v_bezetters uuid[] := '{}';
  v_volgorde int := 100;
  v_dubbel uuid[];
  v_aantal int;
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  perform 1 from public.activiteiten where id = p_activiteit for update;
  if not found then
    perform intern.fout('activiteit_onbekend');
  end if;
  if jsonb_typeof(p_bak) <> 'object' then
    perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'bak'));
  end if;

  if jsonb_typeof(p_bak -> 'actief') = 'boolean' then
    v_actief := (p_bak ->> 'actief')::boolean;
  elsif p_bak ? 'actief' and jsonb_typeof(p_bak -> 'actief') <> 'null' then
    perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'bak'));
  end if;
  -- Staat de bak uit, dan zijn er geen bakplekken: wat er stond gaat weg (met een bericht als de activiteit gepubliceerd is).
  if v_actief and p_bak ? 'plekken' and jsonb_typeof(p_bak -> 'plekken') <> 'null' then
    v_plekken := p_bak -> 'plekken';
  end if;
  if jsonb_typeof(v_plekken) <> 'array' or jsonb_array_length(v_plekken) > c_max then
    perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'bak'));
  end if;

  -- Eerst alles lezen en controleren, dan pas schrijven: een fout laat niets half achter.
  for v_plek in select * from jsonb_array_elements(v_plekken) loop
    v_nr := v_nr + 1;
    if jsonb_typeof(v_plek) <> 'object' then
      perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'bak', 'regel', v_nr));
    end if;
    v_label := v_plek ->> 'label';
    if v_label is null or v_label <> all (c_labels) then
      perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'bak', 'regel', v_nr));
    end if;
    v_bezetter := case when jsonb_typeof(v_plek -> 'bezetter_id') = 'string'
                       then intern.json_uuid(v_plek -> 'bezetter_id', 'bak', 'veld_ongeldig') end;
    if v_bezetter is not null then
      -- Een lid van de vereniging dat meedoet; een externe helper of een inactief lid kan niet in de bak.
      if not exists (select 1 from public.leden l where l.id = v_bezetter and l.actief and l.type = 'lid') then
        perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'bak', 'regel', v_nr));
      end if;
      v_bezetters := v_bezetters || v_bezetter;
    end if;
    if v_plek ? 'slot_id' and jsonb_typeof(v_plek -> 'slot_id') = 'string' then
      v_slot_id := intern.json_uuid(v_plek -> 'slot_id', 'bak', 'veld_ongeldig');
      select * into v_slot from public.rol_slots
       where id = v_slot_id and activiteit_id = p_activiteit and rol_type = 'bak' for update;
      if not found then
        perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'bak', 'regel', v_nr));
      end if;
      v_verwacht := case when jsonb_typeof(v_plek -> 'verwachte_bezetter') = 'string'
                         then intern.json_uuid(v_plek -> 'verwachte_bezetter', 'bak', 'veld_ongeldig') end;
      if v_verwacht is distinct from v_slot.bezetter_id then
        perform intern.fout('slot_gewijzigd', jsonb_build_object('rol_slot_id', v_slot_id,
          'bezetter_id', v_slot.bezetter_id, 'regel', v_nr));
      end if;
      v_behouden := v_behouden || v_slot_id;
    end if;
  end loop;

  -- Geen dubbelboeking (R6): niemand twee keer in de bak, en niemand die al een andere plek bij deze activiteit heeft.
  select coalesce(array_agg(b), '{}') into v_dubbel
    from (select b from unnest(v_bezetters) b group by b having count(*) > 1) d;
  if cardinality(v_dubbel) = 0 then
    select coalesce(array_agg(distinct s.bezetter_id), '{}') into v_dubbel
      from public.rol_slots s
     where s.activiteit_id = p_activiteit and s.rol_type <> 'bak' and s.bezetter_id = any (v_bezetters);
  end if;
  if cardinality(v_dubbel) > 0 then
    perform intern.fout('dubbelboeking', jsonb_build_object('lid_ids', to_jsonb(v_dubbel)));
  end if;

  -- Schrijven. Eerst de plekken die weggaan (anders botst een bezetter die van de ene naar de andere plek schuift met zichzelf).
  delete from public.rol_slots
   where activiteit_id = p_activiteit and rol_type = 'bak' and id <> all (v_behouden);
  get diagnostics v_aantal = row_count;

  v_nr := -1;
  for v_plek in select * from jsonb_array_elements(v_plekken) loop
    v_nr := v_nr + 1;
    v_label := v_plek ->> 'label';
    v_bezetter := case when jsonb_typeof(v_plek -> 'bezetter_id') = 'string' then (v_plek ->> 'bezetter_id')::uuid end;
    v_volgorde := v_volgorde + 1;
    if v_plek ? 'slot_id' and jsonb_typeof(v_plek -> 'slot_id') = 'string' then
      update public.rol_slots
         set bezetter_id = v_bezetter, plek_label = v_label, volgorde = v_volgorde
       where id = (v_plek ->> 'slot_id')::uuid;
    else
      insert into public.rol_slots (activiteit_id, rol_type, bezetter_id, plek_label, volgorde)
      values (p_activiteit, 'bak', v_bezetter, v_label, v_volgorde);
    end if;
  end loop;

  -- Leden zien de bak: de activiteit telt als gewijzigd, en de versie loopt op (beheerder tegen beheerder, zoals bij elke wijziging).
  perform set_config('bk.zichtbaar', p_activiteit::text, true);
  update public.activiteiten
     set bak_actief = v_actief, versie = versie + 1
   where id = p_activiteit;

  insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
  values (intern.huidig_lid(), 'bak_gewijzigd', 'activiteiten', p_activiteit,
          format('bak %s, %s plekken', case when v_actief then 'aan' else 'uit' end, jsonb_array_length(v_plekken)));
end
$$;
revoke all on function intern.bak_zetten(uuid, jsonb) from public, anon, authenticated;

create function public.activiteit_opslaan_met_bak(
  p_activiteit_id uuid default null,
  p_velden jsonb default '{}'::jsonb,
  p_wijzigingen jsonb default '[]'::jsonb,
  p_publiceren boolean default false,
  p_verwachte_versie int default null,
  p_bak jsonb default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uitkomst jsonb;
begin
  v_uitkomst := public.activiteit_opslaan(p_activiteit_id, p_velden, p_wijzigingen, p_publiceren, p_verwachte_versie);
  if p_bak is not null and jsonb_typeof(p_bak) <> 'null' then
    perform intern.bak_zetten((v_uitkomst ->> 'activiteit_id')::uuid, p_bak);
  end if;
  return v_uitkomst;
end
$$;
revoke all on function public.activiteit_opslaan_met_bak(uuid, jsonb, jsonb, boolean, int, jsonb) from public, anon;
grant execute on function public.activiteit_opslaan_met_bak(uuid, jsonb, jsonb, boolean, int, jsonb) to authenticated;
