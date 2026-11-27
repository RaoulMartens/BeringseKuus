-- Leden toevoegen in de app (UC-013 AF-4 t/m AF-7, BA-11): een lid toevoegen, de uitnodiging opnieuw sturen, het e-mailadres corrigeren
-- en meerdere leden tegelijk toevoegen.
--
-- Het inlogaccount maakt de database niet zelf aan: daarvoor is de geheime sleutel van Supabase nodig en die hoort alleen bij de
-- taken-Worker (Bouwbesluiten 3.1). De werkwijze is die van de berichten per mail:
--   * de database maakt het lid aan (leden, leden_prive, lid_groep) en zet een opdracht klaar in `lid_uitnodigingen` (postvak-uit);
--     beide in één transactie, dus faalt het een, dan is er ook geen ander;
--   * de taken-Worker pakt de opdrachten op met `claim_uitnodigingen`, maakt het inlogaccount aan (of zet het nieuwe e-mailadres),
--     stuurt de uitnodigingsmail en meldt het resultaat met `uitnodiging_afronden`.
-- Het lid staat dus meteen in lijsten, groepen en het overzicht; "kan inloggen" volgt binnen een minuut.
--
-- Regels (R38 t/m R40 in use-cases.md): een nieuw lid is actief, heeft minstens één groep en een uniek e-mailadres (over actieve en
-- inactieve leden); de uitnodiging niet vaker dan één keer per 10 minuten per lid; een import is alles of niets, een adres dat al
-- lid is wordt overgeslagen; het e-mailadres corrigeren kan alleen zolang het lid nooit is ingelogd.

-- ===== Het postvak-uit =====
create table public.lid_uitnodigingen (
  id bigint generated always as identity primary key,
  vereniging_id uuid not null default 'b3a17e00-0000-4000-8000-000000000001' references public.verenigingen (id),
  lid_id uuid not null references public.leden (id) on delete cascade,
  door_lid_id uuid references public.leden (id) on delete set null,
  -- Een uitnodiging of een herinnering (het lid heeft zich na een paar dagen nog niet aangemeld); dezelfde weg naar de Worker.
  soort text not null default 'uitnodiging' check (soort in ('uitnodiging', 'herinnering')),
  status text not null default 'wacht' check (status in ('wacht', 'verstuurd', 'mislukt')),
  fout text,
  pogingen int not null default 0,
  claim_tot timestamptz,
  aangemaakt timestamptz not null default now(),
  verstuurd_op timestamptz
);
alter table public.lid_uitnodigingen enable row level security;
create index lid_uitnodigingen_vereniging on public.lid_uitnodigingen (vereniging_id);
create index lid_uitnodigingen_lid on public.lid_uitnodigingen (lid_id, aangemaakt desc);
create index lid_uitnodigingen_door_lid on public.lid_uitnodigingen (door_lid_id);
create index lid_uitnodigingen_wacht on public.lid_uitnodigingen (id) where status = 'wacht';
revoke truncate on public.lid_uitnodigingen from service_role;

-- ===== Hulp: de gegevens van een lid controleren en omzetten =====
-- Geeft het genormaliseerde adres en nummer terug, of geeft een fout. Schrijft niets.
create function intern.lid_controleren(
  p_voornaam text, p_achternaam text, p_email text, p_telefoon text, p_groepen uuid[],
  out o_voornaam text, out o_achternaam text, out o_email text, out o_telefoon text, out o_groepen uuid[]
) language plpgsql
set search_path = ''
as $$
declare
  v_nummer text := regexp_replace(btrim(coalesce(p_telefoon, '')), '\s+', ' ', 'g');
  v_cijfers int := length(regexp_replace(v_nummer, '\D', '', 'g'));
  v_ontbreekt text[] := '{}';
