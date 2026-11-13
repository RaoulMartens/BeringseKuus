-- Meerdere activiteiten tegelijk aanmaken (UC-006, bouwgids 4.5): één databasefunctie die alles in één transactie doet.
--
-- Een lijst regels (uit een Excel-bestand, later ook uit "vorig seizoen kopiëren") wordt in één keer concepten:
--   * alles of niets: faalt één regel, dan wordt er niets aangemaakt, en de foutcode zegt welke regel (`regel`, vanaf 0) en wat er
--     mis is. De app houdt de lijst op het scherm, zodat de beheerder hem kan aanpassen en opnieuw kan proberen;
--   * idempotent: twee keer klikken op "N concepten aanmaken", of een herhaalde aanroep na een netwerkfout, maakt nooit
--     dubbele activiteiten. De aanmaak_id (door de app gemaakt bij het openen van het controlescherm) wordt bewaard; een tweede
--     aanroep met dezelfde id geeft het eerste resultaat terug;
--   * elke activiteit krijgt precies één lege eindverantwoordelijke-plek (zoals activiteit_opslaan) en eventueel de gevraagde
--     lege plekken per rol; de status is altijd concept, dus er gaan geen berichten uit (R18);
--   * één regel per activiteit in wijzigingen_log, in dezelfde transactie.
--
-- De app krijgt alleen recht op deze functie, niet op losse inserts in activiteiten.

-- ===== De bewaarde aanmaakacties (voor de idempotentie) =====
-- Geen rechten voor wie ingelogd is: alleen de functie hieronder (security definer) leest en schrijft hier.
create table public.bulk_aanmaken (
  aanmaak_id uuid primary key,
  vereniging_id uuid not null default 'b3a17e00-0000-4000-8000-000000000001' references public.verenigingen (id),
  door_lid_id uuid references public.leden (id) on delete set null,
  aangemaakt timestamptz not null default now(),
  activiteit_ids uuid[] not null
);
alter table public.bulk_aanmaken enable row level security;
-- Een index op elke vreemde sleutel (de rechtentest eist het) en geen truncate voor service_role: truncate slaat de triggers over.
create index bulk_aanmaken_vereniging on public.bulk_aanmaken (vereniging_id);
create index bulk_aanmaken_door_lid on public.bulk_aanmaken (door_lid_id);
revoke truncate on public.bulk_aanmaken from service_role;

