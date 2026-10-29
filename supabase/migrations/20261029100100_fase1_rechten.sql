-- Fase 1, stap C: de hulpfuncties, de rechten per rij en per kolom, de view voor het welkomscherm en het vangnet
-- (docs/bouw/Datamodel-fase-1.md punt 1, 2, 3 en 6).
--
-- De hulpfuncties zijn security definer met eigenaar postgres: als security invoker roept de regel op activiteiten
-- zichzelf eindeloos aan (DM-18). Altijd met een lege search_path en volledig gekwalificeerde namen. Ze staan in het
-- schema intern, buiten de Data API (DM-01).

-- Het actieve lid bij deze sessie. Leeg voor iemand zonder lid, een uitgeschreven lid of een externe helper.
-- Alle regels gebruiken deze, nooit rechtstreeks auth.uid() (Bouwbesluiten 4.1).
create function intern.huidig_lid() returns uuid
language sql stable security definer
set search_path = ''
as $$
  select l.id
    from public.leden l
   where l.auth_user_id = (select auth.uid()) and l.actief and l.type = 'lid'
$$;

-- Beheerder: een lid met is_admin, een sessie met MFA (aal2), een geverifieerde factor van vóór beheerder_sinds en
-- géén geverifieerde factor van ná beheerder_sinds. Dat laatste omdat aal2 niet bewijst dat het de factor van het juiste
-- bestuurslid is: een aanvaller met de inloglink kan een tweede factor inschrijven (DM-09, DM-25). Een nieuwe factor
-- zet het beheer dus stil tot een andere beheerder beheerder_sinds opnieuw zet. Intrekken van is_admin werkt direct.
create function intern.is_beheerder() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.leden_prive p
     where p.lid_id = intern.huidig_lid()
       and p.is_admin
       and p.beheerder_sinds is not null
       and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
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

