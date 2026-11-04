-- Fase 3, stap B: afmelden, afmelding intrekken, dienst overdragen en Mijn diensten (docs/bouw/Datamodel-fase-3.md).
--
--  1. intern.afmeldtoelichting: de toelichting van een afmelding schoonmaken.
--  2. meld_af: een lid meldt zich af (UC-003, R7, R8).
--  3. trek_afmelding_in: een lid trekt zijn afmelding in (R9).
--  4. ruil_dienst: een lid draagt zijn dienst over aan een vervanger (UC-002).
--  5. beschikbare_vervangers: wie kan overnemen, en zo niet, waarom (alleen lezen, voorlichting).
--  6. De view mijn_diensten (UC-007).
--
-- Geen tabel, kolom of constraint verandert en er verdwijnt niets: alleen nieuwe functies, een view en rechten.
-- Alle drie de schrijffuncties nemen als eerste na de controle op het lid dezelfde rij-lock op activiteiten als
-- activiteit_opslaan (use-cases.md, "Gelijktijdigheid"), en pas daarna de slots. De tijd is clock_timestamp() NA de lock:
-- now() is het begin van de transactie en zou een afmelding die op de lock heeft gewacht nog "voor de deadline" laten tellen.
-- Geen van de functies verhoogt activiteiten.versie: de acties van een lid verhogen de versie niet (Datamodel-fase-2.md
-- punt 2, besluit 1), anders verliest een beheerder met een open formulier zijn werk bij elke ruil.

-- ===== 1. De toelichting =====
-- Stuurtekens, regel- en alineascheidingstekens en onzichtbare richtingtekens worden een spatie, dan snoeien en afkappen op
-- 500 tekens; leeg wordt null. Afkappen en niet afwijzen: wie iets langs typt, moet zich kunnen afmelden. De invoer wordt eerst
-- op 2000 tekens gezet, zodat een enorme tekst niet eerst helemaal wordt doorlopen.
create function intern.afmeldtoelichting(p_tekst text) returns text
language sql immutable
set search_path = ''
as $$
  select nullif(
    btrim(left(btrim(regexp_replace(
      left(coalesce(p_tekst, ''), 2000),
      '[[:cntrl:]' || chr(8203) || '-' || chr(8207) || chr(8232) || '-' || chr(8238) || chr(8294) || '-' || chr(8297)
        || chr(65279) || ']',
      ' ', 'g')), 500)),
    '')
$$;
revoke all on function intern.afmeldtoelichting(text) from public, anon, authenticated;

-- ===== 2. meld_af =====
create function public.meld_af(p_activiteit_id uuid, p_toelichting text default null) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_lid uuid;
  v_nu timestamptz;
  v_act public.activiteiten%rowtype;
  v_aanwezig int;
  v_afmelding uuid;
