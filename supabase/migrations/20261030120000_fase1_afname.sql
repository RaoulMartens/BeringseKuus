-- Fase 1, afname (review van fase 1 als geheel, 30-10-2026, en de review van deze migratie): drie dingen.
--
--  1. F1-02: een beheerder_sinds in de toekomst omzeilt de bevestiging door een andere beheerder (DM-25). Elke app die het
--     lid daarvóór instelt, telt als "van vóór", dus wie de inloglink heeft, is zonder bevestiging beheerder. Daarom
--     in drie lagen, zonder uitzondering voor seed of tests:
--       a. de database weigert het schrijven van een beheerder_sinds in de toekomst (trigger);
--       b. een toekomstwaarde die er al staat, wordt in deze migratie rechtgezet (data-stap, na het spoor);
--       c. is_beheerder() en beheerstatus() negeren een toekomstwaarde: dan telt zo'n lid nooit als beheerder, ook niet
--          als iemand met voldoende rechten de trigger omzeilt.
--  2. F1-07: wie beheer kreeg, kwijtraakte of bevestigd werd, laat een spoor na in wijzigingen_log. Zonder privévelden:
--     alleen het lid (id), wat er gebeurde en de oude en nieuwe waarde van beheerder_sinds.
--  3. F1-21: indexen op vreemde sleutels die er nog geen hadden (Performance Advisor, "Unindexed foreign keys"). Voor
--     "Mijn diensten" (fase 3) zoekt de app op rol_slots.bezetter_id en afmeldingen.lid_id.

-- ===== 1a. beheerder_sinds niet in de toekomst =====
-- Vijf seconden marge voor het verschil tussen de klokken van de aanroeper en de database. SECURITY DEFINER: de functie
-- roept intern.fout() aan, en die is niet voor service_role uit te voeren; zonder dit faalde elke wijziging van
-- is_admin met de sleutel van de taken-Worker of een beheerscript met "permission denied" (review M-02). Een
-- aanroeper kan zo niets méér dan voorheen: de trigger schrijft alleen de rij die hij toch al wijzigt.
create or replace function intern.beheerder_sinds_zetten() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_admin and new.beheerder_sinds is null then
      new.beheerder_sinds := clock_timestamp();
    end if;
  elsif new.is_admin and not old.is_admin then
    new.beheerder_sinds := clock_timestamp();
  elsif not new.is_admin and old.is_admin then
    new.beheerder_sinds := null;
  end if;

  if new.beheerder_sinds is not null and new.beheerder_sinds > clock_timestamp() + interval '5 seconds' then
    perform intern.fout('beheerder_sinds_toekomst');
  end if;
  return new;
end
$$;

-- Ook als alleen beheerder_sinds wordt gewijzigd (de bevestiging), niet alleen als is_admin wijzigt.
drop trigger beheerder_sinds_zetten on public.leden_prive;
create trigger beheerder_sinds_zetten before insert or update of is_admin, beheerder_sinds on public.leden_prive
  for each row execute function intern.beheerder_sinds_zetten();

-- ===== 2. Auditspoor voor beheerrechten =====
-- Geen e-mailadres en geen naam: het lid staat erin met zijn id. door_lid_id is wie de wijziging deed als er een sessie
-- was; in het dashboard of met de sleutel van een script is dat leeg. Dat is dus niet te onderscheiden van elkaar, en wie
-- het dashboard heeft, kan het spoor ook wissen (postgres): het spoor bewijst niets tegenover de beheerder van het project
-- (Beheerders.md, "Bekende grenzen"). SECURITY DEFINER om dezelfde reden als hierboven.
create function intern.beheer_gewijzigd_loggen() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actie text;
  v_tekst text;
begin
  if tg_op = 'DELETE' then
    if not old.is_admin then
      return old;
    end if;
    insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
    values (intern.huidig_lid(), 'beheer_verwijderd', 'leden_prive', old.lid_id, 'Een beheerder is verwijderd');
    return old;
  end if;

  if tg_op = 'INSERT' then
    if not new.is_admin then
      return new;
    end if;
    v_actie := 'beheer_aangezet';
    v_tekst := 'Beheer aangezet voor een nieuw lid';
  elsif new.is_admin and not old.is_admin then
    v_actie := 'beheer_aangezet';
    v_tekst := 'Beheer aangezet';
  elsif not new.is_admin and old.is_admin then
    v_actie := 'beheer_uitgezet';
    v_tekst := 'Beheer uitgezet';
  elsif new.is_admin and new.beheerder_sinds is distinct from old.beheerder_sinds then
    -- Ook terugzetten naar vroeger is een wijziging, en geen bevestiging in de gewone zin: daarom de waarden erbij.
    v_actie := 'beheerder_sinds_gewijzigd';
    v_tekst := format('beheerder_sinds van %s naar %s', old.beheerder_sinds, new.beheerder_sinds);
  else
    return new;
  end if;

  insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
  values (intern.huidig_lid(), v_actie, 'leden_prive', new.lid_id, v_tekst);
  return new;