-- ===== De functie =====
create function public.activiteiten_bulk_aanmaken(p_aanmaak_id uuid, p_regels jsonb) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  -- Meer regels in één keer is een fout: de bouwgids begrenst de import op 200 regels.
  c_max constant int := 200;
  c_toegestaan constant text[] := array['naam', 'datum', 'verzameltijd', 'starttijd', 'eindtijd', 'locatie',
    'bus_vertrektijd', 'bus_locatie', 'notitie', 'afmeld_deadline', 'min_aanwezigen', 'groepen', 'plekken'];
  v_lid uuid := intern.huidig_lid();
  v_bestaand public.bulk_aanmaken%rowtype;
  v_regel jsonb;
  v_nr int := -1;
  v_sleutel text;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_naam text;
  v_datum date;
  v_verzameltijd time;
  v_starttijd time;
  v_eindtijd time;
  v_locatie text;
  v_bus_tijd time;
  v_bus_locatie text;
  v_notitie text;
  v_deadline timestamptz;
  v_min int;
  v_groepen uuid[];
  v_groep jsonb;
  v_plekken jsonb;
  v_plek jsonb;
  v_rol text;
  v_aantal int;
  v_volgorde int;
  v_ontbreekt text[];
  v_msg text;
  v_detail text;
  v_code text;
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  if p_aanmaak_id is null then
    perform intern.fout('veld_ontbreekt', jsonb_build_object('velden', jsonb_build_array('aanmaak_id')));
  end if;

  -- Eén aanroep tegelijk per aanmaak_id: een dubbele klik wacht hier en vindt daarna het eerste resultaat.
  perform pg_advisory_xact_lock(hashtext('bulk_aanmaken:' || p_aanmaak_id::text));
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  select * into v_bestaand from public.bulk_aanmaken where aanmaak_id = p_aanmaak_id;
  if found then
    return jsonb_build_object('aantal', cardinality(v_bestaand.activiteit_ids),
                              'activiteit_ids', to_jsonb(v_bestaand.activiteit_ids), 'herhaald', true);
  end if;

  if p_regels is null or jsonb_typeof(p_regels) <> 'array' then
    perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'regels'));
  end if;
  if jsonb_array_length(p_regels) = 0 then
    perform intern.fout('veld_ontbreekt', jsonb_build_object('velden', jsonb_build_array('regels')));
  end if;
  if jsonb_array_length(p_regels) > c_max then
    perform intern.fout('te_veel_regels', jsonb_build_object('max', c_max));
  end if;

  for v_regel in select * from jsonb_array_elements(p_regels) loop
    v_nr := v_nr + 1;
    begin
      if jsonb_typeof(v_regel) <> 'object' then
        perform intern.fout('wijziging_ongeldig');
      end if;
      for v_sleutel in select jsonb_object_keys(v_regel) loop
        if v_sleutel <> all (c_toegestaan) then
          perform intern.fout('veld_ongeldig', jsonb_build_object('veld', v_sleutel));
        end if;
      end loop;

      v_naam := intern.json_tekst(v_regel -> 'naam', 'naam', 200);
      v_datum := intern.json_datum(v_regel -> 'datum', 'datum');
      v_verzameltijd := intern.json_tijd(v_regel -> 'verzameltijd', 'verzameltijd');
      v_starttijd := intern.json_tijd(v_regel -> 'starttijd', 'starttijd');
      v_eindtijd := intern.json_tijd(v_regel -> 'eindtijd', 'eindtijd');
      v_locatie := intern.json_tekst(v_regel -> 'locatie', 'locatie', 200);
      v_bus_tijd := intern.json_tijd(v_regel -> 'bus_vertrektijd', 'bus_vertrektijd');
      v_bus_locatie := intern.json_tekst(v_regel -> 'bus_locatie', 'bus_locatie', 200);
      v_notitie := intern.json_tekst(v_regel -> 'notitie', 'notitie');
      v_deadline := intern.json_tijdstip(v_regel -> 'afmeld_deadline', 'afmeld_deadline');
      v_min := intern.json_geheel(v_regel -> 'min_aanwezigen', 'min_aanwezigen');

      -- Dezelfde verplichte velden als bij één activiteit (UC-004 AF-4): naam, datum, starttijd en locatie.
      v_ontbreekt := '{}';
      if v_naam is null then v_ontbreekt := array_append(v_ontbreekt, 'naam'); end if;
      if v_datum is null then v_ontbreekt := array_append(v_ontbreekt, 'datum'); end if;
      if v_starttijd is null then v_ontbreekt := array_append(v_ontbreekt, 'starttijd'); end if;
      if v_locatie is null then v_ontbreekt := array_append(v_ontbreekt, 'locatie'); end if;
      if cardinality(v_ontbreekt) > 0 then
        perform intern.fout('veld_ontbreekt', jsonb_build_object('velden', to_jsonb(v_ontbreekt)));
      end if;
      if v_eindtijd is not null and v_eindtijd = v_starttijd then
        perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'eindtijd'));
      end if;
      if v_min is not null and v_min < 1 then
        perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'min_aanwezigen'));
      end if;

      -- De doelgroep: een lijst groep-id's; leeg of afwezig is iedereen.
      v_groepen := '{}';
      if v_regel ? 'groepen' and jsonb_typeof(v_regel -> 'groepen') = 'array' then
        for v_groep in select * from jsonb_array_elements(v_regel -> 'groepen') loop
          v_groepen := v_groepen || intern.json_uuid(v_groep, 'groepen', 'groep_onbekend');
        end loop;
      elsif v_regel ? 'groepen' and jsonb_typeof(v_regel -> 'groepen') <> 'null' then
        perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'groepen'));
      end if;
      select coalesce(array_agg(g order by g), '{}') into v_groepen from (select distinct g from unnest(v_groepen) g) d;
      if (select count(*) from public.groepen where id = any (v_groepen)) <> coalesce(cardinality(v_groepen), 0) then
        perform intern.fout('groep_onbekend');
      end if;

      -- De gevraagde lege plekken per rol (bij kopiëren); een Excel-import vraagt er geen.
      v_plekken := coalesce(v_regel -> 'plekken', '[]'::jsonb);
      if jsonb_typeof(v_plekken) = 'null' then v_plekken := '[]'::jsonb; end if;
      if jsonb_typeof(v_plekken) <> 'array' then
        perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'plekken'));
      end if;
      for v_plek in select * from jsonb_array_elements(v_plekken) loop
        if jsonb_typeof(v_plek) <> 'object' then
          perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'plekken'));
        end if;
        v_rol := intern.json_tekst(v_plek -> 'rol_type', 'plekken', 40);
        v_aantal := intern.json_geheel(v_plek -> 'aantal', 'plekken');
        if v_rol is null or v_aantal is null or v_aantal < 1 or v_aantal > 20
           or not exists (select 1 from public.roltypen where code = v_rol and toevoegbaar) then
          perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'plekken'));
        end if;
      end loop;

      -- Schrijven.
      insert into public.activiteiten (naam, datum, verzameltijd, starttijd, eindtijd, locatie, bus_vertrektijd,
                                       bus_locatie, notitie, afmeld_deadline, min_aanwezigen)
      values (v_naam, v_datum, v_verzameltijd, v_starttijd, v_eindtijd, v_locatie, v_bus_tijd, v_bus_locatie,
              v_notitie, v_deadline, v_min)
      returning id into v_id;
      insert into public.rol_slots (activiteit_id, rol_type, volgorde) values (v_id, 'eindverantwoordelijke', 0);
      v_volgorde := 0;
      for v_plek in select * from jsonb_array_elements(v_plekken) loop
        v_rol := v_plek ->> 'rol_type';
        for i in 1 .. (v_plek ->> 'aantal')::int loop
          v_volgorde := v_volgorde + 1;
          insert into public.rol_slots (activiteit_id, rol_type, volgorde) values (v_id, v_rol, v_volgorde);
        end loop;
      end loop;
      if cardinality(v_groepen) > 0 then
        insert into public.activiteit_groep (activiteit_id, groep_id) select v_id, g from unnest(v_groepen) g;
      end if;
      insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
      values (v_lid, 'activiteit_aangemaakt', 'activiteiten', v_id,
              format('%s (%s) aangemaakt als concept, met meerdere tegelijk', v_naam, to_char(v_datum, 'DD-MM-YYYY')));
      v_ids := array_append(v_ids, v_id);
    exception
      when sqlstate 'BK001' then
        -- De fout van deze regel, met het regelnummer erbij. Een datum die niet klopt heeft in de bouwgids een eigen code.
        get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
        v_code := v_msg;
        if v_msg = 'veld_ongeldig' and coalesce(nullif(v_detail, '')::jsonb ->> 'veld', '') = 'datum' then
          v_code := 'datum_ongeldig';
        end if;
        perform intern.fout(v_code, coalesce(nullif(v_detail, '')::jsonb, '{}'::jsonb) || jsonb_build_object('regel', v_nr));
      when check_violation then
        perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'regel', 'regel', v_nr));
    end;
  end loop;

  insert into public.bulk_aanmaken (aanmaak_id, door_lid_id, activiteit_ids) values (p_aanmaak_id, v_lid, v_ids);
  return jsonb_build_object('aantal', cardinality(v_ids), 'activiteit_ids', to_jsonb(v_ids), 'herhaald', false);
end
$$;

revoke all on function public.activiteiten_bulk_aanmaken(uuid, jsonb) from public, anon;
grant execute on function public.activiteiten_bulk_aanmaken(uuid, jsonb) to authenticated;