begin
  v_lid := intern.huidig_lid();
  if v_lid is null then
    perform intern.fout('geen_lid');
  end if;

  -- Eerst de lock, dan lezen. Een onbekend id en een verborgen activiteit zien er voor het lid hetzelfde uit.
  if p_activiteit_id is not null then
    select * into v_act from public.activiteiten where id = p_activiteit_id for update;
  end if;
  v_nu := clock_timestamp();
  if v_act.id is null or not intern.lid_mag_zien(v_act.id, v_lid) then
    perform intern.fout('activiteit_niet_open');
  end if;
  -- Pas nu mag de reden genoemd worden: het lid mag de activiteit zien, dus dit verraadt niets.
  if v_act.status <> 'gepubliceerd' then
    perform intern.fout('activiteit_niet_open', jsonb_build_object('reden', 'geannuleerd'));
  end if;
  if v_act.eindigt_om <= v_nu then
    perform intern.fout('activiteit_niet_open', jsonb_build_object('reden', 'afgelopen'));
  end if;

  if exists (select 1 from public.afmeldingen af where af.activiteit_id = v_act.id and af.lid_id = v_lid) then
    perform intern.fout('al_afgemeld');
  end if;

  -- Een beheerrol (eindverantwoordelijke, BOB, bak) gaat voor: daar kan een overdracht niets aan veranderen (R4, R23).
  if exists (
    select 1 from public.rol_slots s join public.roltypen r on r.code = s.rol_type
     where s.activiteit_id = v_act.id and s.bezetter_id = v_lid and r.alleen_admin
  ) then
    perform intern.fout('heeft_adminrol');
  end if;
  -- Elk ander slot: eerst ruilen (R7). Niet op de vlag ruilbaar_door_lid: een roltype met beide vlaggen onwaar mag een
  -- bezetter niet "afgemeld en ingedeeld" maken.
  if exists (select 1 from public.rol_slots s where s.activiteit_id = v_act.id and s.bezetter_id = v_lid) then
    perform intern.fout('heeft_ruilbare_rol');
  end if;

  -- De telling in een eigen statement ná de lock: in dezelfde query als de lock gebruikt een stabiele functie de
  -- momentopname van vóór het wachten. Het lid zelf telt mee (actief, type lid, in de doelgroep, nog niet afgemeld).
  v_aanwezig := intern.aantal_aanwezigen(v_act.id);
  if intern.deadline_verstreken(v_act.afmeld_deadline, v_nu)
     and v_act.min_aanwezigen is not null
     and v_aanwezig - 1 < v_act.min_aanwezigen then
    perform intern.fout('onder_ondergrens', jsonb_build_object(
      'min', v_act.min_aanwezigen, 'aanwezigen_nu', v_aanwezig, 'aanwezigen_na', v_aanwezig - 1));
  end if;

  insert into public.afmeldingen (activiteit_id, lid_id, toelichting)
  values (v_act.id, v_lid, intern.afmeldtoelichting(p_toelichting))
  returning id into v_afmelding;

  -- Geen toelichting en geen naam in het log (Bouwbesluiten 4.6).
  insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
  values (v_lid, 'afgemeld', 'afmeldingen', v_afmelding, format('afgemeld voor activiteit %s', v_act.id));

  return jsonb_build_object('activiteit_id', v_act.id, 'aanwezigen', v_aanwezig - 1);
end
$$;