begin
  o_voornaam := btrim(coalesce(p_voornaam, ''));
  o_achternaam := btrim(coalesce(p_achternaam, ''));
  o_email := lower(btrim(coalesce(p_email, '')));
  if o_voornaam = '' then v_ontbreekt := array_append(v_ontbreekt, 'voornaam'); end if;
  if o_achternaam = '' then v_ontbreekt := array_append(v_ontbreekt, 'achternaam'); end if;
  if o_email = '' then v_ontbreekt := array_append(v_ontbreekt, 'email'); end if;
  if cardinality(v_ontbreekt) > 0 then
    perform intern.fout('veld_ontbreekt', jsonb_build_object('velden', to_jsonb(v_ontbreekt)));
  end if;
  if length(o_voornaam) > 100 or length(o_achternaam) > 100 then
    perform intern.fout('veld_ongeldig', jsonb_build_object('veld', 'naam'));
  end if;
  if length(o_email) > 254 or o_email !~ '^[^\s@<>()\[\]\\,;:"]+@[^\s@<>()\[\]\\,;:"]+\.[^\s@<>()\[\]\\,;:"]+$' then
    perform intern.fout('email_ongeldig');
  end if;
  if v_nummer <> '' and (length(v_nummer) > 20 or v_nummer !~ '^[0+][0-9 -]*$' or v_cijfers < 9 or v_cijfers > 15) then
    perform intern.fout('telefoon_ongeldig');
  end if;
  o_telefoon := nullif(v_nummer, '');
  select coalesce(array_agg(distinct x), '{}') into o_groepen from unnest(coalesce(p_groepen, '{}')) as x;
  if cardinality(o_groepen) = 0 then
    perform intern.fout('groep_nodig');
  end if;
  if exists (select 1 from unnest(o_groepen) as x where not exists (select 1 from public.groepen g where g.id = x)) then
    perform intern.fout('groep_onbekend');
  end if;
end
$$;

-- Hulp: een lid met e-mailadres aanmaken en de opdracht klaarzetten. De aanroeper heeft de controle gedaan en het slot genomen.
create function intern.lid_maken(
  p_voornaam text, p_achternaam text, p_email text, p_telefoon text, p_groepen uuid[],
  p_mag_bob boolean, p_mag_eindverantw boolean, p_door uuid
) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.leden (voornaam, achternaam, type) values (p_voornaam, p_achternaam, 'lid') returning id into v_id;
  insert into public.leden_prive (lid_id, email, telefoon, mag_bob, mag_eindverantw)
  values (v_id, p_email, p_telefoon, coalesce(p_mag_bob, false), coalesce(p_mag_eindverantw, false));
  insert into public.lid_groep (lid_id, groep_id) select v_id, g from unnest(p_groepen) g;
  insert into public.lid_uitnodigingen (lid_id, door_lid_id) values (v_id, p_door);
  insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
  values (p_door, 'lid_toegevoegd', 'leden', v_id, 'Lid toegevoegd en uitgenodigd');
  return v_id;
end
$$;

-- Geeft de fout email_bestaat als het adres al bij een lid hoort (behalve p_behalve), met dat lid erbij: de pagina kan er dan naartoe linken.
create function intern.email_bestaat_fout(p_email text, p_behalve uuid) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_lid record;
begin
  select l.id, l.voornaam || ' ' || l.achternaam as naam, l.actief into v_lid
    from public.leden_prive p join public.leden l on l.id = p.lid_id
   where p.email = p_email and (p_behalve is null or l.id <> p_behalve);
  if found then
    perform intern.fout('email_bestaat', jsonb_build_object('lid_id', v_lid.id, 'naam', v_lid.naam, 'actief', v_lid.actief));
  end if;
end
$$;

