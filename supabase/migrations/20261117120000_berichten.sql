-- Berichten per mail (O-1, R18, BA-4): de database zet bij elke relevante wijziging van een gepubliceerde activiteit een
-- regel klaar in `berichten` (een postvak-uit, "outbox"). Een aparte taken-Worker verstuurt ze (taken/), elke minuut. Zo gaat
-- een bericht alleen uit als de wijziging echt is doorgevoerd (dezelfde transactie), en kan een mislukte mail later opnieuw
-- zonder dat de beheerder iets merkt.
--
-- Wie krijgt bericht (BA-4, UC-005 AF-2, AF-4, AF-5):
--  - velden die raken wat een lid doet (datum, naam, tijden, bus, locatie, afmeld-deadline, minimaal aanwezigen): alle leden
--    die de activiteit zien en niet zijn afgemeld;
--  - een plek (ingedeeld, vervangen, eraf gehaald, plek weggehaald): het lid van die plek, en bij vervangen allebei;
--  - de doelgroep: wie de activiteit daardoor niet meer ziet;
--  - net gepubliceerd: de leden die een plek hebben;
--  - een gepubliceerde activiteit die wordt verwijderd: de leden die een plek hadden.
-- Nooit: een concept (R18), het type of het seizoen, een activiteit die al afgelopen is, een activiteit die in dezelfde
-- transactie is aangemaakt, en de wijziger zelf (die weet het). Het notitieveld volgt later als keuze van de beheerder
-- (BA-4); nu gaat er voor een notitie geen bericht uit.
--
-- Hoe de velden en de doelgroep samengaan (review Codex B-01 tot B-03): de eerste keer dat een transactie een activiteit
-- of zijn doelgroep aanraakt, bewaren we de beginsituatie (`berichten_voor`: de rij en de groepen). Pas aan het einde van de
-- transactie (uitgestelde trigger) vergelijken we met de eindsituatie. Zo hangt het bericht niet af van de volgorde waarin
-- `activiteit_opslaan` velden en groepen schrijft, en weet de database ook wie de activiteit voorheen zag (ook als
-- "iedereen" nul groepen betekent).

create table public.berichten (
  id bigint generated always as identity primary key,
  vereniging_id uuid not null default 'b3a17e00-0000-4000-8000-000000000001' references public.verenigingen (id),
  aangemaakt timestamptz not null default clock_timestamp(),
  lid_id uuid not null references public.leden (id) on delete cascade,
  -- De activiteit kan verdwijnen (verwijderd); naam en datum staan daarom ook hier.
  activiteit_id uuid references public.activiteiten (id) on delete set null,
  activiteit_naam text not null,
  activiteit_datum date not null,
  -- Eén of meer regels, gescheiden door een regeleinde, in gewoon Nederlands: "Begint: nu 19:30 (was 20:00)."
  tekst text not null check (tekst <> ''),
  -- overgeslagen: bij het versturen bleek het lid of de activiteit niet meer te kloppen (de Worker toetst opnieuw).
  status text not null default 'wacht' check (status in ('wacht', 'verstuurd', 'mislukt', 'overgeslagen')),
  -- Het aantal keren dat een Worker dit bericht heeft opgepakt. Het telt vóór het versturen, zodat een run die halverwege
  -- stopt het bericht niet eindeloos opnieuw kan proberen.
  pogingen int not null default 0,
  -- Zolang dit in de toekomst ligt, heeft een Worker het bericht opgepakt en laat een andere run het met rust.
  claim_tot timestamptz,
  verstuurd_op timestamptz,
  -- De reden van een mislukte of overgeslagen poging, zonder adres of inhoud van de mail.
  fout text
);
create index berichten_wacht on public.berichten (id) where status = 'wacht';
create index berichten_lid on public.berichten (lid_id);
create index berichten_activiteit on public.berichten (activiteit_id);
create index berichten_vereniging on public.berichten (vereniging_id);
alter table public.berichten enable row level security;
-- Geen beleid en geen rechten voor anon of authenticated: alleen service_role (de taken-Worker) leest en schrijft.
revoke truncate on public.berichten from service_role;

-- De beginsituatie van een activiteit in de lopende transactie, tot de uitgestelde trigger hem verwerkt (en wist). Geen
-- verwijzing naar `activiteiten`: de activiteit kan in de transactie worden verwijderd.
create table public.berichten_voor (
  vereniging_id uuid not null default 'b3a17e00-0000-4000-8000-000000000001' references public.verenigingen (id),
  txid bigint not null,
  activiteit_id uuid not null,
  -- De activiteit is in deze transactie aangemaakt: er gaat niets over uit.
  nieuw boolean not null,
  voor jsonb,
  groepen uuid[],
  primary key (txid, activiteit_id)
);
create index berichten_voor_vereniging on public.berichten_voor (vereniging_id);
alter table public.berichten_voor enable row level security;
revoke truncate on public.berichten_voor from service_role;

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

