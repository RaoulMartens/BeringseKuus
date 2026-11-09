-- Een externe helper mag ook BOB zijn (de opdrachtgever, 09-11-2026). Alleen de eindverantwoordelijke blijft een lid:
-- leden moeten hem kunnen bellen (R10, R21), en een externe helper heeft geen telefoonnummer in het systeem.
-- activiteit_opslaan is verder gelijk aan de versie uit 20261109120000.

create or replace function public.activiteit_opslaan(
  p_activiteit_id uuid default null,
  p_velden jsonb default '{}'::jsonb,
  p_wijzigingen jsonb default '[]'::jsonb,
  p_publiceren boolean default false,
  p_verwachte_versie int default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_toegestaan constant text[] := array['naam', 'datum', 'verzameltijd', 'starttijd', 'eindtijd', 'locatie',
    'bus_vertrektijd', 'bus_locatie', 'notitie', 'afmeld_deadline', 'min_aanwezigen', 'groepen'];
  v_lid uuid;
  v_nu timestamptz;
  v_nieuw boolean := p_activiteit_id is null;
  v_id uuid := p_activiteit_id;
  v_rij public.activiteiten%rowtype;
  v_status text := 'concept';
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
  v_groepen_oud uuid[] := '{}';
  v_groepen_gewijzigd boolean := false;
  v_doelgroep uuid[];
  v_groep_element jsonb;
  v_ontbreekt text[] := '{}';
  v_veranderd text[] := '{}';
  v_gewijzigd boolean := false;
  v_zichtbaar boolean := false;
  v_regel jsonb;
  v_regelnummer int;
  v_handeling text;
  v_rol text;
  v_helper text;
  v_voornaam text;
  v_achternaam text;
  v_tijdelijk text;
  v_tijdelijke text[] := '{}';
  v_plekken jsonb := '{}'::jsonb;
  v_slot public.rol_slots%rowtype;
  v_slot_id uuid;
  v_volgorde int;
  v_lid_id uuid;
  v_lid_rij public.leden%rowtype;
  v_verwacht uuid;
  v_toegewezen uuid[] := '{}';
  v_oude_naam text;
  v_ev public.rol_slots%rowtype;
  v_telefoon text;
  v_mist text[];
  v_buiten uuid[];
  v_dubbel uuid[];
  v_versie int;
begin
  -- Eerst wie belt, ook voor een onbekend id.
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  v_lid := intern.huidig_lid();

  if p_velden is null then p_velden := '{}'::jsonb; end if;
  if p_wijzigingen is null then p_wijzigingen := '[]'::jsonb; end if;
  p_publiceren := coalesce(p_publiceren, false);
  if jsonb_typeof(p_velden) <> 'object' then
    perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'velden'));
  end if;
  if jsonb_typeof(p_wijzigingen) <> 'array' then
    perform intern.fout('wijziging_ongeldig', jsonb_build_object('regel', null));
  end if;

  if v_nieuw then
    -- Een versie zonder id: het id is vermoedelijk kwijtgeraakt; dat mag niet stil een nieuwe activiteit worden.
    if p_verwachte_versie is not null then
      perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'verwachte_versie'));
    end if;
    v_nu := clock_timestamp();
    v_min := 13;
  else
    -- De lock op de activiteit, als eerste na de rechtencontrole (V8 4.1); daarna pas de klok.
    select * into v_rij from public.activiteiten where id = v_id for update;
    if not found then
      perform intern.fout('activiteit_onbekend');
    end if;
    v_nu := clock_timestamp();
    if p_verwachte_versie is null then
      perform intern.fout('veld_ontbreekt', jsonb_build_object('velden', jsonb_build_array('verwachte_versie')));
    end if;
    if p_verwachte_versie <> v_rij.versie then
      perform intern.fout('versie_verouderd', jsonb_build_object('versie', v_rij.versie));
    end if;
    -- Geannuleerd, of een gepubliceerde die al geweest is (R15, R16): niet meer te wijzigen. Een concept altijd wel.
    if v_rij.status = 'geannuleerd' then
      perform intern.fout('activiteit_niet_open', jsonb_build_object('reden', 'geannuleerd'));
    end if;
    if v_rij.status = 'gepubliceerd' and v_rij.eindigt_om <= v_nu then
      perform intern.fout('activiteit_niet_open', jsonb_build_object('reden', 'afgelopen'));
    end if;
    if p_publiceren and v_rij.status <> 'concept' then
      perform intern.fout('alleen_concept');
    end if;
    v_status := v_rij.status;
    v_naam := v_rij.naam; v_datum := v_rij.datum; v_verzameltijd := v_rij.verzameltijd;
    v_starttijd := v_rij.starttijd; v_eindtijd := v_rij.eindtijd; v_locatie := v_rij.locatie;
    v_bus_vertrektijd := v_rij.bus_vertrektijd; v_bus_locatie := v_rij.bus_locatie; v_notitie := v_rij.notitie;
    v_deadline := v_rij.afmeld_deadline; v_min := v_rij.min_aanwezigen;
    select coalesce(array_agg(groep_id order by groep_id), '{}') into v_groepen_oud
      from public.activiteit_groep where activiteit_id = v_id;
  end if;

  -- De velden: alleen de toegestane sleutels, elk van het goede soort.
  for v_sleutel in select jsonb_object_keys(p_velden) loop
    if v_sleutel <> all (v_toegestaan) then
      perform intern.fout('veld_ongeldig', jsonb_build_object('veld', v_sleutel));
    end if;
  end loop;
  if p_velden ? 'naam' then v_naam := intern.json_tekst(p_velden -> 'naam', 'naam', 200); end if;
  if p_velden ? 'datum' then v_datum := intern.json_datum(p_velden -> 'datum', 'datum'); end if;
  if p_velden ? 'verzameltijd' then
    v_verzameltijd := intern.json_tijd(p_velden -> 'verzameltijd', 'verzameltijd');
  end if;
  if p_velden ? 'starttijd' then v_starttijd := intern.json_tijd(p_velden -> 'starttijd', 'starttijd'); end if;
  if p_velden ? 'eindtijd' then v_eindtijd := intern.json_tijd(p_velden -> 'eindtijd', 'eindtijd'); end if;
  if p_velden ? 'locatie' then v_locatie := intern.json_tekst(p_velden -> 'locatie', 'locatie', 200); end if;
  if p_velden ? 'bus_vertrektijd' then
    v_bus_vertrektijd := intern.json_tijd(p_velden -> 'bus_vertrektijd', 'bus_vertrektijd');
  end if;
  if p_velden ? 'bus_locatie' then
    v_bus_locatie := intern.json_tekst(p_velden -> 'bus_locatie', 'bus_locatie', 200);
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
    select coalesce(array_agg(g order by g), '{}') into v_groepen from (select distinct g from unnest(v_groepen) g) d;
    if (select count(*) from public.groepen where id = any (v_groepen)) <> coalesce(cardinality(v_groepen), 0) then
      perform intern.fout('groep_onbekend');
    end if;
    v_groepen_gewijzigd := v_groepen is distinct from v_groepen_oud;
    v_doelgroep := v_groepen;
  else
    v_doelgroep := v_groepen_oud;
  end if;

  -- Naam en datum zijn altijd verplicht (besluit 2); starttijd, eindtijd en locatie ook zodra de activiteit gepubliceerd
  -- is. Een concept mag ze leeg hebben; om te publiceren eist de eindtoestand ze (hieronder).
  if v_naam is null then v_ontbreekt := array_append(v_ontbreekt, 'naam'); end if;
  if v_datum is null then v_ontbreekt := array_append(v_ontbreekt, 'datum'); end if;
  if v_status = 'gepubliceerd' then
    if v_starttijd is null then v_ontbreekt := array_append(v_ontbreekt, 'starttijd'); end if;
    if v_eindtijd is null then v_ontbreekt := array_append(v_ontbreekt, 'eindtijd'); end if;
    if v_locatie is null then v_ontbreekt := array_append(v_ontbreekt, 'locatie'); end if;
  end if;
  if cardinality(v_ontbreekt) > 0 then
    perform intern.fout('veld_ontbreekt', jsonb_build_object('velden', to_jsonb(v_ontbreekt)));
  end if;

  -- Schrijven: aanmaken, of de velden die echt veranderen (een gelijke waarde is geen wijziging).
  if v_nieuw then
    insert into public.activiteiten (naam, datum, verzameltijd, starttijd, eindtijd, locatie, bus_vertrektijd,
                                     bus_locatie, notitie, afmeld_deadline, min_aanwezigen)
    values (v_naam, v_datum, v_verzameltijd, v_starttijd, v_eindtijd, v_locatie, v_bus_vertrektijd, v_bus_locatie,
            v_notitie, v_deadline, v_min)
    returning id into v_id;
    -- Precies één lege plek eindverantwoordelijke (Bouwbesluiten 4.4), aan te wijzen met 'eindverantwoordelijke'.
    insert into public.rol_slots (activiteit_id, rol_type, volgorde) values (v_id, 'eindverantwoordelijke', 0)
    returning id into v_slot_id;
    v_plekken := jsonb_build_object('eindverantwoordelijke', v_slot_id);
    insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
    values (v_lid, 'activiteit_aangemaakt', 'activiteiten', v_id,
            format('%s (%s) aangemaakt als concept', v_naam, to_char(v_datum, 'DD-MM-YYYY')));
  else
    if v_naam is distinct from v_rij.naam then v_veranderd := array_append(v_veranderd, 'naam'); end if;
    if v_datum is distinct from v_rij.datum then v_veranderd := array_append(v_veranderd, 'datum'); end if;
    if v_verzameltijd is distinct from v_rij.verzameltijd then v_veranderd := array_append(v_veranderd, 'verzameltijd'); end if;
    if v_starttijd is distinct from v_rij.starttijd then v_veranderd := array_append(v_veranderd, 'starttijd'); end if;
    if v_eindtijd is distinct from v_rij.eindtijd then v_veranderd := array_append(v_veranderd, 'eindtijd'); end if;
    if v_locatie is distinct from v_rij.locatie then v_veranderd := array_append(v_veranderd, 'locatie'); end if;
    if v_bus_vertrektijd is distinct from v_rij.bus_vertrektijd then v_veranderd := array_append(v_veranderd, 'bus_vertrektijd'); end if;
    if v_bus_locatie is distinct from v_rij.bus_locatie then v_veranderd := array_append(v_veranderd, 'bus_locatie'); end if;
    if v_notitie is distinct from v_rij.notitie then v_veranderd := array_append(v_veranderd, 'notitie'); end if;
    if v_deadline is distinct from v_rij.afmeld_deadline then v_veranderd := array_append(v_veranderd, 'afmeld_deadline'); end if;
    if v_min is distinct from v_rij.min_aanwezigen then v_veranderd := array_append(v_veranderd, 'min_aanwezigen'); end if;
    if cardinality(v_veranderd) > 0 then
      update public.activiteiten
         set naam = v_naam, datum = v_datum, verzameltijd = v_verzameltijd, starttijd = v_starttijd,
             eindtijd = v_eindtijd, locatie = v_locatie, bus_vertrektijd = v_bus_vertrektijd,
             bus_locatie = v_bus_locatie, notitie = v_notitie, afmeld_deadline = v_deadline,
             min_aanwezigen = v_min
       where id = v_id;
      insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
      values (v_lid, 'activiteit_gewijzigd', 'activiteiten', v_id,
              format('%s (%s): %s gewijzigd', v_naam, to_char(v_datum, 'DD-MM-YYYY'), array_to_string(v_veranderd, ', ')));
      v_gewijzigd := true; v_zichtbaar := true;
    end if;
  end if;

  if v_groepen_gewijzigd then
    delete from public.activiteit_groep where activiteit_id = v_id;
    insert into public.activiteit_groep (activiteit_id, groep_id) select v_id, g from unnest(v_groepen) g;
    if not v_nieuw then
      insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
      values (v_lid, 'doelgroep_gewijzigd', 'activiteiten', v_id,
              format('%s (%s): doelgroep gewijzigd', v_naam, to_char(v_datum, 'DD-MM-YYYY')));
      v_gewijzigd := true; v_zichtbaar := true;
    end if;
  end if;

  -- De plekken, in de volgorde van de lijst. Elke regel heeft een handeling.
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
      -- 'eindverantwoordelijke' is gereserveerd voor de plek die bij het aanmaken al bestaat.
      if v_rol is null or v_tijdelijk is null or jsonb_typeof(v_regel -> 'tijdelijk_id') <> 'string'
         or v_tijdelijk = '' or v_tijdelijk = 'eindverantwoordelijke' or v_tijdelijk = any (v_tijdelijke)
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
      v_gewijzigd := true;

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
      if v_slot.rol_type = 'bak' then
        perform intern.fout('niet_ondersteund', jsonb_build_object('onderdeel', 'plek bak', 'regel', v_regelnummer));
      end if;
      -- Bezet op dit moment in de reeks: "eraf halen" is een leegmaken en daarna een weghalen in één aanroep.
      if v_slot.bezetter_id is not null then
        perform intern.fout('plek_niet_leeg', jsonb_build_object('regel', v_regelnummer));
      end if;
      delete from public.rol_slots where id = v_slot_id;
      insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
      values (v_lid, 'plek_weggehaald', 'rol_slots', v_slot_id,
              format('Plek %s weggehaald bij %s (%s)', v_slot.rol_type, v_naam, to_char(v_datum, 'DD-MM-YYYY')));
      v_gewijzigd := true;

    elsif v_handeling in ('toewijzen', 'leegmaken') then
      -- De plek: bij toewijzen ook een plek die eerder in deze lijst is toegevoegd (tijdelijk_id).
      if v_handeling = 'toewijzen' and v_regel ? 'tijdelijk_id' then
        if v_regel ? 'rol_slot_id' or jsonb_typeof(v_regel -> 'tijdelijk_id') <> 'string'
           or not (v_plekken ? (v_regel ->> 'tijdelijk_id')) then
          perform intern.fout('wijziging_ongeldig', jsonb_build_object('regel', v_regelnummer));
        end if;
        v_slot_id := (v_plekken ->> (v_regel ->> 'tijdelijk_id'))::uuid;
      else
        v_slot_id := intern.json_uuid(v_regel -> 'rol_slot_id', 'rol_slot_id', 'wijziging_ongeldig');
      end if;
      select * into v_slot from public.rol_slots where id = v_slot_id and activiteit_id = v_id;
      if not found then
        perform intern.fout('plek_onbekend', jsonb_build_object('regel', v_regelnummer));
      end if;
      if v_slot.rol_type = 'bak' then
        perform intern.fout('niet_ondersteund', jsonb_build_object('onderdeel', 'plek bak', 'regel', v_regelnummer));
      end if;

      -- Wie de beheerder op deze plek zag staan (UC-005 AF-8): verplicht, ook als het niemand was (null).
      if not (v_regel ? 'verwachte_bezetter') then
        perform intern.fout('wijziging_ongeldig', jsonb_build_object('regel', v_regelnummer));
      end if;
      if jsonb_typeof(v_regel -> 'verwachte_bezetter') = 'null' then
        v_verwacht := null;
      elsif jsonb_typeof(v_regel -> 'verwachte_bezetter') = 'string' then
        v_verwacht := intern.json_uuid(v_regel -> 'verwachte_bezetter', 'verwachte_bezetter', 'wijziging_ongeldig');
      else
        perform intern.fout('wijziging_ongeldig', jsonb_build_object('regel', v_regelnummer));
      end if;
      if v_handeling = 'leegmaken' and v_verwacht is null then
        perform intern.fout('wijziging_ongeldig', jsonb_build_object('regel', v_regelnummer));
      end if;
      if v_verwacht is distinct from v_slot.bezetter_id then
        perform intern.fout('slot_gewijzigd', jsonb_build_object('rol_slot_id', v_slot_id,
          'bezetter_id', v_slot.bezetter_id, 'regel', v_regelnummer));
      end if;

      if v_handeling = 'toewijzen' then
        if v_regel ? 'nieuwe_helper' then
          -- Iemand van buiten de vereniging, hier voor het eerst ingevoerd: alleen een naam (de opdrachtgever: "gewoon een
          -- naam"). Het eerste woord wordt de voornaam, de rest de achternaam (leeg mag bij een externe helper). Hij logt
          -- niet in, heeft geen e-mailadres of telefoon (geen rij in leden_prive) en hoort bij geen groep (R17, R22). Of hij
          -- op deze plek mag staan (geen eindverantwoordelijke), toetst de controle hieronder, zoals bij elke externe
          -- helper.
          if v_regel ? 'lid_id' or jsonb_typeof(v_regel -> 'nieuwe_helper') <> 'string' then
            perform intern.fout('wijziging_ongeldig', jsonb_build_object('regel', v_regelnummer));
          end if;
          v_helper := intern.json_tekst(to_jsonb(regexp_replace(v_regel ->> 'nieuwe_helper', '[[:space:]]+', ' ', 'g')),
                                        'helper_naam', 100);
          if v_helper is null then
            perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'helper_naam', 'regel', v_regelnummer));
          end if;
          v_voornaam := split_part(v_helper, ' ', 1);
          v_achternaam := btrim(substr(v_helper, char_length(v_voornaam) + 1));
          insert into public.leden (voornaam, achternaam, type) values (v_voornaam, v_achternaam, 'extern')
          returning id into v_lid_id;
          insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
          values (v_lid, 'helper_toegevoegd', 'leden', v_lid_id,
                  format('Externe helper toegevoegd bij %s (%s)', v_naam, to_char(v_datum, 'DD-MM-YYYY')));
        else
          v_lid_id := intern.json_uuid(v_regel -> 'lid_id', 'lid_id', 'wijziging_ongeldig');
        end if;
        select * into v_lid_rij from public.leden where id = v_lid_id;
        if not found or not v_lid_rij.actief then
          perform intern.fout('lid_inactief', jsonb_build_object('lid_id', v_lid_id, 'regel', v_regelnummer));
        end if;
        -- Een externe helper mag elke rol hebben behalve eindverantwoordelijke (R17, aangepast 09-11-2026: ook BOB).
        if v_lid_rij.type = 'extern' and v_slot.rol_type = 'eindverantwoordelijke' then
          perform intern.fout('extern_niet_toegestaan', jsonb_build_object('lid_id', v_lid_id, 'regel', v_regelnummer));
        end if;
        if exists (select 1 from public.afmeldingen where activiteit_id = v_id and lid_id = v_lid_id) then
          perform intern.fout('lid_afgemeld', jsonb_build_object('lid_id', v_lid_id, 'regel', v_regelnummer));
        end if;
        -- Wie er al zit, toewijzen is geen wijziging: geen versie, geen log, geen bijgewerkt.
        if v_slot.bezetter_id is distinct from v_lid_id then
          update public.rol_slots set bezetter_id = v_lid_id where id = v_slot_id;
          insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
          values (v_lid, 'plek_toegewezen', 'rol_slots', v_slot_id,
                  format('%s %s ingedeeld als %s bij %s (%s)', v_lid_rij.voornaam, v_lid_rij.achternaam, v_slot.rol_type,
                         v_naam, to_char(v_datum, 'DD-MM-YYYY')));
          v_toegewezen := v_toegewezen || v_lid_id;
          v_gewijzigd := true; v_zichtbaar := true;
        end if;
      else
        -- Bij een gepubliceerde activiteit kan de eindverantwoordelijke alleen rechtstreeks worden vervangen (R21).
        if v_slot.rol_type = 'eindverantwoordelijke' and v_status = 'gepubliceerd' then
          perform intern.fout('eindverantwoordelijke_verplicht', jsonb_build_object('reden', 'leeg', 'regel', v_regelnummer));
        end if;
        select voornaam || ' ' || achternaam into v_oude_naam from public.leden where id = v_slot.bezetter_id;
        update public.rol_slots set bezetter_id = null where id = v_slot_id;
        insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
        values (v_lid, 'plek_leeggemaakt', 'rol_slots', v_slot_id,
                format('%s van %s bij %s (%s) af', v_oude_naam, v_slot.rol_type, v_naam, to_char(v_datum, 'DD-MM-YYYY')));
        v_gewijzigd := true; v_zichtbaar := true;
      end if;
    else
      perform intern.fout('wijziging_ongeldig', jsonb_build_object('regel', v_regelnummer));
    end if;
  end loop;

  -- ===== De eindtoestand, na alle wijzigingen samen =====
  -- Doelgroep (R22): alleen interne leden horen erbij; externe helpers vallen erbuiten. doelgroep_conflict geldt als de
  -- groepen in deze aanroep veranderen, voor wie al was ingedeeld; lid_buiten_doelgroep voor wie nu is toegewezen. Een
  -- schending die er al was en niet in deze aanroep ontstaat, blokkeert niets.
  if cardinality(v_doelgroep) > 0 then
    if v_groepen_gewijzigd then
      select coalesce(array_agg(distinct s.bezetter_id), '{}') into v_buiten
        from public.rol_slots s join public.leden l on l.id = s.bezetter_id
       where s.activiteit_id = v_id and l.type = 'lid' and not (s.bezetter_id = any (v_toegewezen))
         and not exists (select 1 from public.lid_groep lg
                          where lg.lid_id = s.bezetter_id and lg.groep_id = any (v_doelgroep));
      if cardinality(v_buiten) > 0 then
        perform intern.fout('doelgroep_conflict', jsonb_build_object('lid_ids', to_jsonb(v_buiten)));
      end if;
    end if;
    select s.bezetter_id into v_lid_id
      from public.rol_slots s join public.leden l on l.id = s.bezetter_id
     where s.activiteit_id = v_id and l.type = 'lid' and s.bezetter_id = any (v_toegewezen)
       and not exists (select 1 from public.lid_groep lg where lg.lid_id = s.bezetter_id and lg.groep_id = any (v_doelgroep))
     limit 1;
    if v_lid_id is not null then
      perform intern.fout('lid_buiten_doelgroep', jsonb_build_object('lid_id', v_lid_id));
    end if;
  end if;

  -- Geen dubbelboeking (R6, R20). De constraint geen_dubbelboeking blijft het vangnet; hier is de nette melding.
  select coalesce(array_agg(d.bezetter_id), '{}') into v_dubbel
    from (select bezetter_id from public.rol_slots
           where activiteit_id = v_id and bezetter_id is not null
           group by bezetter_id having count(*) > 1) d;
  if cardinality(v_dubbel) > 0 then
    perform intern.fout('dubbelboeking', jsonb_build_object('lid_ids', to_jsonb(v_dubbel)));
  end if;

  -- Publiceren, en een gepubliceerde activiteit bewaken (R21).
  if p_publiceren or v_status = 'gepubliceerd' then
    select * into v_ev from public.rol_slots where activiteit_id = v_id and rol_type = 'eindverantwoordelijke';
    if v_ev.bezetter_id is not null then
      select nullif(btrim(p.telefoon), '') into v_telefoon from public.leden_prive p where p.lid_id = v_ev.bezetter_id;
    end if;
    if p_publiceren then
      v_mist := '{}';
      if v_starttijd is null then v_mist := array_append(v_mist, 'starttijd'); end if;
      if v_eindtijd is null then v_mist := array_append(v_mist, 'eindtijd'); end if;
      if v_locatie is null then v_mist := array_append(v_mist, 'locatie'); end if;
      if v_ev.bezetter_id is null then
        v_mist := array_append(v_mist, 'eindverantwoordelijke');
      elsif v_telefoon is null then
        v_mist := array_append(v_mist, 'telefoon_eindverantwoordelijke');
      end if;
      if cardinality(v_mist) > 0 then
        perform intern.fout('publiceren_niet_mogelijk', jsonb_build_object('ontbreekt', to_jsonb(v_mist)));
      end if;
    else
      if v_ev.bezetter_id is null then
        perform intern.fout('eindverantwoordelijke_verplicht', jsonb_build_object('reden', 'leeg'));
      elsif v_telefoon is null then
        perform intern.fout('eindverantwoordelijke_verplicht', jsonb_build_object('reden', 'telefoon'));
      end if;
    end if;
    -- Een gepubliceerde activiteit mag na de opslag niet al geweest zijn: ook niet een afgelopen concept publiceren,
    -- en een gepubliceerde niet naar het verleden verplaatsen.
    if intern.activiteit_einde(v_datum, v_starttijd, v_eindtijd) <= v_nu then
      perform intern.fout('activiteit_niet_open', jsonb_build_object('reden', 'afgelopen'));
    end if;
  end if;

  if p_publiceren then
    update public.activiteiten set status = 'gepubliceerd' where id = v_id;
    insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
    values (v_lid, 'activiteit_gepubliceerd', 'activiteiten', v_id,
            format('%s (%s) gepubliceerd', v_naam, to_char(v_datum, 'DD-MM-YYYY')));
    v_gewijzigd := true; v_zichtbaar := true;
  end if;

  -- De versie: één keer per aanroep die iets wijzigt (bij aanmaken blijft hij 1). bijgewerkt alleen als leden iets zien.
  if v_gewijzigd and not v_nieuw then
    if v_zichtbaar then
      perform set_config('bk.zichtbaar', v_id::text, true);
    end if;
    update public.activiteiten set versie = versie + 1 where id = v_id;
    perform set_config('bk.zichtbaar', '', true);
  end if;

  select versie into v_versie from public.activiteiten where id = v_id;
  return jsonb_build_object('activiteit_id', v_id, 'versie', v_versie, 'plekken', v_plekken);
end
$$;