-- ===== Een lid toevoegen =====
create function public.lid_toevoegen(
  p_voornaam text, p_achternaam text, p_email text, p_telefoon text, p_groepen uuid[],
  p_mag_bob boolean default false, p_mag_eindverantw boolean default false
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_ctl record;
  v_id uuid;
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  perform pg_advisory_xact_lock(hashtext('leden'));
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;

  select * into v_ctl from intern.lid_controleren(p_voornaam, p_achternaam, p_email, p_telefoon, p_groepen);
  perform intern.email_bestaat_fout(v_ctl.o_email, null);
  v_id := intern.lid_maken(v_ctl.o_voornaam, v_ctl.o_achternaam, v_ctl.o_email, v_ctl.o_telefoon, v_ctl.o_groepen,
                           p_mag_bob, p_mag_eindverantw, intern.huidig_lid());
  return jsonb_build_object('lid_id', v_id, 'voornaam', v_ctl.o_voornaam, 'achternaam', v_ctl.o_achternaam,
                            'email', v_ctl.o_email);
end
$$;

-- ===== De uitnodiging opnieuw sturen =====
create function public.lid_uitnodiging_opnieuw(p_lid_id uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_lid public.leden%rowtype;
  v_email text;
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
  if not v_lid.actief then
    perform intern.fout('lid_inactief');
  end if;
  if exists (select 1 from auth.users u where u.id = v_lid.auth_user_id and u.last_sign_in_at is not null) then
    perform intern.fout('al_ingelogd');
  end if;
  -- R39: niet vaker dan één keer per 10 minuten (een dubbele klik).
  if exists (select 1 from public.lid_uitnodigingen where lid_id = v_lid.id and aangemaakt > now() - interval '10 minutes') then
    perform intern.fout('te_snel');
  end if;

  select email into v_email from public.leden_prive where lid_id = v_lid.id;
  insert into public.lid_uitnodigingen (lid_id, door_lid_id) values (v_lid.id, intern.huidig_lid());
  insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
  values (intern.huidig_lid(), 'uitnodiging_gestuurd', 'leden', v_lid.id, 'Uitnodiging opnieuw gestuurd');
  return jsonb_build_object('voornaam', v_lid.voornaam, 'achternaam', v_lid.achternaam, 'email', v_email);
end
$$;

-- ===== Het e-mailadres corrigeren =====
-- Alleen zolang het lid nooit is ingelogd. De Worker zet het adres bij het inlogaccount en stuurt de uitnodiging naar het nieuwe adres.
create function public.lid_adres_corrigeren(p_lid_id uuid, p_email text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_lid public.leden%rowtype;
  v_ctl record;
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
  if not v_lid.actief then
    perform intern.fout('lid_inactief');
  end if;
  if exists (select 1 from auth.users u where u.id = v_lid.auth_user_id and u.last_sign_in_at is not null) then
    perform intern.fout('al_ingelogd');
  end if;

  -- Alleen het adres wordt gecontroleerd; de groepen van het lid doen hier niet mee (een lid zonder groep kan zijn adres toch corrigeren): een willekeurige
  -- bestaande groep laat die controle slagen.
  select * into v_ctl from intern.lid_controleren(v_lid.voornaam, v_lid.achternaam, p_email, null, array(select g.id from public.groepen g limit 1));
  perform intern.email_bestaat_fout(v_ctl.o_email, v_lid.id);
  -- Hetzelfde adres: niets te corrigeren.
  if exists (select 1 from public.leden_prive where lid_id = v_lid.id and email = v_ctl.o_email) then
    perform intern.fout('adres_ongewijzigd');
  end if;

  update public.leden_prive set email = v_ctl.o_email where lid_id = v_lid.id;
  insert into public.lid_uitnodigingen (lid_id, door_lid_id) values (v_lid.id, intern.huidig_lid());
  insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
  values (intern.huidig_lid(), 'adres_gecorrigeerd', 'leden', v_lid.id, 'E-mailadres van een lid gecorrigeerd en uitnodiging gestuurd');
  return jsonb_build_object('voornaam', v_lid.voornaam, 'achternaam', v_lid.achternaam, 'email', v_ctl.o_email);
end
$$;

-- ===== Meerdere leden tegelijk =====
-- p_regels: [{regel, voornaam, achternaam, email, telefoon, groepen: [uuid]}]. Met p_proef (standaard) schrijft de functie niets en
-- geeft ze per regel de uitkomst: toevoegen, bestaat_al of fout (met code). Zonder p_proef is het alles of niets: een regel met een
-- fout houdt alles tegen (`import_fout`, met het regelnummer), een bestaand adres wordt overgeslagen. Een adres dat twee keer in het
-- bestand staat is een fout (`email_dubbel`) bij de tweede.
create function public.leden_importeren(p_regels jsonb, p_proef boolean default true) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  c_max constant int := 200;
  v_regel jsonb;
  v_nr int := 0;
  v_regelnr int;
  v_ctl record;
  v_groepen uuid[];
  v_groep jsonb;
  v_uitkomsten jsonb := '[]'::jsonb;
  v_gezien text[] := '{}';
  v_status text;
  v_code text;
  v_msg text;
  v_detail text;
  v_toe int := 0;
  v_over int := 0;
  v_fout int := 0;
  v_eerste_fout int;
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  perform pg_advisory_xact_lock(hashtext('leden'));
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
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
    v_status := 'toevoegen';
    v_code := null;
    v_regelnr := coalesce(nullif(v_regel ->> 'regel', '')::int, v_nr);
    begin
      if jsonb_typeof(v_regel) <> 'object' then
        perform intern.fout('wijziging_ongeldig');
      end if;
      v_groepen := '{}';
      if jsonb_typeof(v_regel -> 'groepen') = 'array' then
        for v_groep in select * from jsonb_array_elements(v_regel -> 'groepen') loop
          v_groepen := v_groepen || intern.json_uuid(v_groep, 'groepen', 'groep_onbekend');
        end loop;
      end if;
      select * into v_ctl from intern.lid_controleren(v_regel ->> 'voornaam', v_regel ->> 'achternaam', v_regel ->> 'email',
                                                      v_regel ->> 'telefoon', v_groepen);
      if v_ctl.o_email = any (v_gezien) then
        perform intern.fout('email_dubbel');
      end if;
      v_gezien := array_append(v_gezien, v_ctl.o_email);
      if exists (select 1 from public.leden_prive where email = v_ctl.o_email) then
        v_status := 'bestaat_al';
      elsif not p_proef then
        perform intern.lid_maken(v_ctl.o_voornaam, v_ctl.o_achternaam, v_ctl.o_email, v_ctl.o_telefoon, v_ctl.o_groepen,
                                 false, false, intern.huidig_lid());
      end if;
    exception
      when sqlstate 'BK001' then
        get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
        v_status := 'fout';
        v_code := v_msg;
    end;
    if v_status = 'toevoegen' then v_toe := v_toe + 1;
    elsif v_status = 'bestaat_al' then v_over := v_over + 1;
    else
      v_fout := v_fout + 1;
      v_eerste_fout := coalesce(v_eerste_fout, v_regelnr);
    end if;
    v_uitkomsten := v_uitkomsten || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'regel', v_regelnr, 'status', v_status, 'code', v_code,
      'voornaam', btrim(coalesce(v_regel ->> 'voornaam', '')), 'achternaam', btrim(coalesce(v_regel ->> 'achternaam', '')),
      'email', lower(btrim(coalesce(v_regel ->> 'email', ''))))));
  end loop;

  if not p_proef and v_fout > 0 then
    -- De transactie wordt teruggedraaid: er is niets aangemaakt.
    perform intern.fout('import_fout', jsonb_build_object('regel', v_eerste_fout));
  end if;
  return jsonb_build_object('regels', v_uitkomsten, 'toevoegen', v_toe, 'bestaat_al', v_over, 'fouten', v_fout, 'proef', p_proef);
