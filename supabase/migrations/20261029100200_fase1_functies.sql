-- Fase 1, stap C: de schrijffuncties en het beheeroverzicht (docs/bouw/Datamodel-fase-1.md punt 4, 5 en 7).
--
-- Elke functie controleert eerst wie belt (is_beheerder), dan pas wat er bestaat, neemt de rij-lock op de activiteit,
-- en controleert elk veld zelf vóór het schrijven: de check-regels van de tabellen zijn alleen het vangnet, zodat de
-- app nooit een kale SQLSTATE als 23514 of 22007 krijgt (DM-13). Elke fout is intern.fout() met SQLSTATE BK001.

-- Invoerhulpen: lezen één JSON-waarde als het goede soort, of geven veld_ongeldig met de naam van het veld.
create function intern.json_tekst(p jsonb, p_veld text) returns text
language plpgsql
set search_path = ''
as $$
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) <> 'string' then
    perform intern.fout('veld_ongeldig', jsonb_build_object('veld', p_veld));
  end if;
  return nullif(btrim(p #>> '{}'), '');
end
$$;

create function intern.json_datum(p jsonb, p_veld text) returns date
language plpgsql
set search_path = ''
as $$
declare v_tekst text := intern.json_tekst(p, p_veld);
begin
  if v_tekst is null then return null; end if;
  begin
    return v_tekst::date;
  exception when others then
    perform intern.fout('veld_ongeldig', jsonb_build_object('veld', p_veld));
  end;
  return null;
end
$$;

create function intern.json_tijd(p jsonb, p_veld text) returns time
language plpgsql
set search_path = ''
as $$
declare v_tekst text := intern.json_tekst(p, p_veld);
begin
  if v_tekst is null then return null; end if;
  begin
    return v_tekst::time;
  exception when others then
    perform intern.fout('veld_ongeldig', jsonb_build_object('veld', p_veld));
  end;
  return null;
end
$$;

create function intern.json_tijdstip(p jsonb, p_veld text) returns timestamptz
language plpgsql
set search_path = ''
as $$
declare v_tekst text := intern.json_tekst(p, p_veld);
begin
  if v_tekst is null then return null; end if;
  begin
    return v_tekst::timestamptz;
  exception when others then
    perform intern.fout('veld_ongeldig', jsonb_build_object('veld', p_veld));
  end;
  return null;
end
$$;

create function intern.json_geheel(p jsonb, p_veld text) returns int
language plpgsql
set search_path = ''
as $$
declare v_getal numeric;
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) <> 'number' then
    perform intern.fout('veld_ongeldig', jsonb_build_object('veld', p_veld));
  end if;
  v_getal := (p #>> '{}')::numeric;
  if v_getal <> trunc(v_getal) or abs(v_getal) > 100000 then
    perform intern.fout('veld_ongeldig', jsonb_build_object('veld', p_veld));
  end if;
  return v_getal::int;
end
$$;

create function intern.json_uuid(p jsonb, p_veld text, p_code text) returns uuid
language plpgsql
set search_path = ''
as $$
begin
  if p is null or jsonb_typeof(p) <> 'string' then
    perform intern.fout(p_code, jsonb_build_object('veld', p_veld));
  end if;
  begin
    return (p #>> '{}')::uuid;
  exception when others then
    perform intern.fout(p_code, jsonb_build_object('veld', p_veld));
  end;
  return null;
end
$$;

-- Een activiteit aanmaken of een concept wijzigen (V8 4.4). De handtekening is die van V8, zodat fase 2 hem uitbreidt in
-- plaats van vervangt. In fase 1: aanmaken, de velden van een concept, de doelgroep, en lege plekken toevoegen of
-- weghalen. toewijzen, leegmaken, de bak, een gepubliceerde activiteit wijzigen en publiceren geven niet_ondersteund.
-- p_velden is een gedeeltelijke wijziging: een sleutel die ontbreekt blijft zoals hij was, null maakt het veld leeg.
create function public.activiteit_opslaan(
  p_activiteit_id uuid,
  p_velden jsonb,
  p_wijzigingen jsonb,
  p_publiceren boolean default false
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_toegestaan constant text[] := array['naam', 'datum', 'verzameltijd', 'starttijd', 'eindtijd', 'locatie',
    'bus_vertrektijd', 'bus_locatie', 'notitie', 'afmeld_deadline', 'min_aanwezigen', 'groepen'];
  v_lid uuid;
  v_nieuw boolean := p_activiteit_id is null;
  v_id uuid := p_activiteit_id;
  v_rij public.activiteiten%rowtype;
  v_sleutel text;
  v_naam text;
  v_datum date;
  v_verzameltijd time;
  v_starttijd time;
  v_eindtijd time;
  v_locatie text;
  v_bus_vertrektijd time;
  v_bus_locatie text;
  v_notitie text;
  v_deadline timestamptz;
  v_min int;
  v_groepen uuid[];
  v_groep_element jsonb;
  v_ontbreekt text[] := '{}';
  v_regel jsonb;
  v_regelnummer int;
  v_handeling text;
  v_rol text;
  v_tijdelijk text;
  v_tijdelijke text[] := '{}';
  v_plekken jsonb := '{}'::jsonb;
  v_slot public.rol_slots%rowtype;
  v_slot_id uuid;
  v_volgorde int;
  v_wijzig_velden boolean;
begin
  -- Eerst wie belt, ook voor een onbekend id.
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  v_lid := intern.huidig_lid();

  if p_velden is null then p_velden := '{}'::jsonb; end if;
  if p_wijzigingen is null then p_wijzigingen := '[]'::jsonb; end if;
  if jsonb_typeof(p_velden) <> 'object' then
    perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'velden'));
  end if;
  if jsonb_typeof(p_wijzigingen) <> 'array' then
    perform intern.fout('wijziging_ongeldig', jsonb_build_object('regel', null));
  end if;
  if coalesce(p_publiceren, false) then
    perform intern.fout('niet_ondersteund', jsonb_build_object('onderdeel', 'publiceren'));
  end if;

  if v_nieuw then
    v_min := 13;
  else
    -- De lock op de activiteit, als eerste na de rechtencontrole (V8 4.1).
    select * into v_rij from public.activiteiten where id = v_id for update;
    if not found then
      perform intern.fout('activiteit_onbekend');
    end if;
    if v_rij.status <> 'concept' then
      perform intern.fout('niet_ondersteund', jsonb_build_object('onderdeel', 'gepubliceerde activiteit wijzigen'));
    end if;
    v_naam := v_rij.naam; v_datum := v_rij.datum; v_verzameltijd := v_rij.verzameltijd;
    v_starttijd := v_rij.starttijd; v_eindtijd := v_rij.eindtijd; v_locatie := v_rij.locatie;
    v_bus_vertrektijd := v_rij.bus_vertrektijd; v_bus_locatie := v_rij.bus_locatie; v_notitie := v_rij.notitie;
    v_deadline := v_rij.afmeld_deadline; v_min := v_rij.min_aanwezigen;
  end if;

  -- De velden: alleen de toegestane sleutels, elk van het goede soort.
  for v_sleutel in select jsonb_object_keys(p_velden) loop
    if v_sleutel <> all (v_toegestaan) then
      perform intern.fout('veld_ongeldig', jsonb_build_object('veld', v_sleutel));
    end if;
  end loop;
  if p_velden ? 'naam' then v_naam := intern.json_tekst(p_velden -> 'naam', 'naam'); end if;
  if p_velden ? 'datum' then v_datum := intern.json_datum(p_velden -> 'datum', 'datum'); end if;
  if p_velden ? 'verzameltijd' then
    v_verzameltijd := intern.json_tijd(p_velden -> 'verzameltijd', 'verzameltijd');
  end if;
  if p_velden ? 'starttijd' then v_starttijd := intern.json_tijd(p_velden -> 'starttijd', 'starttijd'); end if;
  if p_velden ? 'eindtijd' then v_eindtijd := intern.json_tijd(p_velden -> 'eindtijd', 'eindtijd'); end if;
  if p_velden ? 'locatie' then v_locatie := intern.json_tekst(p_velden -> 'locatie', 'locatie'); end if;
  if p_velden ? 'bus_vertrektijd' then
    v_bus_vertrektijd := intern.json_tijd(p_velden -> 'bus_vertrektijd', 'bus_vertrektijd');
  end if;
  if p_velden ? 'bus_locatie' then
    v_bus_locatie := intern.json_tekst(p_velden -> 'bus_locatie', 'bus_locatie');
  end if;
  if p_velden ? 'notitie' then v_notitie := intern.json_tekst(p_velden -> 'notitie', 'notitie'); end if;
  if p_velden ? 'afmeld_deadline' then
    v_deadline := intern.json_tijdstip(p_velden -> 'afmeld_deadline', 'afmeld_deadline');
  end if;
  if p_velden ? 'min_aanwezigen' then v_min := intern.json_geheel(p_velden -> 'min_aanwezigen', 'min_aanwezigen'); end if;

  if v_starttijd is not null and v_eindtijd is not null and v_starttijd = v_eindtijd then
    perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'eindtijd'));
  end if;
  if v_min is not null and v_min < 1 then
    perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'min_aanwezigen'));
  end if;

  -- De doelgroep: de volledige nieuwe lijst; leeg = iedereen.
  if p_velden ? 'groepen' then
    v_groepen := '{}';
    if jsonb_typeof(p_velden -> 'groepen') = 'array' then
      for v_groep_element in select * from jsonb_array_elements(p_velden -> 'groepen') loop
        v_groepen := v_groepen || intern.json_uuid(v_groep_element, 'groepen', 'groep_onbekend');
      end loop;
    elsif jsonb_typeof(p_velden -> 'groepen') <> 'null' then
      perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'groepen'));
    end if;
    select coalesce(array_agg(distinct g), '{}') into v_groepen from unnest(v_groepen) g;
    if (select count(*) from public.groepen where id = any (v_groepen)) <> coalesce(cardinality(v_groepen), 0) then
      perform intern.fout('groep_onbekend');
    end if;
  end if;

  -- Naam en datum zijn altijd verplicht (besluit 2); de rest pas om te publiceren.
  if v_naam is null then v_ontbreekt := array_append(v_ontbreekt, 'naam'); end if;
  if v_datum is null then v_ontbreekt := array_append(v_ontbreekt, 'datum'); end if;
  if cardinality(v_ontbreekt) > 0 then
    perform intern.fout('veld_ontbreekt', jsonb_build_object('velden', to_jsonb(v_ontbreekt)));
  end if;

  -- Schrijven.
  v_wijzig_velden := v_nieuw or p_velden <> '{}'::jsonb;
  if v_nieuw then
    insert into public.activiteiten (naam, datum, verzameltijd, starttijd, eindtijd, locatie, bus_vertrektijd,
                                     bus_locatie, notitie, afmeld_deadline, min_aanwezigen)
    values (v_naam, v_datum, v_verzameltijd, v_starttijd, v_eindtijd, v_locatie, v_bus_vertrektijd, v_bus_locatie,
            v_notitie, v_deadline, v_min)
    returning id into v_id;
    -- Precies één lege plek eindverantwoordelijke (Bouwbesluiten 4.4).
    insert into public.rol_slots (activiteit_id, rol_type, volgorde) values (v_id, 'eindverantwoordelijke', 0);
    insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
    values (v_lid, 'activiteit_aangemaakt', 'activiteiten', v_id,
            format('%s (%s) aangemaakt als concept', v_naam, to_char(v_datum, 'DD-MM-YYYY')));
  elsif v_wijzig_velden then
    update public.activiteiten
       set naam = v_naam, datum = v_datum, verzameltijd = v_verzameltijd, starttijd = v_starttijd,
           eindtijd = v_eindtijd, locatie = v_locatie, bus_vertrektijd = v_bus_vertrektijd,
           bus_locatie = v_bus_locatie, notitie = v_notitie, afmeld_deadline = v_deadline,
           min_aanwezigen = v_min
     where id = v_id;
    insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
    values (v_lid, 'activiteit_gewijzigd', 'activiteiten', v_id,
            format('%s (%s) gewijzigd', v_naam, to_char(v_datum, 'DD-MM-YYYY')));
  end if;

  if p_velden ? 'groepen' then
    delete from public.activiteit_groep where activiteit_id = v_id;
    insert into public.activiteit_groep (activiteit_id, groep_id)
    select v_id, g from unnest(v_groepen) g;
  end if;

  -- De plekken. Elke regel heeft een handeling; in fase 1 alleen lege plekken toevoegen en weghalen.
  v_regelnummer := -1;
  for v_regel in select * from jsonb_array_elements(p_wijzigingen) loop
    v_regelnummer := v_regelnummer + 1;
    if jsonb_typeof(v_regel) <> 'object' or jsonb_typeof(v_regel -> 'handeling') <> 'string' then
      perform intern.fout('wijziging_ongeldig', jsonb_build_object('regel', v_regelnummer));
    end if;
    v_handeling := v_regel ->> 'handeling';

    if v_handeling = 'plek_toevoegen' then
      v_rol := v_regel ->> 'rol_type';
      v_tijdelijk := v_regel ->> 'tijdelijk_id';
      if v_rol is null or v_tijdelijk is null or jsonb_typeof(v_regel -> 'tijdelijk_id') <> 'string'
         or v_tijdelijk = '' or v_tijdelijk = any (v_tijdelijke)
         or not exists (select 1 from public.roltypen where code = v_rol) then
        perform intern.fout('wijziging_ongeldig', jsonb_build_object('regel', v_regelnummer));
      end if;
      if v_rol in ('eindverantwoordelijke', 'bak') then
        perform intern.fout('niet_ondersteund', jsonb_build_object('onderdeel', 'plek ' || v_rol, 'regel', v_regelnummer));
      end if;
      v_tijdelijke := v_tijdelijke || v_tijdelijk;
      select coalesce(max(volgorde), 0) + 1 into v_volgorde from public.rol_slots where activiteit_id = v_id;
      insert into public.rol_slots (activiteit_id, rol_type, volgorde) values (v_id, v_rol, v_volgorde)
      returning id into v_slot_id;
      v_plekken := v_plekken || jsonb_build_object(v_tijdelijk, v_slot_id);
      insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
      values (v_lid, 'plek_toegevoegd', 'rol_slots', v_slot_id,
              format('Plek %s toegevoegd bij %s (%s)', v_rol, v_naam, to_char(v_datum, 'DD-MM-YYYY')));

    elsif v_handeling = 'plek_weghalen' then
      v_slot_id := intern.json_uuid(v_regel -> 'rol_slot_id', 'rol_slot_id', 'wijziging_ongeldig');
      -- De plek moet bij déze activiteit horen, anders raakt een verzoek voor A een plek van B (Bouwbesluiten 4.4).
      select * into v_slot from public.rol_slots where id = v_slot_id and activiteit_id = v_id;
      if not found then
        perform intern.fout('plek_onbekend', jsonb_build_object('regel', v_regelnummer));
      end if;
      if v_slot.rol_type = 'eindverantwoordelijke' then
        perform intern.fout('eindverantwoordelijke_verplicht', jsonb_build_object('regel', v_regelnummer));
      end if;
      if v_slot.bezetter_id is not null then
        perform intern.fout('plek_niet_leeg', jsonb_build_object('regel', v_regelnummer));
      end if;
      delete from public.rol_slots where id = v_slot_id;
      insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
      values (v_lid, 'plek_weggehaald', 'rol_slots', v_slot_id,
              format('Plek %s weggehaald bij %s (%s)', v_slot.rol_type, v_naam, to_char(v_datum, 'DD-MM-YYYY')));

    elsif v_handeling in ('toewijzen', 'leegmaken') then
      perform intern.fout('niet_ondersteund', jsonb_build_object('onderdeel', v_handeling, 'regel', v_regelnummer));
    else
      perform intern.fout('wijziging_ongeldig', jsonb_build_object('regel', v_regelnummer));
    end if;
  end loop;

  return jsonb_build_object('activiteit_id', v_id, 'plekken', v_plekken);
