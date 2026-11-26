-- Leden beheren in de app (UC-013, 26-11-2026).
--
-- Tot nu toe zette de bouwer telefoon, groepen en aanmerkingen met een script (leden:zet) en een lid dat stopte met SQL (Pilotleden.md). Het
-- bestuur doet dat nu zelf. Dit bestand voegt vijf functies toe, met dezelfde opzet als beheerders beheren (20261110150000): alleen een
-- beheerder met een recente code (intern.is_beheerder()), foutcodes via intern.fout(), en de regels in de database, niet in de app.
--
--   leden_beheer_lijst()                        alle leden met groepen, of ze al zijn ingelogd en sinds wanneer ze inactief zijn
--   lid_beheer_lezen(lid)                       één lid met telefoon, groepen, aanmerkingen en komende diensten
--   lid_opslaan(lid, telefoon, groepen, bob, ev) telefoon, groepen en aanmerkingen in één transactie (alles of niets)
--   lid_inactief_zetten(lid)                    het lid is geen lid meer: de plekken vallen leeg (R30)
--   lid_actief_zetten(lid)                      weer actief (R31): de plekken van eerder komen niet terug
--
-- Wat hier niet in zit: een nieuw lid toevoegen en een uitnodiging opnieuw sturen. Die maken een inlogaccount aan en dat mag niet vanuit de
-- app (de geheime sleutel hoort alleen bij de taken-Worker, Bouwbesluiten); dat komt in een tweede stap.
--
-- Gelijktijdigheid (Datamodel-fase-3.md, O-4a): eerst de locks op de activiteiten waar het lid een plek heeft, in vaste volgorde op id, en
-- daarna pas het lid zelf. Zo kan een ruil of een indeling op zo'n activiteit niet tussen het leegmaken van de plekken en het inactief
-- zetten door. Alle ledenbeheer gaat achter één advisory lock, zodat twee beheerders niet door elkaar schrijven.

-- ===== de lijst =====
-- Alleen echte leden: een externe helper heeft geen account en een beheeraccount (alleen_beheer) telt nergens als lid mee.
-- ooit_ingelogd en account_sinds komen uit het inlogaccount; inactief_sinds uit het spoor (leeg als het lid al inactief was voor dit scherm).
create function public.leden_beheer_lijst() returns table (
  lid_id uuid,
  voornaam text,
  achternaam text,
  actief boolean,
  groepen text[],
  is_beheerder boolean,
  ooit_ingelogd boolean,
  account_sinds timestamptz,
  inactief_sinds timestamptz
)
language plpgsql security definer
set search_path = ''
as $$
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;

  return query
  select l.id,
         l.voornaam,
         l.achternaam,
         l.actief,
         coalesce((select array_agg(g.naam order by g.volgorde)
                     from public.lid_groep lg join public.groepen g on g.id = lg.groep_id
                    where lg.lid_id = l.id), '{}'::text[]),
         coalesce(p.is_admin, false),
         coalesce(u.last_sign_in_at is not null, false),
         u.created_at,
         case when l.actief then null else (
           select max(w.moment) from public.wijzigingen_log w where w.rij_id = l.id and w.actie = 'lid_inactief_gezet'
         ) end
    from public.leden l
    join public.leden_prive p on p.lid_id = l.id
    left join auth.users u on u.id = l.auth_user_id
   where l.type = 'lid' and not l.alleen_beheer
   order by l.voornaam, l.achternaam;
end
$$;

-- ===== één lid =====
-- gekozen = de groepen van dit lid; aantal = actieve leden in die groep. diensten = de komende plekken (concept of gepubliceerd).
create function public.lid_beheer_lezen(p_lid_id uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_lid public.leden%rowtype;
  v_prive public.leden_prive%rowtype;
  v_ingelogd timestamptz;
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;

  select * into v_lid from public.leden where id = p_lid_id and type = 'lid' and not alleen_beheer;
  if not found then
    perform intern.fout('lid_onbekend');
  end if;
  select * into v_prive from public.leden_prive where lid_id = v_lid.id;
  select u.last_sign_in_at into v_ingelogd from auth.users u where u.id = v_lid.auth_user_id;

  return jsonb_build_object(
    'lid', jsonb_build_object(
      'id', v_lid.id,
      'voornaam', v_lid.voornaam,
      'achternaam', v_lid.achternaam,
      'actief', v_lid.actief,
      'email', v_prive.email,
      'telefoon', v_prive.telefoon,
      'mag_bob', v_prive.mag_bob,
      'mag_eindverantw', v_prive.mag_eindverantw,
      'is_beheerder', v_prive.is_admin,
      'is_ik', v_lid.id = intern.huidig_lid(),
      'laatst_ingelogd', v_ingelogd
    ),
    'groepen', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id,
               'naam', g.naam,
               'aantal', (select count(*) from public.lid_groep x
                            join public.leden m on m.id = x.lid_id
                           where x.groep_id = g.id and m.actief and m.type = 'lid' and not m.alleen_beheer),
               'gekozen', exists (select 1 from public.lid_groep lg where lg.groep_id = g.id and lg.lid_id = v_lid.id)
             ) order by g.volgorde)
        from public.groepen g
    ), '[]'::jsonb),
    'diensten', coalesce((
      select jsonb_agg(jsonb_build_object(
               'activiteit_id', a.id,
               'naam', a.naam,
               'datum', a.datum,
               'rol', s.rol_type,
               'status', a.status
             ) order by a.datum, a.id)
        from public.rol_slots s
        join public.activiteiten a on a.id = s.activiteit_id
       where s.bezetter_id = v_lid.id
         and a.datum >= intern.vandaag(clock_timestamp())
         and a.status in ('concept', 'gepubliceerd')
    ), '[]'::jsonb)
  );
