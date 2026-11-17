-- Berichten per mail (O-1, R18, BA-4): de database zet bij elke relevante wijziging van een gepubliceerde activiteit een
-- regel klaar in `berichten` (een postvak-uit, "outbox"). Een aparte taken-Worker verstuurt ze (taken/), minstens één keer per
-- minuut. Zo gaat een bericht alleen uit als de wijziging echt is doorgevoerd (dezelfde transactie), en kan een mislukte
-- mail later opnieuw zonder dat de beheerder iets merkt.
--
-- Wie krijgt bericht (BA-4, UC-005 AF-2, AF-4, AF-5):
--  - velden die raken wat een lid doet (datum, naam, tijden, bus, locatie, afmeld-deadline, minimaal aanwezigen): alle leden
--    die de activiteit zien en niet zijn afgemeld;
--  - een plek (ingedeeld, vervangen, eraf gehaald, plek weggehaald): het lid van die plek, en bij vervangen allebei;
--  - de doelgroep: wie de activiteit daardoor niet meer ziet;
--  - net gepubliceerd: de leden die een plek hebben;
--  - een gepubliceerde activiteit die wordt verwijderd: de leden die een plek hadden.
-- Nooit: een concept (R18), het type of het seizoen, een activiteit die al afgelopen is, en de wijziger zelf (die weet het).
-- Het notitieveld volgt later als keuze van de beheerder (BA-4); nu gaat er voor een notitie geen bericht uit.
-- Een bericht per wijziging per lid; de Worker voegt de berichten van één lid over één activiteit samen tot één mail.

create table public.berichten (
  id bigint generated always as identity primary key,
  vereniging_id uuid not null default 'b3a17e00-0000-4000-8000-000000000001' references public.verenigingen (id),
  aangemaakt timestamptz not null default clock_timestamp(),
  lid_id uuid not null references public.leden (id) on delete cascade,
  -- De activiteit kan verdwijnen (verwijderd); naam en datum staan daarom ook hier.
  activiteit_id uuid references public.activiteiten (id) on delete set null,
  activiteit_naam text not null,
  activiteit_datum date not null,
  -- Eén of meer regels, gescheiden door een regeleinde, in gewoon Nederlands: "Verzamelen: nu 19:00 (was 18:30)."
  tekst text not null check (tekst <> ''),
  status text not null default 'wacht' check (status in ('wacht', 'verstuurd', 'mislukt')),
  pogingen int not null default 0,
  verstuurd_op timestamptz,
  -- De reden van een mislukte poging, zonder adres of inhoud van de mail.
  fout text
);
create index berichten_wacht on public.berichten (id) where status = 'wacht';
create index berichten_lid on public.berichten (lid_id);
create index berichten_activiteit on public.berichten (activiteit_id);
create index berichten_vereniging on public.berichten (vereniging_id);
alter table public.berichten enable row level security;
-- Geen beleid en geen rechten voor anon of authenticated: alleen service_role (de taken-Worker) leest en schrijft.
revoke truncate on public.berichten from service_role;

-- Een datum als "vrijdag 22 januari", zoals in de mail.
create function intern.nl_datum(p_datum date) returns text
language sql immutable
set search_path = ''
as $$
  select (array['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'])[extract(isodow from p_datum)::int]
    || ' ' || extract(day from p_datum)::int || ' '
    || (array['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober',
              'november', 'december'])[extract(month from p_datum)::int]
$$;

-- Zet een bericht klaar voor één lid. Overgeslagen: de wijziger zelf, een lid dat niet meedoet (niet actief, geen lid, het
-- beheeraccount). Een externe helper heeft geen adres en krijgt dus nooit iets.
create function intern.zet_bericht_klaar(
  p_lid uuid, p_activiteit uuid, p_naam text, p_datum date, p_tekst text
) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_lid is null or p_lid is not distinct from intern.huidig_lid() then
    return;
  end if;
  insert into public.berichten (lid_id, activiteit_id, activiteit_naam, activiteit_datum, tekst)
  select l.id, p_activiteit, p_naam, p_datum, p_tekst
    from public.leden l
   where l.id = p_lid and l.actief and l.type = 'lid' and not l.alleen_beheer;
end
$$;
revoke all on function intern.zet_bericht_klaar(uuid, uuid, text, date, text) from public, anon, authenticated;

-- Iets bij een veld van een gepubliceerde activiteit; of een activiteit die net gepubliceerd is.
create function intern.bericht_na_activiteit() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_regels text[] := '{}';
  v_slot record;
  v_lid record;
  v_tekst text;
