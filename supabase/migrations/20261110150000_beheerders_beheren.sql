-- Beheerders beheren in de app (10-11-2026).
--
-- Tot nu toe kon dat alleen met SQL door de bouwer (Beheerders.md). Het bestuur telt ongeveer tien beheerders en de
-- bevestiging van elkaars toegang hoort bij een andere beheerder: dezelfde regel als in is_beheerder() en beheerstatus(),
-- alleen nu met schermen. Dit bestand verandert die regels niet. Het voegt vijf functies toe die de handelingen van de
-- handleiding doen, met dezelfde controles die de handleiding een beheerder laat doen:
--
--   beheerders_lijst()                 wie is beheerder en hoe staat het met zijn app
--   beheerder_kandidaten()             wie kun je nog beheerder maken
--   beheerder_maken(lid)               is_admin aan (de trigger zet beheerder_sinds); wist eerdere apps
--   beheerder_bevestigen(lid, app)     beheerder_sinds opnieuw zetten, na controle van precies die app
--   beheerder_intrekken(lid)           is_admin uit; de apps van dat lid worden losgekoppeld
--
-- Alle vijf eisen een beheerder met een recente code (intern.is_beheerder()). De wijziging zelf komt in wijzigingen_log via
-- de bestaande triggers (beheer_aangezet, beheer_uitgezet, beheerder_sinds_gewijzigd), met de beheerder als door_lid_id.
--
-- Waarom de functies dit extra doen, boven wat de handleiding met SQL liet doen:
--   * maken wist bestaande apps van dat lid. Een app die er al staat, is "van vóór" beheerder_sinds en zou meteen tellen,
--     zonder dat iemand hem heeft bevestigd.
--   * bevestigen eist de app die de beheerder op het scherm zag (p_app_id). Stelt iemand intussen een tweede app in, dan
--     bevestig je niet per ongeluk een andere. Het eist ook precies één geverifieerde app en wist niet-geverifieerde
--     apps (Beheerders.md, "Bevestigen"): zo'n app zou na het bevestigen alsnog kunnen worden geverifieerd met een
--     aanmaakmoment van vóór de bevestiging.
--   * je kunt jezelf niet maken, bevestigen of intrekken. Daardoor blijft er altijd een beheerder over: de aanroeper.
--   * een advisory lock zet gelijktijdige wijzigingen achter elkaar, zodat twee beheerders elkaar niet tegelijk kunnen
--     intrekken en er niemand overblijft. De controle op beheerder-zijn gebeurt vóór én na de lock.

