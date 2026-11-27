-- Oud papier automatisch aanmaken (UC-014, BA-10): elke eerste vrijdag en zaterdag van de maand, het hele jaar, 12 maanden vooruit.
--
-- Een taak (de taken-Worker, elke nacht) roept `oud_papier_aanmaken` aan. De functie:
--   * maakt per ontbrekende dag één concept "Oud papier" (type oud_papier). Een concept geeft geen bericht aan leden (R18);
--   * vult het zo goed mogelijk: tijden, locatie, doelgroep, het aantal plekken per rol en de eindverantwoordelijke komen van
--     de laatste volledig ingevulde oud-papierdag op dezelfde weekdag (vrijdag van vrijdag, zaterdag van zaterdag). Wie op de
--     andere plekken staat blijft leeg: dat is het indelen, met de kaart "Wie is aan de beurt?". Is er nog geen ingevulde
--     oud-papierdag, dan wordt het concept kaal (de beheerder vult de eerste in, de rest volgt dat voorbeeld);
--   * maakt een datum nooit dubbel (R36): het systeem onthoudt per datum dat het die heeft aangemaakt, ook als de beheerder
--     het concept daarna verwijdert of verplaatst, en slaat een dag over waarop al een oud-papieractiviteit staat;
--   * schrijft per activiteit een regel in wijzigingen_log, met "het systeem" (geen lid) als aanmaker.
--
-- Alleen service_role (de taken-Worker) mag de functie aanroepen, nooit een ingelogde gebruiker.

create table public.oud_papier_aangemaakt (
  datum date primary key,
  vereniging_id uuid not null default 'b3a17e00-0000-4000-8000-000000000001' references public.verenigingen (id),
  aangemaakt timestamptz not null default now()
);
alter table public.oud_papier_aangemaakt enable row level security;
create index oud_papier_aangemaakt_vereniging on public.oud_papier_aangemaakt (vereniging_id);
revoke truncate on public.oud_papier_aangemaakt from service_role;

create function public.oud_papier_aanmaken(p_maanden int default 12, p_vandaag date default null) returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_vandaag date := coalesce(p_vandaag, intern.vandaag(now()));
  v_einde date := (v_vandaag + make_interval(months => p_maanden))::date;
  v_maand date := date_trunc('month', v_vandaag)::date;
  v_weekdag int;
  v_dag date;
  v_voorbeeld public.activiteiten%rowtype;
  v_id uuid;
  v_aantal int := 0;
  v_verantwoordelijke uuid;
  v_volgorde int;
  r record;
begin
  if p_maanden is null or p_maanden < 1 or p_maanden > 24 then
    raise exception 'p_maanden moet tussen 1 en 24 liggen';
  end if;
  -- Eén run tegelijk: twee gelijktijdige taken maken nooit dubbel.
  perform pg_advisory_xact_lock(hashtext('oud_papier_aanmaken'));

  while v_maand <= v_einde loop
    foreach v_weekdag in array array[5, 6] loop
      -- Eerste vrijdag (5) of zaterdag (6) van deze maand (ISO: maandag = 1).
      v_dag := v_maand + ((v_weekdag - extract(isodow from v_maand)::int + 7) % 7);
      if v_dag < v_vandaag or v_dag > v_einde then continue; end if;
      if exists (select 1 from public.oud_papier_aangemaakt where datum = v_dag)
         or exists (select 1 from public.activiteiten where type = 'oud_papier' and datum = v_dag) then
        continue;
      end if;

      -- Het voorbeeld: de dichtstbijzijnde volledig ingevulde oud-papierdag op dezelfde weekdag, eerst ervoor, anders erna.
      v_voorbeeld := null;
      select * into v_voorbeeld
      from public.activiteiten
      where type = 'oud_papier' and status <> 'geannuleerd' and starttijd is not null and locatie is not null
        and extract(isodow from datum)::int = v_weekdag
      order by (datum > v_dag), abs(datum - v_dag)
      limit 1;

      insert into public.activiteiten (naam, datum, verzameltijd, starttijd, eindtijd, locatie, type, status)
      values ('Oud papier', v_dag, v_voorbeeld.verzameltijd, v_voorbeeld.starttijd, v_voorbeeld.eindtijd,
              v_voorbeeld.locatie, 'oud_papier', 'concept')
      returning id into v_id;

      -- De eindverantwoordelijke: dezelfde als bij het voorbeeld, als die nog actief lid is (geen beheeraccount of externe).
      v_verantwoordelijke := null;
      if v_voorbeeld.id is not null then
        select s.bezetter_id into v_verantwoordelijke
        from public.rol_slots s join public.leden l on l.id = s.bezetter_id
        where s.activiteit_id = v_voorbeeld.id and s.rol_type = 'eindverantwoordelijke'
          and l.actief and l.type = 'lid' and not l.alleen_beheer;
      end if;
      insert into public.rol_slots (activiteit_id, rol_type, bezetter_id, volgorde)
      values (v_id, 'eindverantwoordelijke', v_verantwoordelijke, 0);

      if v_voorbeeld.id is not null then
        -- Dezelfde rollen en aantallen, lege plekken (geen bak, geen tweede eindverantwoordelijke).
        v_volgorde := 0;
        for r in
          select rol_type, count(*) as aantal from public.rol_slots
          where activiteit_id = v_voorbeeld.id and rol_type not in ('eindverantwoordelijke', 'bak')
          group by rol_type order by min(volgorde)
        loop
          for i in 1 .. least(r.aantal, 20) loop
            v_volgorde := v_volgorde + 1;
            insert into public.rol_slots (activiteit_id, rol_type, volgorde) values (v_id, r.rol_type, v_volgorde);
          end loop;
        end loop;
        insert into public.activiteit_groep (activiteit_id, groep_id)
        select v_id, groep_id from public.activiteit_groep where activiteit_id = v_voorbeeld.id;
      end if;

      insert into public.oud_papier_aangemaakt (datum) values (v_dag);
      insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
      values (null, 'activiteit_aangemaakt', 'activiteiten', v_id,
              format('Oud papier (%s) door het systeem aangemaakt als concept', to_char(v_dag, 'DD-MM-YYYY')));
      v_aantal := v_aantal + 1;
    end loop;
    v_maand := (v_maand + interval '1 month')::date;
  end loop;
  return v_aantal;
end
$$;

revoke all on function public.oud_papier_aanmaken(int, date) from public, anon, authenticated;
grant execute on function public.oud_papier_aanmaken(int, date) to service_role;