begin
  if new.status <> 'gepubliceerd' then
    return null;
  end if;

  -- Net gepubliceerd: wie een plek heeft, hoort het. De andere leden zien hem in het programma.
  if old.status = 'concept' then
    for v_slot in
      select s.bezetter_id, coalesce(t.naam, s.rol_type) as rol, s.rol_type
        from public.rol_slots s join public.roltypen t on t.code = s.rol_type
       where s.activiteit_id = new.id and s.bezetter_id is not null
    loop
      perform intern.zet_bericht_klaar(v_slot.bezetter_id, new.id, new.naam, new.datum,
        case when v_slot.rol_type = 'bak' then 'Je zit in de bak.'
             else 'Je staat ingedeeld als ' || lower(v_slot.rol) || '.' end);
    end loop;
    return null;
  end if;

  -- Een activiteit die al is afgelopen: een wijziging raakt niemand meer.
  if new.eindigt_om < clock_timestamp() then
    return null;
  end if;

  if new.naam is distinct from old.naam then
    v_regels := v_regels || ('Naam: nu ' || new.naam || ' (was ' || old.naam || ').');
  end if;
  if new.datum is distinct from old.datum then
    v_regels := v_regels || ('Datum: nu ' || intern.nl_datum(new.datum) || ' (was ' || intern.nl_datum(old.datum) || ').');
  end if;
  if new.verzameltijd is distinct from old.verzameltijd then
    v_regels := v_regels || ('Verzamelen: nu ' || coalesce(to_char(new.verzameltijd, 'HH24:MI'), 'niet ingevuld')
      || ' (was ' || coalesce(to_char(old.verzameltijd, 'HH24:MI'), 'niet ingevuld') || ').');
  end if;
  if new.starttijd is distinct from old.starttijd then
    v_regels := v_regels || ('Begint: nu ' || coalesce(to_char(new.starttijd, 'HH24:MI'), 'niet ingevuld')
      || ' (was ' || coalesce(to_char(old.starttijd, 'HH24:MI'), 'niet ingevuld') || ').');
  end if;
  if new.eindtijd is distinct from old.eindtijd then
    v_regels := v_regels || ('Is afgelopen: nu ' || coalesce(to_char(new.eindtijd, 'HH24:MI'), 'niet ingevuld')
      || ' (was ' || coalesce(to_char(old.eindtijd, 'HH24:MI'), 'niet ingevuld') || ').');
  end if;
  if new.locatie is distinct from old.locatie then
    v_regels := v_regels || ('Locatie: nu ' || coalesce(new.locatie, 'niet ingevuld')
      || ' (was ' || coalesce(old.locatie, 'niet ingevuld') || ').');
  end if;
  if new.bus_vertrektijd is distinct from old.bus_vertrektijd then
    v_regels := v_regels || ('Bus vertrekt: nu ' || coalesce(to_char(new.bus_vertrektijd, 'HH24:MI'), 'niet ingevuld')
      || ' (was ' || coalesce(to_char(old.bus_vertrektijd, 'HH24:MI'), 'niet ingevuld') || ').');
  end if;
  if new.bus_locatie is distinct from old.bus_locatie then
    v_regels := v_regels || ('Bus vertrekt vanaf: nu ' || coalesce(new.bus_locatie, 'niet ingevuld')
      || ' (was ' || coalesce(old.bus_locatie, 'niet ingevuld') || ').');
  end if;
  if new.afmeld_deadline is distinct from old.afmeld_deadline then
    v_regels := v_regels || ('Afmelden kan tot: nu '
      || coalesce(to_char(new.afmeld_deadline at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI'), 'geen deadline')
      || ' (was ' || coalesce(to_char(old.afmeld_deadline at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI'), 'geen deadline')
      || ').');
  end if;
  if new.min_aanwezigen is distinct from old.min_aanwezigen then
    v_regels := v_regels || ('Minimaal aanwezig: nu ' || coalesce(new.min_aanwezigen::text, 'niet ingevuld')
      || ' (was ' || coalesce(old.min_aanwezigen::text, 'niet ingevuld') || ').');
  end if;

  if cardinality(v_regels) = 0 then
    return null;
  end if;
  v_tekst := array_to_string(v_regels, E'\n');

  -- Alle leden die de activiteit zien en zich niet hebben afgemeld.
  for v_lid in
    select l.id
      from public.leden l
     where l.actief and l.type = 'lid' and not l.alleen_beheer
       and intern.lid_mag_zien(new.id, l.id)
       and not exists (select 1 from public.afmeldingen af where af.activiteit_id = new.id and af.lid_id = l.id)
  loop
    perform intern.zet_bericht_klaar(v_lid.id, new.id, new.naam, new.datum, v_tekst);
  end loop;
  return null;
end
$$;
revoke all on function intern.bericht_na_activiteit() from public, anon, authenticated;

create trigger bericht_na_activiteit
  after update on public.activiteiten
  for each row execute function intern.bericht_na_activiteit();

-- Een plek: ingedeeld, vervangen, eraf gehaald of weggehaald, bij een gepubliceerde activiteit die nog moet komen.
create function intern.bericht_na_plek() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_a public.activiteiten%rowtype;
  v_rol text;
  v_rol_type text;
  v_oud uuid;
  v_nieuw uuid;
begin
  -- Bij het verwijderen van een hele activiteit gaan de plekken mee: dat meldt bericht_voor_verwijderen.
  if coalesce(current_setting('bk.verwijderen', true), '') <> '' then
    return null;
  end if;

  v_oud := case when tg_op in ('UPDATE', 'DELETE') then old.bezetter_id end;
  v_nieuw := case when tg_op in ('INSERT', 'UPDATE') then new.bezetter_id end;
  v_rol_type := case when tg_op = 'DELETE' then old.rol_type else new.rol_type end;
  if v_oud is not distinct from v_nieuw then
    return null;
  end if;

  select * into v_a from public.activiteiten
   where id = case when tg_op = 'DELETE' then old.activiteit_id else new.activiteit_id end;
  if not found or v_a.status <> 'gepubliceerd' or v_a.eindigt_om < clock_timestamp() then
    return null;
  end if;

  select coalesce(t.naam, v_rol_type) into v_rol from public.roltypen t where t.code = v_rol_type;
  v_rol := lower(coalesce(v_rol, v_rol_type));

  if v_oud is not null then
    perform intern.zet_bericht_klaar(v_oud, v_a.id, v_a.naam, v_a.datum,
      case when v_rol_type = 'bak' then 'Je zit niet meer in de bak.'
           else 'Je staat niet meer ingedeeld als ' || v_rol || '.' end);
  end if;
  if v_nieuw is not null then
    perform intern.zet_bericht_klaar(v_nieuw, v_a.id, v_a.naam, v_a.datum,
      case when v_rol_type = 'bak' then 'Je zit in de bak.'
           else 'Je staat ingedeeld als ' || v_rol || '.' end);
  end if;
  return null;
end
$$;
revoke all on function intern.bericht_na_plek() from public, anon, authenticated;

create trigger bericht_na_plek
  after insert or delete or update of bezetter_id on public.rol_slots
  for each row execute function intern.bericht_na_plek();

-- De doelgroep: wie de activiteit door een wijziging niet meer ziet, krijgt bericht. Pas bij het einde van de transactie
-- (uitgesteld), zodat een groep die eruit gaat en er in dezelfde handeling weer in komt niemand bericht geeft.
create function intern.bericht_na_doelgroep() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_a public.activiteiten%rowtype;
  v_lid record;
begin
  select * into v_a from public.activiteiten where id = old.activiteit_id;
  if not found or v_a.status <> 'gepubliceerd' or v_a.eindigt_om < clock_timestamp() then
    return null;
  end if;
  for v_lid in
    select l.id
      from public.lid_groep lg join public.leden l on l.id = lg.lid_id
     where lg.groep_id = old.groep_id and l.actief and l.type = 'lid' and not l.alleen_beheer
       and not intern.lid_mag_zien(v_a.id, l.id)
  loop
    perform intern.zet_bericht_klaar(v_lid.id, v_a.id, v_a.naam, v_a.datum,
      'Deze activiteit is niet meer voor jou: hij staat niet meer in je programma.');
  end loop;
  return null;
end
$$;
revoke all on function intern.bericht_na_doelgroep() from public, anon, authenticated;

create constraint trigger bericht_na_doelgroep
  after delete on public.activiteit_groep
  deferrable initially deferred
  for each row execute function intern.bericht_na_doelgroep();

-- Een gepubliceerde activiteit die vervalt: de leden met een plek horen het. Voor het verwijderen, want daarna zijn de
-- plekken weg.
create function intern.bericht_voor_verwijderen() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_slot record;
begin
  if old.status <> 'gepubliceerd' or old.eindigt_om < clock_timestamp() then
    return old;
  end if;
  for v_slot in
    select distinct s.bezetter_id
      from public.rol_slots s
     where s.activiteit_id = old.id and s.bezetter_id is not null
  loop
    perform intern.zet_bericht_klaar(v_slot.bezetter_id, old.id, old.naam, old.datum,
      'Deze activiteit gaat niet door: hij is verwijderd uit het programma.');
  end loop;
  return old;
end
$$;
revoke all on function intern.bericht_voor_verwijderen() from public, anon, authenticated;

create trigger bericht_voor_verwijderen
  before delete on public.activiteiten
  for each row execute function intern.bericht_voor_verwijderen();