-- ===== wie is beheerder =====
-- Status per beheerder, uit dezelfde bronnen als is_beheerder():
--   wacht_op_app           is_admin, maar nog geen geverifieerde app
--   wacht_op_bevestiging   een geverifieerde app van ná beheerder_sinds: een andere beheerder moet bevestigen
--   beheerder              alle geverifieerde apps zijn van vóór beheerder_sinds
-- app_id, app_naam en app_ingesteld horen bij de nieuwste geverifieerde app.
create function public.beheerders_lijst() returns table (
  lid_id uuid,
  voornaam text,
  achternaam text,
  status text,
  beheerder_sinds timestamptz,
  app_id uuid,
  app_naam text,
  app_ingesteld timestamptz,
  aantal_apps integer,
  is_ik boolean
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
         case
           when a.aantal = 0 then 'wacht_op_app'
           when a.nieuwste >= p.beheerder_sinds then 'wacht_op_bevestiging'
           else 'beheerder'
         end,
         p.beheerder_sinds,
         a.id,
         a.naam,
         a.nieuwste,
         a.aantal,
         l.id = intern.huidig_lid()
    from public.leden l
    join public.leden_prive p on p.lid_id = l.id
    left join lateral (
      select count(*)::integer as aantal,
             max(f.created_at) as nieuwste,
             (array_agg(f.id order by f.created_at desc))[1] as id,
             (array_agg(f.friendly_name order by f.created_at desc))[1] as naam
        from auth.mfa_factors f
       where f.user_id = l.auth_user_id and f.status = 'verified'
    ) a on true
   where p.is_admin
     and p.beheerder_sinds is not null
   order by (a.aantal > 0 and a.nieuwste >= p.beheerder_sinds) desc, l.voornaam, l.achternaam;
end
$$;

-- ===== wie kun je beheerder maken =====
-- Actieve leden met een inlogaccount die nog geen beheerder zijn. Externe helpers hebben geen account en staan er dus niet.
create function public.beheerder_kandidaten() returns table (
  lid_id uuid,
  voornaam text,
  achternaam text
)
language plpgsql security definer
set search_path = ''
as $$
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;

  return query
  select l.id, l.voornaam, l.achternaam
    from public.leden l
    join public.leden_prive p on p.lid_id = l.id
   where l.type = 'lid' and l.actief and l.auth_user_id is not null and not p.is_admin
   order by l.voornaam, l.achternaam;
end
$$;

-- ===== beheerder maken =====
create function public.beheerder_maken(p_lid_id uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_lid public.leden%rowtype;
  v_admin boolean;
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  perform pg_advisory_xact_lock(hashtext('beheerders'));
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;

  select * into v_lid from public.leden where id = p_lid_id for update;
  if not found or v_lid.type <> 'lid' or not v_lid.actief then
    perform intern.fout('lid_onbekend');
  end if;
  if v_lid.auth_user_id is null then
    perform intern.fout('lid_geen_account');
  end if;
  select p.is_admin into v_admin from public.leden_prive p where p.lid_id = v_lid.id for update;
  if v_admin is null then
    perform intern.fout('lid_onbekend');
  end if;
  if v_admin then
    perform intern.fout('al_beheerder');
  end if;

  -- Eerdere apps weg: een app van vóór beheerder_sinds telt meteen als bevestigd.
  delete from auth.mfa_factors where user_id = v_lid.auth_user_id;
  -- De trigger beheerder_sinds_zetten zet beheerder_sinds en beheer_gewijzigd_loggen schrijft het spoor.
  update public.leden_prive set is_admin = true where lid_id = v_lid.id;

  return jsonb_build_object('voornaam', v_lid.voornaam, 'achternaam', v_lid.achternaam);
end
$$;

-- ===== toegang bevestigen =====
-- p_app_id is de app die de beheerder op het scherm zag (beheerders_lijst().app_id). Is die er niet meer, of is er intussen
-- een andere bijgekomen, dan gebeurt er niets en meldt de functie dat (app_gewijzigd).
create function public.beheerder_bevestigen(p_lid_id uuid, p_app_id uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_lid public.leden%rowtype;
  v_sinds timestamptz;
  v_admin boolean;
  v_aantal integer;
  v_app_id uuid;
  v_app_aangemaakt timestamptz;
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  perform pg_advisory_xact_lock(hashtext('beheerders'));
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  if p_lid_id = intern.huidig_lid() then
    perform intern.fout('zelf');
  end if;

  select * into v_lid from public.leden where id = p_lid_id for update;
  if not found or v_lid.auth_user_id is null then
    perform intern.fout('lid_onbekend');
  end if;
  select p.is_admin, p.beheerder_sinds into v_admin, v_sinds
    from public.leden_prive p where p.lid_id = v_lid.id for update;
  if not coalesce(v_admin, false) or v_sinds is null then
    perform intern.fout('geen_beheerder');
  end if;

  select count(*), (array_agg(f.id))[1], max(f.created_at) into v_aantal, v_app_id, v_app_aangemaakt
    from auth.mfa_factors f where f.user_id = v_lid.auth_user_id and f.status = 'verified';
  if v_aantal = 0 then
    perform intern.fout('niets_te_bevestigen');
  end if;
  if v_aantal > 1 then
    perform intern.fout('app_onduidelijk', jsonb_build_object('aantal', v_aantal));
  end if;
  if v_app_id is distinct from p_app_id then
    perform intern.fout('app_gewijzigd');
  end if;
  if v_app_aangemaakt < v_sinds then
    perform intern.fout('niets_te_bevestigen');
  end if;

  -- Een niet-geverifieerde app kan later nog worden geverifieerd, met een aanmaakmoment van vóór de bevestiging.
  delete from auth.mfa_factors where user_id = v_lid.auth_user_id and status <> 'verified';
  update public.leden_prive set beheerder_sinds = clock_timestamp() where lid_id = v_lid.id;

  return jsonb_build_object('voornaam', v_lid.voornaam, 'achternaam', v_lid.achternaam);
end
$$;

-- ===== beheerrechten intrekken =====
create function public.beheerder_intrekken(p_lid_id uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_lid public.leden%rowtype;
  v_admin boolean;
begin
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  perform pg_advisory_xact_lock(hashtext('beheerders'));
  if not intern.is_beheerder() then
    perform intern.fout('geen_admin');
  end if;
  if p_lid_id = intern.huidig_lid() then
    perform intern.fout('zelf');
  end if;

  select * into v_lid from public.leden where id = p_lid_id for update;
  if not found then
    perform intern.fout('lid_onbekend');
  end if;
  select p.is_admin into v_admin from public.leden_prive p where p.lid_id = v_lid.id for update;
  if not coalesce(v_admin, false) then
    perform intern.fout('geen_beheerder');
  end if;

  -- De trigger zet beheerder_sinds leeg en schrijft het spoor. Apps los: wie weer beheerder wordt, begint opnieuw.
  update public.leden_prive set is_admin = false where lid_id = v_lid.id;
  if v_lid.auth_user_id is not null then
    delete from auth.mfa_factors where user_id = v_lid.auth_user_id;
  end if;

  return jsonb_build_object('voornaam', v_lid.voornaam, 'achternaam', v_lid.achternaam);
end
$$;

revoke all on function public.beheerders_lijst() from public, anon;
revoke all on function public.beheerder_kandidaten() from public, anon;
revoke all on function public.beheerder_maken(uuid) from public, anon;
revoke all on function public.beheerder_bevestigen(uuid, uuid) from public, anon;
revoke all on function public.beheerder_intrekken(uuid) from public, anon;
grant execute on function public.beheerders_lijst() to authenticated;
grant execute on function public.beheerder_kandidaten() to authenticated;
grant execute on function public.beheerder_maken(uuid) to authenticated;
grant execute on function public.beheerder_bevestigen(uuid, uuid) to authenticated;
grant execute on function public.beheerder_intrekken(uuid) to authenticated;