-- ===== 3. trek_afmelding_in =====
create function public.trek_afmelding_in(p_activiteit_id uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_lid uuid;
  v_nu timestamptz;
  v_act public.activiteiten%rowtype;
  v_afmelding uuid;
begin
  v_lid := intern.huidig_lid();
  if v_lid is null then
    perform intern.fout('geen_lid');
  end if;

  -- Intrekken kan de ondergrens nooit doorbreken, maar de lock staat er voor dezelfde volgorde als bij de andere schrijfacties.
  if p_activiteit_id is not null then
    select * into v_act from public.activiteiten where id = p_activiteit_id for update;
  end if;
  v_nu := clock_timestamp();
  if v_act.id is null or not intern.lid_mag_zien(v_act.id, v_lid) then
    perform intern.fout('activiteit_niet_open');
  end if;
  -- Een geannuleerde activiteit geeft activiteit_niet_open (Datamodel-fase-3.md besluit 3.5), een afgelopen activiteit activiteit_voorbij (R9).
  if v_act.status <> 'gepubliceerd' then
    perform intern.fout('activiteit_niet_open', jsonb_build_object('reden', 'geannuleerd'));
  end if;
  if v_act.eindigt_om <= v_nu then
    perform intern.fout('activiteit_voorbij');
  end if;

  delete from public.afmeldingen af where af.activiteit_id = v_act.id and af.lid_id = v_lid
  returning af.id into v_afmelding;
  if v_afmelding is null then
    perform intern.fout('niet_afgemeld');
  end if;

  insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
  values (v_lid, 'afmelding_ingetrokken', 'afmeldingen', v_afmelding,
          format('afmelding ingetrokken voor activiteit %s', v_act.id));

  -- Een eerder overgedragen dienst komt niet terug (R9): rol_slots blijft onaangeroerd.
  return jsonb_build_object('activiteit_id', v_act.id, 'aanwezigen', intern.aantal_aanwezigen(v_act.id));
end
$$;

-- ===== 4. ruil_dienst =====
create function public.ruil_dienst(p_rol_slot_id uuid, p_vervanger_id uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_lid uuid;
  v_nu timestamptz;
  v_act_id uuid;
  v_act public.activiteiten%rowtype;
  v_slot public.rol_slots%rowtype;
  v_ruilbaar boolean;
  v_vervanger public.leden%rowtype;
begin
  v_lid := intern.huidig_lid();
  if v_lid is null then
    perform intern.fout('geen_lid');
  end if;

  -- Het slot-id verraadt niets over de activiteit: eerst zonder lock opzoeken om de activiteit te kennen, dan de lock op
  -- de activiteit, dan het slot opnieuw lezen (de bezetter kan intussen zijn veranderd). Geen slot, op welk moment ook,
  -- is altijd geen_bezetter.
  if p_rol_slot_id is not null then
    select s.activiteit_id into v_act_id from public.rol_slots s where s.id = p_rol_slot_id;
  end if;
  if v_act_id is null then
    perform intern.fout('geen_bezetter');
  end if;
  select * into v_act from public.activiteiten where id = v_act_id for update;
  v_nu := clock_timestamp();
  if v_act.id is null then
    perform intern.fout('geen_bezetter');
  end if;
  select * into v_slot from public.rol_slots where id = p_rol_slot_id for update;
  -- Een slot van een ander, een leeg slot en een slot in een verborgen activiteit (een lid kan in een concept staan)
  -- zien er hetzelfde uit; daarna kan een reden nooit iets over een verborgen activiteit verraden.
  if v_slot.id is null or v_slot.bezetter_id is distinct from v_lid or not intern.lid_mag_zien(v_act.id, v_lid) then
    perform intern.fout('geen_bezetter');
  end if;

  select r.ruilbaar_door_lid into v_ruilbaar from public.roltypen r where r.code = v_slot.rol_type;
  if v_ruilbaar is not true then
    perform intern.fout('rol_niet_ruilbaar');
  end if;

  if v_act.status <> 'gepubliceerd' then
    perform intern.fout('activiteit_niet_open', jsonb_build_object('reden', 'geannuleerd'));
  end if;
  if v_act.eindigt_om <= v_nu then
    perform intern.fout('activiteit_niet_open', jsonb_build_object('reden', 'afgelopen'));
  end if;

  -- De vervanger: een actief lid van type lid (R14, R17), niet het lid zelf, dat de activiteit mag zien (R22). for share
  -- sluit een gelijktijdig inactief zetten uit zonder dat ledenbeheer de lock op de activiteit hoeft te nemen.
  if p_vervanger_id is not null then
    select * into v_vervanger from public.leden where id = p_vervanger_id for share;
  end if;
  if v_vervanger.id is null or v_vervanger.id = v_lid or not v_vervanger.actief or v_vervanger.type <> 'lid'
     or not intern.lid_mag_zien(v_act.id, v_vervanger.id) then
    perform intern.fout('vervanger_ongeldig', jsonb_build_object('lid_id', p_vervanger_id));
  end if;
  if exists (select 1 from public.afmeldingen af where af.activiteit_id = v_act.id and af.lid_id = v_vervanger.id) then
    perform intern.fout('vervanger_afgemeld');
  end if;
  -- De eindtoestand zelf toetsen: de constraint geen_dubbelboeking is uitgesteld en blijft alleen het vangnet bij commit (R6, R20).
  if exists (select 1 from public.rol_slots s where s.activiteit_id = v_act.id and s.bezetter_id = v_vervanger.id) then
    perform intern.fout('dubbelboeking');
  end if;

  -- In één update van het lid naar de vervanger: er ontstaat geen lege plek (R2).
  update public.rol_slots set bezetter_id = v_vervanger.id where id = v_slot.id;

  -- Leden moeten zien dat de bezetting is veranderd, dus bijgewerkt verschuift. Dat gaat via een update zonder
  -- wijziging op de activiteit: de trigger activiteit_vangnet zet bijgewerkt als bk.zichtbaar naar deze activiteit wijst.
  -- NIET versie = versie + 1: zie de kop van deze migratie.
  perform set_config('bk.zichtbaar', v_act.id::text, true);
  update public.activiteiten set naam = naam where id = v_act.id;
  perform set_config('bk.zichtbaar', '', true);

  -- Alleen id's, geen namen: dit wijkt bewust af van het indelen in activiteit_opslaan.
  insert into public.wijzigingen_log (door_lid_id, actie, tabel, rij_id, omschrijving)
  values (v_lid, 'dienst_geruild', 'rol_slots', v_slot.id,
          format('dienst bij activiteit %s overgedragen van lid %s aan lid %s', v_act.id, v_lid, v_vervanger.id));

  return jsonb_build_object('rol_slot_id', v_slot.id, 'activiteit_id', v_act.id);
end
$$;

-- ===== 5. beschikbare_vervangers =====
-- Voorlichting, geen afdwinging: ruil_dienst toetst alles opnieuw. Alleen voor wie zelf een ruilbaar slot bij deze
-- (gepubliceerde, lopende) activiteit heeft; anders geen rijen, dus geen fout en geen verraad. Alleen de reden afgemeld
-- of al_ingedeeld, nooit de toelichting. Een SQL-functie, zoals contact_eindverantwoordelijke: in een plpgsql-functie met
-- returns table worden de kolomnamen variabelen en geeft elke onbekwalificeerde verwijzing "ambiguous".
create function public.beschikbare_vervangers(p_activiteit_id uuid)
returns table (lid_id uuid, voornaam text, achternaam text, beschikbaar boolean, reden text)
language sql stable security definer
set search_path = ''
as $$
  select l.id, l.voornaam, l.achternaam,
         (af.id is null and bz.id is null),
         case when af.id is not null then 'afgemeld' when bz.id is not null then 'al_ingedeeld' end
    from public.activiteiten a
    join public.leden l on l.actief and l.type = 'lid' and l.id <> intern.huidig_lid()
    left join public.afmeldingen af on af.activiteit_id = a.id and af.lid_id = l.id
    left join public.rol_slots bz on bz.activiteit_id = a.id and bz.bezetter_id = l.id
   where a.id = p_activiteit_id
     and a.status = 'gepubliceerd'
     and a.eindigt_om > clock_timestamp()
     and intern.lid_mag_zien(a.id, intern.huidig_lid())
     and intern.lid_mag_zien(a.id, l.id)
     and exists (
       select 1 from public.rol_slots s join public.roltypen r on r.code = s.rol_type
        where s.activiteit_id = a.id and s.bezetter_id = intern.huidig_lid() and r.ruilbaar_door_lid)
   order by l.achternaam, l.voornaam
$$;

-- ===== 6. mijn_diensten =====
-- security_invoker, en een eigen filter op lid_mag_zien: de policies laten een beheerder (aal2) alles zien, ook een
-- activiteit voor een groep waar hij niet in zit, en R22 zegt dat een lid die nergens ziet (DM-03, zoals mijn_activiteiten).
-- Alle eigen diensten van gepubliceerde activiteiten, komend en geweest; het scherm splitst op eindigt_om. Zonder de bak.
create view public.mijn_diensten with (security_invoker = true) as
  select s.id as rol_slot_id, s.activiteit_id, s.rol_type, r.ruilbaar_door_lid as ruilbaar, a.naam, a.datum, a.seizoen,
         a.verzameltijd, a.starttijd, a.eindtijd, a.locatie, a.begint_om, a.eindigt_om
    from public.rol_slots s
    join public.activiteiten a on a.id = s.activiteit_id
    join public.roltypen r on r.code = s.rol_type
   where s.bezetter_id = (select intern.huidig_lid())
     and s.rol_type <> 'bak'
     and a.status = 'gepubliceerd'
     and intern.lid_mag_zien(a.id, (select intern.huidig_lid()));

-- ===== Rechten =====
revoke all on function public.meld_af(uuid, text), public.trek_afmelding_in(uuid), public.ruil_dienst(uuid, uuid),
  public.beschikbare_vervangers(uuid) from public, anon;
grant execute on function public.meld_af(uuid, text), public.trek_afmelding_in(uuid), public.ruil_dienst(uuid, uuid),
  public.beschikbare_vervangers(uuid) to authenticated;
grant select on public.mijn_diensten to authenticated;
