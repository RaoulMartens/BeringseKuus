-- Fase 1, afname (review van fase 1 als geheel, 30-10-2026): drie dingen die de review vond.
--
--  1. F1-02: een beheerder_sinds in de toekomst omzeilt de bevestiging door een andere beheerder (DM-25). Elke app die het
--     lid daarvóór instelt, telt als "van vóór", dus wie de inloglink heeft, is zonder bevestiging beheerder. Een
--     trigger weigert dat nu. De seed en de tests hebben die waarde nodig (een app die nu wordt ingesteld moet "van
--     vóór" zijn); zij zetten daarvoor bewust de instelling app.beheerder_toekomst_toegestaan. Een echte database zet
--     die nooit.
--  2. F1-07: wie beheer kreeg, kwijtraakte of bevestigd werd, laat een spoor na in wijzigingen_log. Zonder privévelden:
--     alleen het lid (id) en wat er gebeurde.
--  3. F1-21: indexen op vreemde sleutels die er nog geen hadden (Performance Advisor, "Unindexed foreign keys"). Voor
--     "Mijn diensten" (fase 3) zoekt de app op rol_slots.bezetter_id en afmeldingen.lid_id.

-- ===== 1. beheerder_sinds niet in de toekomst =====
-- Een marge van een minuut voor het verschil tussen de klokken van de aanroeper en de database; ver genoeg onder wat
-- een mens in de toekomst zet. Dezelfde foutcode als de andere bedoelde fouten (DM-13).
create or replace function intern.beheerder_sinds_zetten() returns trigger
language plpgsql
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

  if new.beheerder_sinds is not null
     and new.beheerder_sinds > clock_timestamp() + interval '1 minute'
     and coalesce(current_setting('app.beheerder_toekomst_toegestaan', true), '') <> 'ja' then
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
-- Geen e-mailadres en geen naam: het lid staat erin met zijn id, en wie de wijziging deed (als er een sessie was; in het
-- dashboard of de seed is dat leeg). Een bevestiging (beheerder_sinds opnieuw gezet) is het gevoeligste moment van het
-- hele beheerverhaal: daar moet later te zien zijn wanneer het gebeurde.
create function intern.beheer_gewijzigd_loggen() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actie text;
  v_tekst text;
begin
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
    v_actie := 'beheer_bevestigd';
    v_tekst := 'beheerder_sinds opnieuw gezet (bevestiging)';
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