end
$$;

-- ===== De uitnodigingen van de leden (voor de lijst en het lidscherm) =====
-- Per lid de laatste opdracht: wacht (wordt verstuurd), verstuurd of mislukt.
create function public.leden_uitnodigingen() returns table (
  lid_id uuid, soort text, status text, aangemaakt timestamptz, verstuurd_op timestamptz
)
language plpgsql security definer
set search_path = ''
as $$
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  return query
  select distinct on (u.lid_id) u.lid_id, u.soort, u.status, u.aangemaakt, u.verstuurd_op
    from public.lid_uitnodigingen u
   order by u.lid_id, u.aangemaakt desc, u.id desc;
end
$$;

-- ===== Voor de taken-Worker =====
-- Pakt wachtende opdrachten op (atomair: twee runs tegelijk krijgen nooit dezelfde) en telt de poging. Een opdracht voor een lid dat
-- inactief is geworden wordt `mislukt` (lid_inactief). Na vijf pogingen ook (te_veel_pogingen). account_id is het inlogaccount van het
-- lid, of dat met hetzelfde adres (een eerdere run kan het account hebben gemaakt zonder het vast te leggen).
create function public.claim_uitnodigingen(p_max int default 20, p_claim_minuten int default 5)
returns table (id bigint, lid_id uuid, soort text, voornaam text, email text, account_id uuid, account_email text)
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.lid_uitnodigingen u set status = 'mislukt', fout = 'te_veel_pogingen', claim_tot = null
   where u.status = 'wacht' and u.pogingen >= 5 and (u.claim_tot is null or u.claim_tot < now());
  update public.lid_uitnodigingen u set status = 'mislukt', fout = 'lid_inactief', claim_tot = null
   where u.status = 'wacht' and exists (select 1 from public.leden l where l.id = u.lid_id and not l.actief);

  return query
  with gekozen as (
    select w.id from public.lid_uitnodigingen w
     where w.status = 'wacht' and (w.claim_tot is null or w.claim_tot < now())
     order by w.id
     limit greatest(p_max, 1)
       for update skip locked
  ), bijgewerkt as (
    update public.lid_uitnodigingen w
       set pogingen = w.pogingen + 1, claim_tot = now() + make_interval(mins => greatest(p_claim_minuten, 1))
      from gekozen g where w.id = g.id
    returning w.id, w.lid_id, w.soort
  )
  select b.id, l.id, b.soort, l.voornaam, p.email,
         coalesce(l.auth_user_id, (select au.id from auth.users au where lower(au.email) = p.email)),
         (select au.email::text from auth.users au
           where au.id = coalesce(l.auth_user_id, (select au2.id from auth.users au2 where lower(au2.email) = p.email)))
    from bijgewerkt b
    join public.leden l on l.id = b.lid_id
    join public.leden_prive p on p.lid_id = l.id
   order by b.id;