end
$$;

-- Een concept verwijderen (V8 4.6). Gepubliceerd of geannuleerd kan niet (alleen_concept). Geen meldingen (R18).
create function public.concept_verwijderen(p_activiteit_id uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_rij public.activiteiten%rowtype;
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;

  select * into v_rij from public.activiteiten where id = p_activiteit_id for update;
  if not found then
    perform intern.fout('activiteit_onbekend');
  end if;
  if v_rij.status <> 'concept' then
    perform intern.fout('alleen_concept');
  end if;

  -- De plekken, de doelgroep en eventuele afmeldingen gaan mee (on delete cascade); een ander concept dat hiervan is
  -- gekopieerd, houdt een lege bron_activiteit_id.
  delete from public.activiteiten where id = v_rij.id;
  insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
  values (intern.huidig_lid(), 'concept_verwijderd', 'activiteiten', v_rij.id,
          format('%s (%s) verwijderd als concept', v_rij.naam, to_char(v_rij.datum, 'DD-MM-YYYY')));

  return jsonb_build_object('naam', v_rij.naam, 'datum', v_rij.datum);
end
$$;

-- Het beheeroverzicht (V8 5.6): per komende, niet-geannuleerde activiteit wat er nog ontbreekt. De tellers en de taak in
-- woorden maakt de app uit deze rijen, zodat getal en lijst nooit uiteenlopen. Plekken in de bak tellen niet mee (V8 5.6).
create function public.beheeroverzicht() returns table (
  activiteit_id uuid,
  naam text,
  datum date,
  status text,
  starttijd_ontbreekt boolean,
  eindtijd_ontbreekt boolean,
  locatie_ontbreekt boolean,
  eindverantwoordelijke_ontbreekt boolean,
  lege_plekken int,
  lege_plekken_per_rol jsonb,
  aanwezigen int,
  min_aanwezigen int,
  alleen_groepen boolean
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;

  return query
  select a.id,
         a.naam,
         a.datum,
         a.status,
         a.starttijd is null,
         a.eindtijd is null,
         a.locatie is null,
         exists (select 1 from public.rol_slots s
                  where s.activiteit_id = a.id and s.rol_type = 'eindverantwoordelijke' and s.bezetter_id is null),
         (select count(*)::int from public.rol_slots s
           where s.activiteit_id = a.id and s.bezetter_id is null and s.rol_type <> 'bak'),
         coalesce((select jsonb_object_agg(r.rol_type, r.aantal)
                     from (select s.rol_type, count(*)::int as aantal
                             from public.rol_slots s
                            where s.activiteit_id = a.id and s.bezetter_id is null and s.rol_type <> 'bak'
                            group by s.rol_type) r), '{}'::jsonb),
         intern.aantal_aanwezigen(a.id),
         a.min_aanwezigen,
         exists (select 1 from public.activiteit_groep ag where ag.activiteit_id = a.id)
    from public.activiteiten a
   where a.eindigt_om > now() and a.status <> 'geannuleerd'
   order by a.begint_om, a.naam;
end
$$;

revoke all on function public.activiteit_opslaan(uuid, jsonb, jsonb, boolean),
  public.concept_verwijderen(uuid), public.beheeroverzicht() from public, anon;
grant execute on function public.activiteit_opslaan(uuid, jsonb, jsonb, boolean),
  public.concept_verwijderen(uuid), public.beheeroverzicht() to authenticated;