-- "Label: nu X (was Y)." als er iets veranderd is, anders niets.
create function intern.verandering(p_label text, p_nu text, p_was text, p_leeg text default 'niet ingevuld') returns text
language sql immutable
set search_path = ''
as $$
  select case when p_nu is distinct from p_was
    then p_label || ': nu ' || coalesce(p_nu, p_leeg) || ' (was ' || coalesce(p_was, p_leeg) || ').' end
$$;

-- ===== De beginsituatie vastleggen =====

create function intern.neem_momentopname(p_activiteit uuid, p_nieuw boolean) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.berichten_voor (txid, activiteit_id, nieuw, voor, groepen)
  select txid_current(), a.id, p_nieuw,
         case when p_nieuw then null else to_jsonb(a) end,
         case when p_nieuw then null
              else coalesce((select array_agg(ag.groep_id) from public.activiteit_groep ag where ag.activiteit_id = a.id), '{}') end
    from public.activiteiten a
   where a.id = p_activiteit
  on conflict do nothing;
end
$$;
revoke all on function intern.neem_momentopname(uuid, boolean) from public, anon, authenticated;

create function intern.momentopname_activiteit() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform intern.neem_momentopname(new.id, true);
    return new;
  end if;
  perform intern.neem_momentopname(old.id, false);
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
revoke all on function intern.momentopname_activiteit() from public, anon, authenticated;

create trigger momentopname_na_insert after insert on public.activiteiten
  for each row execute function intern.momentopname_activiteit();
create trigger momentopname_voor_update before update or delete on public.activiteiten
  for each row execute function intern.momentopname_activiteit();

create function intern.momentopname_doelgroep() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform intern.neem_momentopname(case when tg_op = 'DELETE' then old.activiteit_id else new.activiteit_id end, false);
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
revoke all on function intern.momentopname_doelgroep() from public, anon, authenticated;

create trigger momentopname_voor_doelgroep before insert or delete on public.activiteit_groep
  for each row execute function intern.momentopname_doelgroep();

-- ===== Aan het einde van de transactie: vergelijken en berichten klaarzetten =====

create function intern.verwerk_momentopnamen() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  s record;
  a public.activiteiten%rowtype;
  v jsonb;
  v_regels text[];
  v_tekst text;
  v_slot record;
  v_lid record;