end
$$;

-- Herinneringen (door de Worker, elke ochtend): een lid dat na de uitnodiging nog nooit is ingelogd krijgt één herinnering, 3 dagen na de laatste verstuurde
-- uitnodiging; nooit meer dan één per lid. Wil de beheerder daarna nog een keer mailen, dan stuurt hij zelf de uitnodiging opnieuw (lid_uitnodiging_opnieuw).
-- Alleen actieve leden die kunnen inloggen (geen beheeraccount, geen externe helper), en alleen als de uitnodiging echt is verstuurd. Een lid dat is
-- ingelogd of inactief is gezet, krijgt er geen. De herinnering is een opdracht in hetzelfde postvak-uit; de Worker stuurt hem. Geeft het aantal nieuwe opdrachten.
create function public.herinneringen_klaarzetten(p_na_dagen int default 3) returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_aantal int;
begin
  perform pg_advisory_xact_lock(hashtext('herinneringen_klaarzetten'));
  with nieuw as (
    insert into public.lid_uitnodigingen (lid_id, soort)
    select l.id, 'herinnering'
      from public.leden l
     where l.type = 'lid' and l.actief and not l.alleen_beheer
       and not exists (select 1 from auth.users au where au.id = l.auth_user_id and au.last_sign_in_at is not null)
       -- Er is een uitnodiging verstuurd, die is minstens p_na_dagen oud, en er wacht niets meer.
       and (select max(u.verstuurd_op) from public.lid_uitnodigingen u
             where u.lid_id = l.id and u.soort = 'uitnodiging' and u.status = 'verstuurd') <= now() - make_interval(days => p_na_dagen)
       and not exists (select 1 from public.lid_uitnodigingen u where u.lid_id = l.id and u.status = 'wacht')
       -- Hooguit één herinnering per lid, ooit.
       and not exists (select 1 from public.lid_uitnodigingen u where u.lid_id = l.id and u.soort = 'herinnering' and u.status in ('wacht', 'verstuurd'))
    returning lid_id
  ), logregel as (
    insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
    select null, 'herinnering_gestuurd', 'leden', n.lid_id, 'Herinnering om in te loggen klaargezet door het systeem' from nieuw n
    returning 1
  )
  select count(*) into v_aantal from nieuw;
  return v_aantal;
