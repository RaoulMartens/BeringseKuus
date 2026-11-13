-- Meerdere dagen van een reeks tegelijk bewerken (zie UX-FLOWS.md, "Reeksen"): dezelfde gegevens voor alle dagen in één keer
-- invullen en eventueel alle dagen tegelijk publiceren. Handig als dezelfde activiteit (zoals het verkopen van donateurskaarten) op
-- vijf dagen staat en overal dezelfde tijd, plaats en eindverantwoordelijke mist.
--
-- De functie bouwt op activiteit_opslaan (bouwgids 4.4) en doet niets zelf aan de gegevens van een activiteit: per dag roept ze
-- die ene functie aan, binnen dezelfde transactie. Daardoor gelden voor elke dag precies dezelfde controles, dezelfde publicatie-
-- voorwaarden (R21), dezelfde optimistische controle op de versie en hetzelfde logboek als bij één activiteit, en is het alles of
-- niets: faalt één dag, dan draait de hele transactie terug en blijft er van alle dagen niets gewijzigd.
--
-- Beperkt tot concepten. Een gepubliceerde activiteit wijzigen hoort bij berichten aan de betrokken leden (bouwgids 5.5), en die
-- bestaan nog niet; daarom weigert de functie een dag die al gepubliceerd is (alleen_concept) in plaats van stil leden te raken.
-- Naam en datum zijn per dag en kunnen hier niet worden meegegeven: ze horen niet bij "voor alle dagen".

create function public.activiteiten_bulk_wijzigen(
  p_activiteiten jsonb,
  p_velden jsonb default '{}'::jsonb,
  p_eindverantwoordelijke uuid default null,
  p_publiceren boolean default false
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  -- Meer dagen in één keer is geen reeks meer: begrensd, zoals de bulk-aanmaak op 200 regels.
  c_max constant int := 50;
  v_nr int := -1;
  v_element jsonb;
  v_id uuid;
  v_versie int;
  v_rij public.activiteiten%rowtype;
  v_slot public.rol_slots%rowtype;
  v_wijzigingen jsonb;
  v_resultaat jsonb;
  v_resultaten jsonb := '[]'::jsonb;
  v_gezien uuid[] := '{}';
  v_sleutel text;
  v_msg text;
  v_detail text;
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;

  if p_activiteiten is null or jsonb_typeof(p_activiteiten) <> 'array' then
    perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'activiteiten'));
  end if;
  if jsonb_array_length(p_activiteiten) = 0 then
    perform intern.fout('veld_ontbreekt', jsonb_build_object('velden', jsonb_build_array('activiteiten')));
  end if;
  if jsonb_array_length(p_activiteiten) > c_max then
    perform intern.fout('te_veel_regels', jsonb_build_object('max', c_max));
  end if;
  if p_velden is null then p_velden := '{}'::jsonb; end if;
  if jsonb_typeof(p_velden) <> 'object' then
    perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'velden'));
  end if;
  -- Naam en datum zijn per dag; hier alleen wat voor alle dagen gelijk is.
  for v_sleutel in select jsonb_object_keys(p_velden) loop
    if v_sleutel in ('naam', 'datum') then
      perform intern.fout('veld_ongeldig', jsonb_build_object('veld', v_sleutel));
    end if;
  end loop;
  p_publiceren := coalesce(p_publiceren, false);

  for v_element in select * from jsonb_array_elements(p_activiteiten) loop
    v_nr := v_nr + 1;
    begin
      if jsonb_typeof(v_element) <> 'object' then
        perform intern.fout('wijziging_ongeldig');
      end if;
      v_id := intern.json_uuid(v_element -> 'id', 'activiteiten', 'activiteit_onbekend');
      v_versie := intern.json_geheel(v_element -> 'versie', 'versie');
      if v_id = any (v_gezien) then
        perform intern.fout('wijziging_ongeldig');
      end if;
      v_gezien := array_append(v_gezien, v_id);

      select * into v_rij from public.activiteiten where id = v_id;
      if not found then
        perform intern.fout('activiteit_onbekend');
      end if;
      if v_rij.status <> 'concept' then
        perform intern.fout('alleen_concept');
      end if;

      -- De eindverantwoordelijke aanwijzen op de ene vaste plek van deze dag, met wie daar nu staat als controle.
      v_wijzigingen := '[]'::jsonb;
      if p_eindverantwoordelijke is not null then
        select * into v_slot from public.rol_slots where activiteit_id = v_id and rol_type = 'eindverantwoordelijke';
        v_wijzigingen := jsonb_build_array(jsonb_build_object(
          'handeling', 'toewijzen', 'rol_slot_id', v_slot.id,
          'verwachte_bezetter', v_slot.bezetter_id, 'lid_id', p_eindverantwoordelijke));
      end if;

      v_resultaat := public.activiteit_opslaan(v_id, p_velden, v_wijzigingen, p_publiceren, v_versie);
      v_resultaten := v_resultaten || jsonb_build_array(v_resultaat);
    exception
      when sqlstate 'BK001' then
        -- De fout van deze dag, met het nummer in de lijst (dag, vanaf 0) en de activiteit erbij, zodat de app kan zeggen welke dag het is.
        -- Niet "regel": die sleutel gebruikt activiteit_opslaan zelf voor een regel in zijn wijzigingenlijst.
        get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
        perform intern.fout(v_msg, coalesce(nullif(v_detail, '')::jsonb, '{}'::jsonb)
          || jsonb_build_object('dag', v_nr, 'activiteit_id', v_id));
    end;
  end loop;

  return jsonb_build_object('aantal', jsonb_array_length(v_resultaten), 'gepubliceerd', p_publiceren,
                            'activiteiten', v_resultaten);
end
$$;

revoke all on function public.activiteiten_bulk_wijzigen(jsonb, jsonb, uuid, boolean) from public, anon;
grant execute on function public.activiteiten_bulk_wijzigen(jsonb, jsonb, uuid, boolean) to authenticated;