begin
  for s in select * from public.berichten_voor where txid = txid_current() loop
    select * into a from public.activiteiten where id = s.activiteit_id;
    -- Nieuw in deze transactie, verdwenen, of (nog) niet gepubliceerd of al afgelopen: geen bericht.
    continue when s.nieuw or not found or a.status <> 'gepubliceerd' or a.eindigt_om < clock_timestamp();
    v := s.voor;

    -- Net gepubliceerd: wie een plek heeft, hoort het. De andere leden zien hem in het programma.
    if v ->> 'status' = 'concept' then
      for v_slot in
        select s2.bezetter_id, coalesce(t.naam, s2.rol_type) as rol, s2.rol_type
          from public.rol_slots s2 join public.roltypen t on t.code = s2.rol_type
         where s2.activiteit_id = a.id and s2.bezetter_id is not null
      loop
        perform intern.zet_bericht_klaar(v_slot.bezetter_id, a.id, a.naam, a.datum,
          case when v_slot.rol_type = 'bak' then 'Je zit in de bak.'
               else 'Je staat ingedeeld als ' || lower(v_slot.rol) || '.' end);
      end loop;
      continue;
    end if;
    continue when v ->> 'status' <> 'gepubliceerd';

    -- Velden: één regel per verandering, naar iedereen die de activiteit nu ziet en niet is afgemeld.
    v_regels := array_remove(array[
      intern.verandering('Naam', a.naam, v ->> 'naam'),
      intern.verandering('Datum', intern.nl_datum(a.datum), intern.nl_datum((v ->> 'datum')::date)),
      intern.verandering('Verzamelen', to_char(a.verzameltijd, 'HH24:MI'), to_char((v ->> 'verzameltijd')::time, 'HH24:MI')),
      intern.verandering('Begint', to_char(a.starttijd, 'HH24:MI'), to_char((v ->> 'starttijd')::time, 'HH24:MI')),
      intern.verandering('Is afgelopen', to_char(a.eindtijd, 'HH24:MI'), to_char((v ->> 'eindtijd')::time, 'HH24:MI')),
      intern.verandering('Locatie', a.locatie, v ->> 'locatie'),
      intern.verandering('Bus vertrekt', to_char(a.bus_vertrektijd, 'HH24:MI'), to_char((v ->> 'bus_vertrektijd')::time, 'HH24:MI')),
      intern.verandering('Bus vertrekt vanaf', a.bus_locatie, v ->> 'bus_locatie'),
      intern.verandering('Afmelden kan tot',
        to_char(a.afmeld_deadline at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI'),
        to_char((v ->> 'afmeld_deadline')::timestamptz at time zone 'Europe/Amsterdam', 'DD-MM HH24:MI'), 'geen deadline'),
      intern.verandering('Minimaal aanwezig', a.min_aanwezigen::text, v ->> 'min_aanwezigen')
    ], null);
    if cardinality(v_regels) > 0 then
      v_tekst := array_to_string(v_regels, E'\n');
      for v_lid in
        select l.id
          from public.leden l
         where l.actief and l.type = 'lid' and not l.alleen_beheer
           and intern.lid_mag_zien(a.id, l.id)
           and not exists (select 1 from public.afmeldingen af where af.activiteit_id = a.id and af.lid_id = l.id)
      loop
        perform intern.zet_bericht_klaar(v_lid.id, a.id, a.naam, a.datum, v_tekst);
      end loop;
    end if;

    -- Doelgroep: wie de activiteit voorheen zag en nu niet meer. Voorheen: geen groepen betekent iedereen.
    for v_lid in
      select l.id
        from public.leden l
       where l.actief and l.type = 'lid' and not l.alleen_beheer
         and not intern.lid_mag_zien(a.id, l.id)
         and (cardinality(s.groepen) = 0
              or exists (select 1 from public.lid_groep lg where lg.lid_id = l.id and lg.groep_id = any (s.groepen)))
         and not exists (select 1 from public.afmeldingen af where af.activiteit_id = a.id and af.lid_id = l.id)
    loop
      perform intern.zet_bericht_klaar(v_lid.id, a.id, a.naam, a.datum,
        'Deze activiteit is niet meer voor jou: hij staat niet meer in je programma.');
    end loop;
  end loop;

  delete from public.berichten_voor where txid = txid_current();
  return null;
end
$$;
revoke all on function intern.verwerk_momentopnamen() from public, anon, authenticated;

create constraint trigger verwerk_momentopnamen_activiteit
  after insert or update or delete on public.activiteiten
  deferrable initially deferred
  for each row execute function intern.verwerk_momentopnamen();
create constraint trigger verwerk_momentopnamen_doelgroep
  after insert or delete on public.activiteit_groep
  deferrable initially deferred
  for each row execute function intern.verwerk_momentopnamen();

-- ===== Een plek: ingedeeld, vervangen, eraf gehaald of weggehaald, bij een gepubliceerde activiteit die nog moet komen =====

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

-- ===== Voor de taken-Worker: berichten oppakken (review Codex B-04, B-05, B-07) =====

-- Pakt wachtende berichten op voor het versturen, in hele groepen (alle berichten van één lid over één activiteit, zodat
-- ze in één mail kunnen). Atomair: twee runs tegelijk krijgen nooit dezelfde regels (for update skip locked), en het
-- aantal pogingen telt hier, vóór het versturen. Ruimt eerst op wat te oud is (24 uur) of te vaak is geprobeerd (5).
-- Alleen service_role mag dit aanroepen.
create function public.claim_berichten(p_max_groepen int default 100, p_claim_minuten int default 10)
returns setof public.berichten
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.berichten
     set status = 'mislukt', fout = 'verlopen', claim_tot = null
   where status = 'wacht' and aangemaakt < clock_timestamp() - interval '24 hours';

  update public.berichten
     set status = 'mislukt', fout = coalesce(fout, 'te_veel_pogingen'), claim_tot = null
   where status = 'wacht' and pogingen >= 5 and (claim_tot is null or claim_tot < clock_timestamp());

  return query
  with groepen as (
    select b.lid_id, coalesce(b.activiteit_id::text, b.activiteit_naam || '|' || b.activiteit_datum) as sleutel
      from public.berichten b
     where b.status = 'wacht' and (b.claim_tot is null or b.claim_tot < clock_timestamp())
     group by 1, 2
     order by min(b.id)
     limit greatest(p_max_groepen, 1)
  ),
  gekozen as (
    select b.id
      from public.berichten b
      join groepen g on g.lid_id = b.lid_id
                    and g.sleutel = coalesce(b.activiteit_id::text, b.activiteit_naam || '|' || b.activiteit_datum)
     where b.status = 'wacht' and (b.claim_tot is null or b.claim_tot < clock_timestamp())
     order by b.id
       for update of b skip locked
  )
  update public.berichten b
     set claim_tot = clock_timestamp() + make_interval(mins => greatest(p_claim_minuten, 1)),
         pogingen = b.pogingen + 1
    from gekozen
   where b.id = gekozen.id
  returning b.*;
end
$$;
revoke all on function public.claim_berichten(int, int) from public, anon, authenticated;
grant execute on function public.claim_berichten(int, int) to service_role;