end
$$;

-- Legt het resultaat vast. p_auth_user_id koppelt het inlogaccount aan het lid (alleen als er nog geen is).
create function public.uitnodiging_afronden(
  p_id bigint, p_status text, p_auth_user_id uuid default null, p_fout text default null
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_lid uuid;
begin
  if p_status not in ('verstuurd', 'wacht', 'mislukt') then
    raise exception 'onbekende status';
  end if;
  select lid_id into v_lid from public.lid_uitnodigingen where lid_uitnodigingen.id = p_id for update;
  if not found then
    return;
  end if;
  if p_auth_user_id is not null then
    update public.leden set auth_user_id = p_auth_user_id where leden.id = v_lid and auth_user_id is null;
  end if;
  update public.lid_uitnodigingen
     set status = p_status, fout = left(p_fout, 200),
         verstuurd_op = case when p_status = 'verstuurd' then now() else verstuurd_op end,
         claim_tot = case when p_status = 'wacht' then claim_tot else null end
   where lid_uitnodigingen.id = p_id;
end
$$;

-- ===== Rechten =====
revoke all on function intern.lid_controleren(text, text, text, text, uuid[]) from public, anon, authenticated;
revoke all on function intern.email_bestaat_fout(text, uuid) from public, anon, authenticated;
revoke all on function intern.lid_maken(text, text, text, text, uuid[], boolean, boolean, uuid) from public, anon, authenticated;

revoke all on function public.lid_toevoegen(text, text, text, text, uuid[], boolean, boolean) from public, anon;
revoke all on function public.lid_uitnodiging_opnieuw(uuid) from public, anon;
revoke all on function public.lid_adres_corrigeren(uuid, text) from public, anon;
revoke all on function public.leden_importeren(jsonb, boolean) from public, anon;
revoke all on function public.leden_uitnodigingen() from public, anon;
grant execute on function public.lid_toevoegen(text, text, text, text, uuid[], boolean, boolean) to authenticated;
grant execute on function public.lid_uitnodiging_opnieuw(uuid) to authenticated;
grant execute on function public.lid_adres_corrigeren(uuid, text) to authenticated;
grant execute on function public.leden_importeren(jsonb, boolean) to authenticated;
grant execute on function public.leden_uitnodigingen() to authenticated;

revoke all on function public.claim_uitnodigingen(int, int) from public, anon, authenticated;
revoke all on function public.uitnodiging_afronden(bigint, text, uuid, text) from public, anon, authenticated;
revoke all on function public.herinneringen_klaarzetten(int) from public, anon, authenticated;
grant execute on function public.herinneringen_klaarzetten(int) to service_role;
grant execute on function public.claim_uitnodigingen(int, int) to service_role;
grant execute on function public.uitnodiging_afronden(bigint, text, uuid, text) to service_role;