end
$$;

-- ===== opslaan =====
-- Alles in één transactie. p_telefoon leeg = niet wijzigen (wissen kan niet: een eindverantwoordelijke zonder nummer houdt zijn
-- activiteit tegen, R21). p_groepen is de volledige lijst; er moet er minstens één zijn (een lid zonder groep ziet niets).
-- Haalt de wijziging het lid uit de doelgroep van een activiteit waar het een plek heeft, dan gebeurt er niets (dienst_blokkeert, met de
-- activiteiten): eerst de plek anders invullen, daarna de groep wijzigen. Dezelfde regel als leden:zet.
create function public.lid_opslaan(
  p_lid_id uuid,
  p_telefoon text,
  p_groepen uuid[],
  p_mag_bob boolean,
  p_mag_eindverantw boolean
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_lid public.leden%rowtype;
  v_nummer text := regexp_replace(btrim(coalesce(p_telefoon, '')), '\s+', ' ', 'g');
  v_cijfers int := length(regexp_replace(v_nummer, '\D', '', 'g'));
  v_groepen uuid[];
  v_blokkade jsonb;
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  perform pg_advisory_xact_lock(hashtext('leden'));
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;

  if v_nummer <> '' and (length(v_nummer) > 20 or v_nummer !~ '^[0+][0-9 -]*$' or v_cijfers < 9 or v_cijfers > 15) then
    perform intern.fout('telefoon_ongeldig');
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_groepen from unnest(coalesce(p_groepen, '{}')) as x;
  if cardinality(v_groepen) = 0 then
    perform intern.fout('groep_nodig');
  end if;
  if exists (select 1 from unnest(v_groepen) as x where not exists (select 1 from public.groepen g where g.id = x)) then
    perform intern.fout('groep_onbekend');
  end if;

  -- O-4a: eerst de activiteiten waar het lid een plek heeft, in vaste volgorde, daarna het lid.
  perform 1
    from public.activiteiten a
   where a.datum >= intern.vandaag(clock_timestamp()) and a.status in ('concept', 'gepubliceerd')
     and exists (select 1 from public.rol_slots s where s.activiteit_id = a.id and s.bezetter_id = p_lid_id)
   order by a.id
     for update;
  select * into v_lid from public.leden where id = p_lid_id and type = 'lid' and not alleen_beheer for update;
  if not found then
    perform intern.fout('lid_onbekend');
  end if;
  perform 1 from public.leden_prive where lid_id = v_lid.id for update;

  -- Zou het lid na de wijziging een activiteit niet meer mogen zien waar het een plek heeft?
  select jsonb_agg(jsonb_build_object('id', a.id, 'naam', a.naam, 'datum', a.datum) order by a.datum, a.id) into v_blokkade
    from public.activiteiten a
   where a.datum >= intern.vandaag(clock_timestamp()) and a.status in ('concept', 'gepubliceerd')
     and exists (select 1 from public.rol_slots s where s.activiteit_id = a.id and s.bezetter_id = v_lid.id)
     and exists (select 1 from public.activiteit_groep ag where ag.activiteit_id = a.id)
     and not exists (select 1 from public.activiteit_groep ag where ag.activiteit_id = a.id and ag.groep_id = any (v_groepen));
  if v_blokkade is not null then
    perform intern.fout('dienst_blokkeert', jsonb_build_object('activiteiten', v_blokkade));
  end if;

  delete from public.lid_groep where lid_id = v_lid.id and not (groep_id = any (v_groepen));
  insert into public.lid_groep (lid_id, groep_id)
  select v_lid.id, x from unnest(v_groepen) as x
  on conflict do nothing;

  update public.leden_prive
     set telefoon = case when v_nummer = '' then telefoon else v_nummer end,
         mag_bob = coalesce(p_mag_bob, mag_bob),
         mag_eindverantw = coalesce(p_mag_eindverantw, mag_eindverantw)
   where lid_id = v_lid.id;

  insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
  values (intern.huidig_lid(), 'lid_gewijzigd', 'leden', v_lid.id, 'Telefoon, groepen of aanmerkingen van een lid gewijzigd');

  return jsonb_build_object('voornaam', v_lid.voornaam, 'achternaam', v_lid.achternaam);
end
$$;

-- ===== op inactief zetten =====
-- R30: alle komende plekken van het lid (concept en gepubliceerd) worden leeg; afmeldingen en eerdere diensten blijven staan. R31: het lid
-- is daarna geen lid meer (intern.huidig_lid() geeft niets), dus geen indeling, bericht of keuzelijst; de sessies gaan weg, zodat een
-- openstaande sessie meteen stopt. Is het lid eindverantwoordelijke van een gepubliceerde activiteit, dan mag dat (R32): de plek valt open en
-- de activiteit komt onder "Vraagt aandacht". Een beheerder of jijzelf kan niet inactief: eerst de rechten intrekken (R33).
create function public.lid_inactief_zetten(p_lid_id uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_lid public.leden%rowtype;
  v_admin boolean;
  v_ids uuid[];
  v_id uuid;
  v_open int;
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  perform pg_advisory_xact_lock(hashtext('leden'));
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  if p_lid_id = intern.huidig_lid() then
    perform intern.fout('zelf');
  end if;

  perform 1
    from public.activiteiten a
   where a.datum >= intern.vandaag(clock_timestamp()) and a.status in ('concept', 'gepubliceerd')
     and exists (select 1 from public.rol_slots s where s.activiteit_id = a.id and s.bezetter_id = p_lid_id)
   order by a.id
     for update;
  select * into v_lid from public.leden where id = p_lid_id and type = 'lid' and not alleen_beheer for update;
  if not found then
    perform intern.fout('lid_onbekend');
  end if;
  if not v_lid.actief then
    perform intern.fout('al_inactief');
  end if;
  select p.is_admin into v_admin from public.leden_prive p where p.lid_id = v_lid.id for update;
  if coalesce(v_admin, false) then
    perform intern.fout('is_beheerder');
  end if;

  select coalesce(array_agg(a.id order by a.id), '{}') into v_ids
    from public.activiteiten a
   where a.datum >= intern.vandaag(clock_timestamp()) and a.status in ('concept', 'gepubliceerd')
     and exists (select 1 from public.rol_slots s where s.activiteit_id = a.id and s.bezetter_id = v_lid.id);

  -- Eerst inactief: de berichten (die er nu nog niet uitgaan) en de keuzelijsten zien het lid dan al niet meer.
  update public.leden set actief = false where id = v_lid.id;
  update public.rol_slots set bezetter_id = null where bezetter_id = v_lid.id and activiteit_id = any (v_ids);
  get diagnostics v_open = row_count;

  -- Een ander die dit scherm open heeft staan, krijgt slot_gewijzigd: de activiteit is gewijzigd.
  foreach v_id in array v_ids loop
    perform set_config('bk.zichtbaar', v_id::text, true);
    update public.activiteiten set versie = versie + 1 where id = v_id;
  end loop;
  perform set_config('bk.zichtbaar', '', true);

  if v_lid.auth_user_id is not null then
    delete from auth.sessions where user_id = v_lid.auth_user_id;
  end if;

  insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
  values (intern.huidig_lid(), 'lid_inactief_gezet', 'leden', v_lid.id, format('Lid op inactief gezet; %s plekken leeg', v_open));

  return jsonb_build_object('voornaam', v_lid.voornaam, 'achternaam', v_lid.achternaam, 'plekken_open', v_open);
end
$$;

-- ===== weer actief =====
create function public.lid_actief_zetten(p_lid_id uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_lid public.leden%rowtype;
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  perform pg_advisory_xact_lock(hashtext('leden'));
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;

  select * into v_lid from public.leden where id = p_lid_id and type = 'lid' and not alleen_beheer for update;
  if not found then
    perform intern.fout('lid_onbekend');
  end if;
  if v_lid.actief then
    perform intern.fout('al_actief');
  end if;

  update public.leden set actief = true where id = v_lid.id;

  insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
  values (intern.huidig_lid(), 'lid_actief_gezet', 'leden', v_lid.id, 'Lid weer actief gezet');

  return jsonb_build_object('voornaam', v_lid.voornaam, 'achternaam', v_lid.achternaam);
end
$$;

revoke all on function public.leden_beheer_lijst() from public, anon;
revoke all on function public.lid_beheer_lezen(uuid) from public, anon;
revoke all on function public.lid_opslaan(uuid, text, uuid[], boolean, boolean) from public, anon;
revoke all on function public.lid_inactief_zetten(uuid) from public, anon;
revoke all on function public.lid_actief_zetten(uuid) from public, anon;
grant execute on function public.leden_beheer_lijst() to authenticated;
grant execute on function public.lid_beheer_lezen(uuid) to authenticated;
grant execute on function public.lid_opslaan(uuid, text, uuid[], boolean, boolean) to authenticated;
grant execute on function public.lid_inactief_zetten(uuid) to authenticated;
grant execute on function public.lid_actief_zetten(uuid) to authenticated;