end
$$;

create trigger beheer_gewijzigd_loggen after insert or update of is_admin, beheerder_sinds on public.leden_prive
  for each row execute function intern.beheer_gewijzigd_loggen();
create trigger beheer_verwijderd_loggen after delete on public.leden_prive
  for each row execute function intern.beheer_gewijzigd_loggen();

-- ===== 1b. Een toekomstwaarde die er al staat, rechtzetten =====
-- Online staat er één lid met een beheerder_sinds in 2099 (de snelle route voor de eerste kijkdag). De trigger toetst alleen
-- nieuwe schrijfacties, dus zonder deze stap bleef dat lid zonder bevestiging beheerder voor elke app die hij nog instelt.
-- Nu: beheerder_sinds wordt het moment van deze migratie. Een app die er al staat telt daarmee als "van vóór" (zoals de
-- bedoeling was); een app die daarna wordt ingesteld, moet worden bevestigd. De wijziging komt in het spoor.
update public.leden_prive
   set beheerder_sinds = clock_timestamp()
 where beheerder_sinds > clock_timestamp() + interval '5 seconds';

-- ===== 1c. De leeskant negeert een toekomstwaarde =====
-- Als iemand met voldoende rechten (postgres, een zelfgemaakte rol) de trigger omzeilt, telt zo'n lid nog niet als beheerder.
create or replace function intern.is_beheerder() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.leden_prive p
     where p.lid_id = intern.huidig_lid()
       and p.is_admin
       and p.beheerder_sinds is not null
       and p.beheerder_sinds <= now() + interval '5 seconds'
       and intern.code_recent()
       and exists (
         select 1 from auth.mfa_factors f
          where f.user_id = (select auth.uid()) and f.status = 'verified' and f.created_at < p.beheerder_sinds
       )
       and not exists (
         select 1 from auth.mfa_factors f
          where f.user_id = (select auth.uid()) and f.status = 'verified' and f.created_at >= p.beheerder_sinds
       )
  )
$$;

create or replace function public.beheerstatus() returns text
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_lid uuid := intern.huidig_lid();
  v_sinds timestamptz;
  v_admin boolean;
begin
  if v_lid is null then return 'geen_lid'; end if;
  select p.is_admin, p.beheerder_sinds into v_admin, v_sinds from public.leden_prive p where p.lid_id = v_lid;
  if not coalesce(v_admin, false) or v_sinds is null then return 'geen_beheerder'; end if;
  if not exists (
    select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified'
  ) then
    return 'mfa_instellen';
  end if;
  -- Een beheerder_sinds in de toekomst telt als nog niet bevestigd, net als een app van ná beheerder_sinds.
  if v_sinds > now() + interval '5 seconds' or exists (
    select 1 from auth.mfa_factors f
     where f.user_id = (select auth.uid()) and f.status = 'verified' and f.created_at >= v_sinds
  ) then
    return 'wacht_op_bevestiging';
  end if;
  if intern.code_recent() is not true then return 'code_nodig'; end if;
  return 'ok';
end
$$;

-- ===== 3. Indexen op vreemde sleutels =====
create index activiteit_groep_groep on public.activiteit_groep (groep_id);
create index activiteiten_bron on public.activiteiten (bron_activiteit_id);
create index activiteiten_vereniging on public.activiteiten (vereniging_id);
create index afmeldingen_lid on public.afmeldingen (lid_id);
create index leden_vereniging on public.leden (vereniging_id);
create index rol_slots_bezetter on public.rol_slots (bezetter_id);
create index rol_slots_rol_type on public.rol_slots (rol_type);
create index wijzigingen_log_door on public.wijzigingen_log (door_lid_id);
create index wijzigingen_log_vereniging on public.wijzigingen_log (vereniging_id);