-- Mag dit lid de activiteit zien? Zonder lid nooit (DM-20). Zonder uitzondering voor de beheerder: het welkomscherm
-- van een beheerder is precies dat van een lid (DM-03). Gepubliceerd of geannuleerd, en geen doelgroep of het lid zit
-- in een van de groepen (R15, R22).
create function intern.lid_mag_zien(p_activiteit uuid, p_lid uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_lid is not null and exists (
    select 1
      from public.activiteiten a
     where a.id = p_activiteit
       and a.status in ('gepubliceerd', 'geannuleerd')
       and (
         not exists (select 1 from public.activiteit_groep ag where ag.activiteit_id = a.id)
         or exists (
           select 1
             from public.activiteit_groep ag
             join public.lid_groep lg on lg.groep_id = ag.groep_id
            where ag.activiteit_id = a.id and lg.lid_id = p_lid
         )
       )
  )
$$;

-- Aanwezigen (R1, R12, R22): actieve leden van type lid in de doelgroep, elk één keer, min de afmeldingen. Geen execute
-- voor authenticated; beheeroverzicht() en later meld_af() roepen hem aan.
create function intern.aantal_aanwezigen(p_activiteit uuid) returns int
language sql stable security definer
set search_path = ''
as $$
  select count(*)::int
    from public.leden l
   where l.actief and l.type = 'lid'
     and (
       not exists (select 1 from public.activiteit_groep ag where ag.activiteit_id = p_activiteit)
       or exists (
         select 1
           from public.activiteit_groep ag
           join public.lid_groep lg on lg.groep_id = ag.groep_id
          where ag.activiteit_id = p_activiteit and lg.lid_id = l.id
       )
     )
     and not exists (select 1 from public.afmeldingen af where af.activiteit_id = p_activiteit and af.lid_id = l.id)
$$;

-- Alleen wat de RLS-regels en de view nodig hebben. De tijdfuncties en aantal_aanwezigen krijgen authenticated niet.
revoke all on all functions in schema intern from public, anon, authenticated;
grant execute on function intern.huidig_lid(), intern.is_beheerder(), intern.lid_mag_zien(uuid, uuid)
  to authenticated;
grant execute on function intern.seizoen_van(date), intern.activiteit_begin(date, time),
  intern.activiteit_einde(date, time, time), intern.deadline_verstreken(timestamptz, timestamptz),
  intern.vandaag(timestamptz) to service_role;

-- Lezen: rechten per rij. Wie een sessie heeft maar geen actief lid is, leest niets (DM-02). Schrijven kan niemand
-- rechtstreeks; dat gaat via de functies in de volgende migratie.
create policy lid_leest on public.verenigingen for select to authenticated
  using ((select intern.huidig_lid()) is not null);
create policy lid_leest on public.verenigingsinstellingen for select to authenticated
  using ((select intern.huidig_lid()) is not null);
create policy lid_leest on public.roltypen for select to authenticated
  using ((select intern.huidig_lid()) is not null);
create policy lid_leest on public.groepen for select to authenticated
  using ((select intern.huidig_lid()) is not null);
create policy lid_leest on public.leden for select to authenticated
  using ((select intern.huidig_lid()) is not null);

create policy eigen_of_beheerder on public.leden_prive for select to authenticated
  using (lid_id = (select intern.huidig_lid()) or (select intern.is_beheerder()));
create policy eigen_of_beheerder on public.lid_groep for select to authenticated
  using (lid_id = (select intern.huidig_lid()) or (select intern.is_beheerder()));
create policy eigen_of_beheerder on public.afmeldingen for select to authenticated
  using (lid_id = (select intern.huidig_lid()) or (select intern.is_beheerder()));

-- Een beheerder ziet alles (ook concepten), een lid wat het mag zien (R15, R22). is_beheerder en huidig_lid staan als
-- (select …), zodat Postgres ze één keer per query uitrekent in plaats van per rij (DM-18, PR22-12).
create policy zichtbaar on public.activiteiten for select to authenticated
  using ((select intern.is_beheerder()) or intern.lid_mag_zien(id, (select intern.huidig_lid())));
create policy zichtbaar on public.activiteit_groep for select to authenticated
  using ((select intern.is_beheerder()) or intern.lid_mag_zien(activiteit_id, (select intern.huidig_lid())));
-- Lege plekken zijn voor leden onzichtbaar (R13); een beheerder ziet ze wel.
create policy zichtbaar on public.rol_slots for select to authenticated
  using (
    (select intern.is_beheerder())
    or (bezetter_id is not null and intern.lid_mag_zien(activiteit_id, (select intern.huidig_lid())))
  );

create policy alleen_beheerder on public.wijzigingen_log for select to authenticated
  using ((select intern.is_beheerder()));

-- Leesrechten op de tabellen. Op leden alleen vijf kolommen (DM-10): lees leden dus altijd met een kolomlijst; `select *`
-- en een embed leden(*) geven een fout. Eén goedbedoelde grant op de hele tabel zet alles open; de rechtentest bewaakt dat.
grant select on public.verenigingen, public.verenigingsinstellingen, public.roltypen, public.groepen,
  public.leden_prive, public.lid_groep, public.activiteit_groep, public.rol_slots, public.afmeldingen,
  public.wijzigingen_log to authenticated;
grant select (id, voornaam, achternaam, type, actief) on public.leden to authenticated;
-- Ook op activiteiten per kolom (PR22-13): zonder bron_activiteit_id, dat zou het id van een verborgen concept
-- verraden, en zonder vereniging_id. Lees activiteiten dus ook met een kolomlijst.
grant select (id, naam, datum, verzameltijd, starttijd, eindtijd, locatie, bus_vertrektijd, bus_locatie, notitie, type,
  seizoen, status, afmeld_deadline, min_aanwezigen, bak_actief, begint_om, eindigt_om, aangemaakt, bijgewerkt)
  on public.activiteiten to authenticated;

-- Het welkomscherm: de activiteiten die een lid zou zien, ook voor een beheerder (DM-03). security_invoker, zodat de
-- rechten van de aanroeper gelden. Mijn diensten (fase 3) gebruikt dezelfde view; de agenda-feed (fase 7) niet, want
-- die heeft geen sessie en gebruikt intern.lid_mag_zien() met het lid van het token (DM-24).
create view public.mijn_activiteiten with (security_invoker = true) as
  select a.id, a.naam, a.datum, a.verzameltijd, a.starttijd, a.eindtijd, a.locatie, a.bus_vertrektijd, a.bus_locatie,
         a.notitie, a.type, a.seizoen, a.status, a.afmeld_deadline, a.min_aanwezigen, a.bak_actief, a.begint_om,
         a.eindigt_om, a.aangemaakt, a.bijgewerkt
    from public.activiteiten a
   where intern.lid_mag_zien(a.id, (select intern.huidig_lid()));
grant select on public.mijn_activiteiten to authenticated;

-- Vangnet voor wie buiten de functies om schrijft (seed, SQL-editor, later de taken-Worker), met een eigen melding
-- zonder SQLSTATE BK001, zodat een test kan zien of de functie de regel toetst of alleen het vangnet (DM-23, DM-14).
create function intern.activiteit_vangnet() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'concept' then
      raise exception 'vangnet_alleen_concept';
    end if;
    return old;
  end if;

  -- De status gaat in één richting: concept, gepubliceerd, geannuleerd (of van een concept direct naar geannuleerd).
  if new.status is distinct from old.status
     and not (old.status = 'concept' and new.status in ('gepubliceerd', 'geannuleerd'))
     and not (old.status = 'gepubliceerd' and new.status = 'geannuleerd') then
    raise exception 'vangnet_status';
  end if;

  -- bijgewerkt alleen als een veld verandert dat leden zien; niet als alleen bron_activiteit_id leeg wordt omdat het
  -- bronconcept is verwijderd (DM-24). De gegenereerde kolommen zijn in een BEFORE-trigger nog niet berekend.
  if (to_jsonb(new) - 'bron_activiteit_id' - 'bijgewerkt' - 'aangemaakt' - 'seizoen' - 'begint_om' - 'eindigt_om')
     is distinct from
     (to_jsonb(old) - 'bron_activiteit_id' - 'bijgewerkt' - 'aangemaakt' - 'seizoen' - 'begint_om' - 'eindigt_om') then
    new.bijgewerkt := clock_timestamp();
  else
    new.bijgewerkt := old.bijgewerkt;
  end if;
  return new;
end
$$;

create trigger activiteit_vangnet_wijzigen before update on public.activiteiten
  for each row execute function intern.activiteit_vangnet();
create trigger activiteit_vangnet_verwijderen before delete on public.activiteiten
  for each row execute function intern.activiteit_vangnet();

-- beheerder_sinds volgt is_admin (PR22-08): de bescherming tegen een nieuwe MFA-factor (DM-25) mag niet aan een
-- handmatige stap hangen. Bij het aanzetten wordt het moment van nu gezet, bij het uitzetten wordt het leeggemaakt.
-- Een waarde die bij het aanmaken wordt meegegeven, blijft staan (de seed en de tests).
create function intern.beheerder_sinds_zetten() returns trigger
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
  return new;
end
$$;

create trigger beheerder_sinds_zetten before insert or update of is_admin on public.leden_prive
  for each row execute function intern.beheerder_sinds_zetten();

-- service_role is de sleutel van de seed, de tests en later de taken-Worker (op Cloudflare): hij mag geen tabel
-- leegmaken (truncate slaat de triggers over) en de auditlog niet wijzigen of wissen (PR22-07). Voor fase 7 komt er een
-- eigen rol met alleen de rechten die de dagmelding nodig heeft. Een tabel die later bijkomt, krijgt zijn eigen revoke;
-- de rechtentest controleert het.
revoke truncate on all tables in schema public from service_role;
revoke update, delete on public.wijzigingen_log from service_role;
