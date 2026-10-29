-- Stap D: MFA voor het bestuur (besluiten 29-10-2026).
--
-- 1. Beheer vraagt elke 12 uur een nieuwe code.
-- 2. Eén plek die zegt hoe het met iemands beheertoegang staat, voor de app: public.beheerstatus().

-- aal2 zegt dat de sessie ooit een code heeft ingevoerd; een ververst token behoudt dat voor altijd, zolang de sessie
-- bestaat. Een gestolen telefoon of cookie zou dus onbeperkt beheer geven. GoTrue zet bij elke stap van de inlog in het
-- token een regel in `amr` met de methode en het tijdstip (`{"method": "totp", "timestamp": 1793285432}`) en houdt die
-- na verversen vast (lokaal nagegaan, stap D). Beheer eist daarom een totp-stap die aan drie voorwaarden voldoet:
--   1. hooguit 12 uur geleden;
--   2. niet uit de toekomst (een minuut marge voor klokverschil): dat kan GoTrue niet maken, maar een token met een
--      vreemde `amr` (een toekomstige custom access token hook) mag geen eeuwig beheer geven;
--   3. van ná het aanmaken van de geldende app (review PR23-01). Anders blijft de code van een gestolen sessie gelden
--      nadat de app is vervangen: de sessie van de dief heeft dan nog een code van vóór de nieuwe app.
-- `jsonpath` in lax-modus met `silent`: een token zonder `amr` of met een rare vorm geeft geen treffer (dus geen
-- beheer) in plaats van een fout. Lax-modus pakt wel lijsten uit (`"timestamp": [nu]` telt), maar GoTrue ondertekent het
-- token, dus dat komt alleen met een eigen hook voor. De 12 uur staat ook in de app (src/lib/mfa.ts); een test houdt
-- de twee gelijk.
create or replace function intern.code_recent() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
    and jsonb_path_exists(
      (select auth.jwt()),
      '$.amr[*] ? (@.method == "totp" && @.timestamp > $grens && @.timestamp >= $app && @.timestamp <= $nu)',
      jsonb_build_object(
        'grens', extract(epoch from now())::bigint - 12 * 3600,
        'app', (
          select floor(extract(epoch from max(f.created_at)))::bigint
            from auth.mfa_factors f
           where f.user_id = (select auth.uid()) and f.status = 'verified'
        ),
        'nu', extract(epoch from now())::bigint + 60
      ),
      true
    ),
    false
  )
$$;

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

-- Hoe staat het met de beheertoegang van wie nu is ingelogd? De app stuurt hiermee naar het goede scherm. De regels
-- staan hier, naast is_beheerder(), en niet nog een keer in de app: zo kunnen ze niet uiteenlopen (een test eist dat
-- 'ok' precies is_beheerder() is).
--   geen_lid             geen actief lid
--   geen_beheerder       lid, maar geen is_admin
--   mfa_instellen        beheerder zonder geverifieerde app
--   wacht_op_bevestiging een geverifieerde app van ná beheerder_sinds: een andere beheerder moet beheerder_sinds
--                        opnieuw zetten (DM-25). Zo kan niemand met alleen een mailbox zichzelf beheer geven.
--   code_nodig           app ingesteld en bevestigd, maar de sessie heeft geen (recente) code
--   ok                   beheer
create function public.beheerstatus() returns text
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
  if exists (
    select 1 from auth.mfa_factors f
     where f.user_id = (select auth.uid()) and f.status = 'verified' and f.created_at >= v_sinds
  ) then
    return 'wacht_op_bevestiging';
  end if;
  if intern.code_recent() is not true then return 'code_nodig'; end if;
  return 'ok';
end
$$;

revoke all on function public.beheerstatus() from public, anon;
grant execute on function public.beheerstatus() to authenticated;
