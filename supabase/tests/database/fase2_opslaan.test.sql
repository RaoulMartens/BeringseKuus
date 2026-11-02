-- Databasetests fase 2: indelen en publiceren (docs/bouw/Datamodel-fase-2.md): de versie, toewijzen en leegmaken,
-- de eindtoestand (dubbelboeking, doelgroep), publiceren, niet-open activiteiten, bijgewerkt, en de twee leesfuncties.
-- Draaien met: npm run test:db. Alles in één transactie die wordt teruggedraaid. Eigen namen ("T ..."); alleen de laatste
-- controle kijkt naar de seed.

begin;
create extension if not exists pgtap with schema extensions;
select plan(87);

-- ===== Hulpen (alleen in deze transactie) =====
create temp table gebruikers (naam text primary key, uid uuid not null, lid uuid);

create function pg_temp.maak(p_naam text, p_admin boolean default false) returns void
language plpgsql
as $$
declare
  v_uid uuid := gen_random_uuid();
  v_lid uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_naam || '@example.com', now(), now());
  insert into public.leden (auth_user_id, voornaam, achternaam, type) values (v_uid, p_naam, 'Test', 'lid')
  returning id into v_lid;
  insert into public.leden_prive (lid_id, email, is_admin, beheerder_sinds)
  values (v_lid, p_naam || '@example.com', p_admin, case when p_admin then timestamptz '2026-06-01' end);
  if p_admin then
    insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
    values (gen_random_uuid(), v_uid, 'totp', 'verified', timestamptz '2026-05-01', timestamptz '2026-05-01');
  end if;
  insert into pg_temp.gebruikers values (p_naam, v_uid, v_lid);
end
$$;

create function pg_temp.als(p_naam text, p_aal text default 'aal1', p_leeftijd interval default interval '1 minute')
returns void
language sql
as $$
  select set_config('request.jwt.claims',
    (json_build_object('sub', (select uid from pg_temp.gebruikers where naam = p_naam),
                       'role', 'authenticated', 'aal', p_aal)::jsonb
     || jsonb_build_object('amr',
          jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint))
          || case when p_aal = 'aal2' and p_leeftijd is not null
                  then jsonb_build_array(jsonb_build_object('method', 'totp',
                         'timestamp', extract(epoch from now() - p_leeftijd)::bigint))
                  else '[]'::jsonb end))::text, true)
$$;

-- Een lid zonder inlogaccount; telefoon optioneel.
create function pg_temp.lid(p_naam text, p_type text default 'lid', p_actief boolean default true,
                            p_telefoon text default null) returns uuid
language plpgsql
as $$
declare v_lid uuid;
begin
  insert into public.leden (voornaam, achternaam, type, actief) values (p_naam, 'Test', p_type, p_actief)
  returning id into v_lid;
  insert into public.leden_prive (lid_id, email, telefoon) values (v_lid, p_naam || '@example.com', p_telefoon);
  return v_lid;
end
$$;

-- Aanroepen als de beheerder, met de actuele versie (tenzij er een wordt meegegeven). t_os geeft het resultaat, t_oz de
-- foutcode met detail als tekst ("geen fout" als het lukt); een fout rolt alleen die aanroep terug.
create function public.t_os(p_id uuid, p_velden text, p_wijz text, p_publ boolean default false) returns jsonb
language sql
as $$
  select public.activiteit_opslaan(p_id, p_velden::jsonb, p_wijz::jsonb, p_publ,
                                   (select a.versie from public.activiteiten a where a.id = p_id))
$$;
create function public.t_oz(p_id uuid, p_velden text, p_wijz text, p_publ boolean default false, p_versie int default null)
returns text
language plpgsql
as $$
declare v_msg text; v_detail text;
begin
  perform public.activiteit_opslaan(p_id, p_velden::jsonb, p_wijz::jsonb, p_publ,
    coalesce(p_versie, (select a.versie from public.activiteiten a where a.id = p_id)));
  return 'geen fout';
exception when others then
  get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
  return v_msg || ' ' || coalesce(v_detail, '');
end
$$;
create function public.t_v(p_id uuid) returns int language sql as $$ select versie from public.activiteiten where id = p_id $$;
grant execute on function public.t_os(uuid, text, text, boolean), public.t_oz(uuid, text, text, boolean, int),
  public.t_v(uuid) to authenticated;

-- ===== De seed: elke gepubliceerde activiteit heeft een eindverantwoordelijke met telefoonnummer (R21) =====
select is_empty(
  $$ select a.naam from public.activiteiten a
      where a.status = 'gepubliceerd' and a.naam not like 'T %'
        and not exists (select 1 from public.rol_slots s join public.leden_prive p on p.lid_id = s.bezetter_id
                         where s.activiteit_id = a.id and s.rol_type = 'eindverantwoordelijke'
                           and nullif(btrim(p.telefoon), '') is not null) $$,
  'seed: elke gepubliceerde activiteit heeft een eindverantwoordelijke met een telefoonnummer');

-- ===== Leden en groepen =====
select pg_temp.maak('t_mark', true);
select pg_temp.maak('t_truus');
select set_config('test.l_ev', pg_temp.lid('t_ev', 'lid', true, '06 11 11 11 11')::text, true);
select set_config('test.l_leeg', pg_temp.lid('t_leeg', 'lid', true, '   ')::text, true);
select set_config('test.l_een', pg_temp.lid('t_een')::text, true);
select set_config('test.l_twee', pg_temp.lid('t_twee')::text, true);
select set_config('test.l_drie', pg_temp.lid('t_drie')::text, true);
select set_config('test.l_ext', pg_temp.lid('t_ext', 'extern')::text, true);
select set_config('test.l_inactief', pg_temp.lid('t_inactief', 'lid', false)::text, true);
select set_config('test.g_bestuur', (select id::text from public.groepen where naam = 'Bestuur'), true);
select set_config('test.g_dames', (select id::text from public.groepen where naam = 'Dames'), true);
insert into public.lid_groep (lid_id, groep_id) values
  (current_setting('test.l_een')::uuid, current_setting('test.g_bestuur')::uuid),
  (current_setting('test.l_ev')::uuid, current_setting('test.g_bestuur')::uuid),
  (current_setting('test.l_twee')::uuid, current_setting('test.g_dames')::uuid);

-- ===== Aanmaken en de versie =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select set_config('test.r',
  public.activiteit_opslaan(null, '{"naam": "T V", "datum": "2099-05-01"}', '[]')::text, true);
reset role;
select set_config('test.act', current_setting('test.r')::jsonb ->> 'activiteit_id', true);
select set_config('test.ev', current_setting('test.r')::jsonb -> 'plekken' ->> 'eindverantwoordelijke', true);
select is((current_setting('test.r')::jsonb ->> 'versie')::int, 1, 'aanmaken: het antwoord bevat versie 1');
select is((select rol_type from public.rol_slots where id = current_setting('test.ev')::uuid), 'eindverantwoordelijke',
  'aanmaken: de plek eindverantwoordelijke staat in het antwoord onder "eindverantwoordelijke"');
select is(public.t_v(current_setting('test.act')::uuid), 1, 'een nieuwe activiteit heeft versie 1');

set local role authenticated;
select alike(public.t_oz(null, '{"naam": "T X", "datum": "2099-01-01"}', '[]', false, 1), 'veld_ongeldig%verwachte_versie%',
  'aanmaken met een versie: veld_ongeldig (het id is vermoedelijk kwijt)');
select throws_ok(format($f$ select public.activiteit_opslaan(%L::uuid, '{"notitie": "a"}', '[]') $f$, current_setting('test.act')),
  'BK001', 'veld_ontbreekt', 'een bestaande activiteit zonder versie: veld_ontbreekt');
select alike(public.t_oz(current_setting('test.act')::uuid, '{"notitie": "a"}', '[]', false, 2), 'versie_verouderd%"versie": 1%',
  'een versie die niet de actuele is: versie_verouderd met de actuele versie');
reset role;
select is((select notitie from public.activiteiten where id = current_setting('test.act')::uuid), null,
  'versie_verouderd laat alles ongewijzigd');

-- Een wijziging verhoogt de versie met 1 en zet bijgewerkt (leden zien een veld).
select set_config('test.bijgewerkt', (select bijgewerkt::text from public.activiteiten where id = current_setting('test.act')::uuid), true);
select set_config('test.log', (select count(*)::text from public.wijzigingen_log), true);
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is((public.t_os(current_setting('test.act')::uuid, '{"notitie": "Zaal klaar"}', '[]') ->> 'versie')::int, 2,
  'een veld wijzigen: versie 2 in het antwoord');
reset role;
select is(public.t_v(current_setting('test.act')::uuid), 2, 'en in de database');
select isnt((select bijgewerkt::text from public.activiteiten where id = current_setting('test.act')::uuid),
  current_setting('test.bijgewerkt'), 'bijgewerkt is veranderd: leden zien de notitie');
select is((select count(*)::int from public.wijzigingen_log where actie = 'activiteit_gewijzigd' and omschrijving like '%notitie%'), 1,
  'één logregel met de veldnaam');

-- Dezelfde waarde nog een keer: geen wijziging, dus geen versie, geen log, geen bijgewerkt.
select set_config('test.bijgewerkt', (select bijgewerkt::text from public.activiteiten where id = current_setting('test.act')::uuid), true);
select set_config('test.log', (select count(*)::text from public.wijzigingen_log), true);
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is((public.t_os(current_setting('test.act')::uuid, '{"notitie": "Zaal klaar", "naam": "T V"}', '[]') ->> 'versie')::int, 2,
  'dezelfde waarden opnieuw opslaan: de versie blijft 2');
reset role;
select is((select count(*)::text from public.wijzigingen_log), current_setting('test.log'), 'en er is niets gelogd');
select is((select bijgewerkt::text from public.activiteiten where id = current_setting('test.act')::uuid),
  current_setting('test.bijgewerkt'), 'en bijgewerkt is gelijk');

-- Alleen de versie wijzigen (buiten de functie) raakt bijgewerkt niet.
update public.activiteiten set versie = versie + 1 where id = current_setting('test.act')::uuid;
select is((select bijgewerkt::text from public.activiteiten where id = current_setting('test.act')::uuid),
  current_setting('test.bijgewerkt'), 'versie alleen verandert bijgewerkt niet');
update public.activiteiten set versie = 2 where id = current_setting('test.act')::uuid;

-- Een lege plek erbij: versie omhoog, maar bijgewerkt blijft staan (leden zien lege plekken niet, R13).
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select set_config('test.r', public.t_os(current_setting('test.act')::uuid, '{}',
  '[{"handeling": "plek_toevoegen", "rol_type": "werker", "tijdelijk_id": "w1"},
    {"handeling": "plek_toevoegen", "rol_type": "werker", "tijdelijk_id": "w2"},
    {"handeling": "plek_toevoegen", "rol_type": "bob", "tijdelijk_id": "b1"}]')::text, true);
reset role;
select set_config('test.w1', current_setting('test.r')::jsonb -> 'plekken' ->> 'w1', true);
select set_config('test.w2', current_setting('test.r')::jsonb -> 'plekken' ->> 'w2', true);
select set_config('test.b1', current_setting('test.r')::jsonb -> 'plekken' ->> 'b1', true);
select is(public.t_v(current_setting('test.act')::uuid), 3, 'plekken erbij: de versie gaat één keer omhoog, niet per plek');
select is((select bijgewerkt::text from public.activiteiten where id = current_setting('test.act')::uuid),
  current_setting('test.bijgewerkt'), 'en bijgewerkt blijft staan');

-- ===== Toewijzen =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select set_config('test.r', public.t_os(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": null}]',
         current_setting('test.w1'), current_setting('test.l_een')))::text, true);
reset role;
select is((current_setting('test.r')::jsonb ->> 'versie')::int, 4, 'toewijzen: versie 4');
select is((select bezetter_id from public.rol_slots where id = current_setting('test.w1')::uuid), current_setting('test.l_een')::uuid,
  'de plek is bezet door het lid');
select isnt((select bijgewerkt::text from public.activiteiten where id = current_setting('test.act')::uuid),
  current_setting('test.bijgewerkt'), 'een bezetting verandert bijgewerkt (leden zien het)');
select is((select count(*)::int from public.wijzigingen_log where actie = 'plek_toegewezen' and omschrijving like 't_een Test%werker%'), 1,
  'het toewijzen is gelogd, met naam en rol');

-- Wie er al zit toewijzen is geen wijziging.
select set_config('test.log', (select count(*)::text from public.wijzigingen_log), true);
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is((public.t_os(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": "%s"}]',
         current_setting('test.w1'), current_setting('test.l_een'), current_setting('test.l_een'))) ->> 'versie')::int, 4,
  'de zittende bezetter toewijzen: de versie blijft 4');
reset role;
select is((select count(*)::text from public.wijzigingen_log), current_setting('test.log'), 'en er is niets gelogd');

-- De controles per toewijzing.
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select alike(public.t_oz(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": null}]',
         current_setting('test.w1'), current_setting('test.l_twee'))), 'slot_gewijzigd%',
  'de plek is bezet terwijl de beheerder een lege verwachtte: slot_gewijzigd');
select alike(public.t_oz(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s"}]',
         current_setting('test.w2'), current_setting('test.l_twee'))), 'wijziging_ongeldig%',
  'zonder verwachte_bezetter: wijziging_ongeldig');
select alike(public.t_oz(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": null}]',
         current_setting('test.w2'), current_setting('test.l_inactief'))), 'lid_inactief%',
  'een inactief lid: lid_inactief');
select alike(public.t_oz(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": null}]',
         current_setting('test.w2'), gen_random_uuid())), 'lid_inactief%',
  'een onbekend lid: ook lid_inactief');
select alike(public.t_oz(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": null}]',
         current_setting('test.b1'), current_setting('test.l_ext'))), 'extern_niet_toegestaan%',
  'een externe helper op BOB: extern_niet_toegestaan');
select alike(public.t_oz(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": null}]',
         current_setting('test.ev'), current_setting('test.l_ext'))), 'extern_niet_toegestaan%',
  'een externe helper als eindverantwoordelijke: extern_niet_toegestaan');
select is(public.t_oz(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": null}]',
         current_setting('test.w2'), current_setting('test.l_ext'))), 'geen fout',
  'een externe helper als werker mag (R17)');
select alike(public.t_oz(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": null}]',
         gen_random_uuid(), current_setting('test.l_twee'))), 'plek_onbekend%',
  'een plek die er niet is: plek_onbekend');
reset role;

-- Afgemeld (seed van de fase-3 tabel): blokkeren.
insert into public.afmeldingen (activiteit_id, lid_id, toelichting)
values (current_setting('test.act')::uuid, current_setting('test.l_twee')::uuid, 'Verzonnen reden');
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select alike(public.t_oz(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": null}]',
         current_setting('test.b1'), current_setting('test.l_twee'))), 'lid_afgemeld%',
  'een lid dat zich heeft afgemeld: lid_afgemeld');
reset role;

-- De bak is niet ondersteund in fase 2 (beslissing 2.4).
insert into public.rol_slots (activiteit_id, rol_type, plek_label, volgorde)
values (current_setting('test.act')::uuid, 'bak', 'prins', 90);
select set_config('test.bak', (select id::text from public.rol_slots where activiteit_id = current_setting('test.act')::uuid and rol_type = 'bak'), true);
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select alike(public.t_oz(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": null}]',
         current_setting('test.bak'), current_setting('test.l_drie'))), 'niet_ondersteund%',
  'een plek in de bak toewijzen: niet_ondersteund');
select alike(public.t_oz(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "plek_weghalen", "rol_slot_id": "%s"}]', current_setting('test.bak'))), 'niet_ondersteund%',
  'een plek in de bak weghalen: niet_ondersteund');
reset role;

-- ===== Leegmaken, "eraf halen", wisselen, dubbelboeking, alles of niets =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select alike(public.t_oz(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "leegmaken", "rol_slot_id": "%s", "verwachte_bezetter": "%s"}]',
         current_setting('test.w1'), current_setting('test.l_twee'))), 'slot_gewijzigd%',
  'leegmaken met een andere bezetter dan verwacht: slot_gewijzigd');
select alike(public.t_oz(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "leegmaken", "rol_slot_id": "%s", "verwachte_bezetter": null}]', current_setting('test.w1'))),
  'wijziging_ongeldig%', 'leegmaken zonder verwachte bezetter (null): wijziging_ongeldig');
select alike(public.t_oz(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "plek_weghalen", "rol_slot_id": "%s"}]', current_setting('test.w1'))), 'plek_niet_leeg%',
  'een bezette plek weghalen zonder eerst leeg te maken: plek_niet_leeg');
-- Eraf halen = leegmaken en daarna weghalen, in één aanroep.
select is(public.t_oz(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "leegmaken", "rol_slot_id": "%s", "verwachte_bezetter": "%s"},
          {"handeling": "plek_weghalen", "rol_slot_id": "%s"}]',
         current_setting('test.w1'), current_setting('test.l_een'), current_setting('test.w1'))), 'geen fout',
  'eraf halen: leegmaken en plek weghalen in één aanroep');
reset role;
select is((select count(*)::int from public.rol_slots where id = current_setting('test.w1')::uuid), 0, 'de plek is weg');
select is((select count(*)::int from public.wijzigingen_log where actie = 'plek_leeggemaakt' and omschrijving like 't_een Test van werker%'), 1,
  'het leegmaken is gelogd');

-- Twee bezette plekken voor het wisselen.
insert into public.rol_slots (activiteit_id, rol_type, volgorde, bezetter_id) values
  (current_setting('test.act')::uuid, 'drankhaler', 91, current_setting('test.l_een')::uuid),
  (current_setting('test.act')::uuid, 'fotograaf', 92, current_setting('test.l_drie')::uuid);
select set_config('test.pa', (select id::text from public.rol_slots where activiteit_id = current_setting('test.act')::uuid and rol_type = 'drankhaler'), true);
select set_config('test.pb', (select id::text from public.rol_slots where activiteit_id = current_setting('test.act')::uuid and rol_type = 'fotograaf'), true);
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select alike(public.t_oz(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": "%s"}]',
         current_setting('test.pb'), current_setting('test.l_een'), current_setting('test.l_drie'))), 'dubbelboeking%',
  'een lid op twee plekken: dubbelboeking, met de lid-id');
select is(public.t_oz(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": "%s"},
          {"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": "%s"}]',
         current_setting('test.pa'), current_setting('test.l_drie'), current_setting('test.l_een'),
         current_setting('test.pb'), current_setting('test.l_een'), current_setting('test.l_drie'))), 'geen fout',
  'wisselen tussen twee plekken slaagt (de eindtoestand telt)');
-- Nog een keer terug wisselen in dezelfde transactie: de constraint blijft deferred, dus geen kale databasefout.
select is(public.t_oz(current_setting('test.act')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": "%s"},
          {"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": "%s"}]',
         current_setting('test.pa'), current_setting('test.l_een'), current_setting('test.l_drie'),
         current_setting('test.pb'), current_setting('test.l_drie'), current_setting('test.l_een'))), 'geen fout',
  'en weer terug wisselen in dezelfde transactie slaagt ook');
-- Alles of niets: een fout in de laatste regel laat de eerste ongedaan.
select alike(public.t_oz(current_setting('test.act')::uuid, '{"notitie": "Niet bewaard"}',
  format('[{"handeling": "leegmaken", "rol_slot_id": "%s", "verwachte_bezetter": "%s"},
          {"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": null}]',
         current_setting('test.pa'), current_setting('test.l_een'), gen_random_uuid(), current_setting('test.l_twee'))),
  'plek_onbekend%', 'een fout in de laatste regel');
reset role;
select is((select bezetter_id from public.rol_slots where id = current_setting('test.pa')::uuid), current_setting('test.l_een')::uuid,
  'alles of niets: het leegmaken ervoor is niet doorgegaan');
select is((select notitie from public.activiteiten where id = current_setting('test.act')::uuid), 'Zaal klaar',
  'en de velden ook niet');

-- Een lid dat een handeling probeert: geen_admin.
select pg_temp.als('t_truus', 'aal1');
set local role authenticated;
select throws_ok(format($f$ select public.activiteit_opslaan(%L::uuid, '{}', '[]', false, 1) $f$, current_setting('test.act')),
  'BK001', 'geen_admin', 'een lid: activiteit_opslaan geeft geen_admin');
reset role;

-- ===== Doelgroep =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select set_config('test.r', public.activiteit_opslaan(null,
  format('{"naam": "T D", "datum": "2099-06-01", "groepen": ["%s"]}', current_setting('test.g_bestuur'))::jsonb,
  '[{"handeling": "plek_toevoegen", "rol_type": "werker", "tijdelijk_id": "d1"}]')::text, true);
reset role;
select set_config('test.dact', current_setting('test.r')::jsonb ->> 'activiteit_id', true);
select set_config('test.d1', current_setting('test.r')::jsonb -> 'plekken' ->> 'd1', true);
select is((select count(*)::int from public.activiteit_groep where activiteit_id = current_setting('test.dact')::uuid), 1,
  'aanmaken met een doelgroep: de groep staat er');
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select alike(public.t_oz(current_setting('test.dact')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": null}]',
         current_setting('test.d1'), current_setting('test.l_twee'))), 'lid_buiten_doelgroep%',
  'een lid buiten de doelgroep toewijzen: lid_buiten_doelgroep');
select is(public.t_oz(current_setting('test.dact')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": null}]',
         current_setting('test.d1'), current_setting('test.l_ext'))), 'geen fout',
  'een externe helper valt buiten de doelgroep-toets');
select is(public.t_oz(current_setting('test.dact')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": "%s"}]',
         current_setting('test.d1'), current_setting('test.l_een'), current_setting('test.l_ext'))), 'geen fout',
  'een lid in de doelgroep toewijzen slaagt');
select alike(public.t_oz(current_setting('test.dact')::uuid, format('{"groepen": ["%s"]}', current_setting('test.g_dames')), '[]'),
  'doelgroep_conflict%' || current_setting('test.l_een') || '%',
  'de groepen wijzigen terwijl een ingedeeld lid toegang verliest: doelgroep_conflict met zijn id');
select is(public.t_oz(current_setting('test.dact')::uuid, format('{"groepen": ["%s"]}', current_setting('test.g_dames')),
  format('[{"handeling": "leegmaken", "rol_slot_id": "%s", "verwachte_bezetter": "%s"}]',
         current_setting('test.d1'), current_setting('test.l_een'))), 'geen fout',
  'eerst leegmaken en de groepen wijzigen in dezelfde aanroep slaagt');
reset role;
select is((select count(*)::int from public.activiteit_groep where activiteit_id = current_setting('test.dact')::uuid
            and groep_id = current_setting('test.g_dames')::uuid), 1, 'de nieuwe doelgroep staat er');
-- Een schending die er al was blokkeert een opslag zonder groepen niet.
update public.rol_slots set bezetter_id = current_setting('test.l_een')::uuid where id = current_setting('test.d1')::uuid;
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is(public.t_oz(current_setting('test.dact')::uuid, '{"notitie": "Los van de groepen"}', '[]'), 'geen fout',
  'een bestaande schending (lid uit de groep gehaald) blokkeert een opslag zonder groepen niet');
reset role;

-- ===== Publiceren =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select set_config('test.r', public.activiteit_opslaan(null, '{"naam": "T P", "datum": "2099-07-01"}', '[]')::text, true);
reset role;
select set_config('test.pact', current_setting('test.r')::jsonb ->> 'activiteit_id', true);
select set_config('test.pev', current_setting('test.r')::jsonb -> 'plekken' ->> 'eindverantwoordelijke', true);
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select alike(public.t_oz(current_setting('test.pact')::uuid, '{}', '[]', true),
  'publiceren_niet_mogelijk%starttijd%eindtijd%locatie%eindverantwoordelijke%',
  'publiceren zonder tijden, locatie en eindverantwoordelijke: alles staat in de lijst');
select alike(public.t_oz(current_setting('test.pact')::uuid,
  '{"starttijd": "20:00", "eindtijd": "23:00", "locatie": "De Kuus"}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": null}]',
         current_setting('test.pev'), current_setting('test.l_leeg')), true),
  'publiceren_niet_mogelijk%telefoon_eindverantwoordelijke%',
  'een eindverantwoordelijke met alleen spaties als nummer telt als zonder telefoon');
reset role;
select is((select status from public.activiteiten where id = current_setting('test.pact')::uuid), 'concept',
  'een geweigerde publicatie laat de activiteit een concept');
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is(public.t_oz(current_setting('test.pact')::uuid,
  '{"starttijd": "20:00", "eindtijd": "23:00", "locatie": "De Kuus"}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": null}]',
         current_setting('test.pev'), current_setting('test.l_ev')), true), 'geen fout',
  'publiceren met tijden, locatie en een eindverantwoordelijke met telefoon slaagt');
reset role;
select is((select status from public.activiteiten where id = current_setting('test.pact')::uuid), 'gepubliceerd', 'de activiteit is gepubliceerd');
select is((select count(*)::int from public.wijzigingen_log where actie = 'activiteit_gepubliceerd' and omschrijving like 'T P%'), 1,
  'het publiceren is gelogd');
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select alike(public.t_oz(current_setting('test.pact')::uuid, '{}', '[]', true), 'alleen_concept%',
  'een al gepubliceerde activiteit nog eens publiceren: alleen_concept');
-- Een gepubliceerde activiteit wijzigen mag, en de eindverantwoordelijke blijft verplicht (R21).
select is(public.t_oz(current_setting('test.pact')::uuid, '{"locatie": "Elders"}', '[]'), 'geen fout',
  'een gepubliceerde activiteit wijzigen mag');
select alike(public.t_oz(current_setting('test.pact')::uuid, '{"eindtijd": null}', '[]'), 'veld_ontbreekt%eindtijd%',
  'bij een gepubliceerde activiteit mag de eindtijd niet leeg');
select alike(public.t_oz(current_setting('test.pact')::uuid, '{}',
  format('[{"handeling": "leegmaken", "rol_slot_id": "%s", "verwachte_bezetter": "%s"}]',
         current_setting('test.pev'), current_setting('test.l_ev'))), 'eindverantwoordelijke_verplicht%leeg%',
  'de eindverantwoordelijke van een gepubliceerde activiteit leegmaken: eindverantwoordelijke_verplicht');
select alike(public.t_oz(current_setting('test.pact')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": "%s"}]',
         current_setting('test.pev'), current_setting('test.l_leeg'), current_setting('test.l_ev'))),
  'eindverantwoordelijke_verplicht%telefoon%',
  'vervangen door iemand zonder telefoon: eindverantwoordelijke_verplicht met reden telefoon');
select alike(public.t_oz(current_setting('test.pact')::uuid, '{}',
  format('[{"handeling": "plek_weghalen", "rol_slot_id": "%s"}]', current_setting('test.pev'))),
  'eindverantwoordelijke_verplicht%', 'de plek eindverantwoordelijke weghalen: eindverantwoordelijke_verplicht');
reset role;
-- De eindverantwoordelijke rechtstreeks vervangen door iemand mét telefoon kan wel.
update public.leden_prive set telefoon = '06 22 22 22 22' where lid_id = current_setting('test.l_een')::uuid;
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is(public.t_oz(current_setting('test.pact')::uuid, '{}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": "%s"}]',
         current_setting('test.pev'), current_setting('test.l_een'), current_setting('test.l_ev'))), 'geen fout',
  'de eindverantwoordelijke rechtstreeks vervangen door iemand met telefoon slaagt');
reset role;

-- Aanmaken, indelen en publiceren in één aanroep.
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select set_config('test.r', public.activiteit_opslaan(null,
  '{"naam": "T E", "datum": "2099-08-01", "starttijd": "20:00", "eindtijd": "23:00", "locatie": "De Kuus"}',
  format('[{"handeling": "toewijzen", "tijdelijk_id": "eindverantwoordelijke", "lid_id": "%s", "verwachte_bezetter": null}]',
         current_setting('test.l_ev'))::jsonb, true)::text, true);
select alike(public.t_oz(null, '{"naam": "T X", "datum": "2099-01-01"}',
  '[{"handeling": "plek_toevoegen", "rol_type": "werker", "tijdelijk_id": "eindverantwoordelijke"}]'), 'wijziging_ongeldig%',
  'de naam "eindverantwoordelijke" is gereserveerd voor plek_toevoegen');
reset role;
select is((select status from public.activiteiten where id = (current_setting('test.r')::jsonb ->> 'activiteit_id')::uuid), 'gepubliceerd',
  'aanmaken, de eindverantwoordelijke indelen en publiceren in één aanroep');
select is((current_setting('test.r')::jsonb ->> 'versie')::int, 1, 'en de versie blijft 1');

-- ===== Niet open =====
insert into public.activiteiten (id, naam, datum, status) values
  ('a2000000-0000-4000-8000-000000000001', 'T Weg', '2099-09-01', 'geannuleerd');
insert into public.activiteiten (id, naam, datum, starttijd, eindtijd, locatie, status) values
  ('a2000000-0000-4000-8000-000000000002', 'T Geweest', '2020-01-01', '20:00', '23:00', 'De Kuus', 'gepubliceerd');
insert into public.activiteiten (id, naam, datum) values ('a2000000-0000-4000-8000-000000000003', 'T Oud concept', '2020-01-02');
insert into public.rol_slots (activiteit_id, rol_type, volgorde, bezetter_id)
select a.id, 'eindverantwoordelijke', 0, case when a.naam = 'T Geweest' then current_setting('test.l_ev')::uuid end
  from public.activiteiten a where a.id::text like 'a2000000-%';
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select alike(public.t_oz('a2000000-0000-4000-8000-000000000001', '{"notitie": "x"}', '[]'), 'activiteit_niet_open%geannuleerd%',
  'een geannuleerde activiteit wijzigen: activiteit_niet_open');
select alike(public.t_oz('a2000000-0000-4000-8000-000000000002', '{"notitie": "x"}', '[]'), 'activiteit_niet_open%afgelopen%',
  'een gepubliceerde activiteit die al geweest is: activiteit_niet_open');
select is(public.t_oz('a2000000-0000-4000-8000-000000000003', '{"notitie": "x"}', '[]'), 'geen fout',
  'een afgelopen concept mag nog worden gewijzigd');
select alike(public.t_oz('a2000000-0000-4000-8000-000000000003', '{"starttijd": "20:00", "eindtijd": "23:00", "locatie": "De Kuus"}',
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": null}]',
         (select id from public.rol_slots where activiteit_id = 'a2000000-0000-4000-8000-000000000003'), current_setting('test.l_ev')), true),
  'activiteit_niet_open%afgelopen%', 'een afgelopen concept publiceren: activiteit_niet_open');
select alike(public.t_oz(current_setting('test.pact')::uuid, '{"datum": "2020-01-03"}', '[]'), 'activiteit_niet_open%afgelopen%',
  'een gepubliceerde activiteit naar het verleden verplaatsen: activiteit_niet_open');
reset role;

-- ===== Contact van de eindverantwoordelijke (R10) =====
select set_config('test.pa2', (select id::text from public.activiteiten where naam = 'T P'), true);
select pg_temp.als('t_truus', 'aal1');
set local role authenticated;
select is((select (voornaam, telefoon)::text from public.contact_eindverantwoordelijke(current_setting('test.pa2')::uuid)),
  '(t_een,"06 22 22 22 22")', 'een lid ziet naam en telefoon van de eindverantwoordelijke van een lopende activiteit');
select is((select count(*)::int from public.contact_eindverantwoordelijke(current_setting('test.act')::uuid)), 0,
  'bij een concept: geen rij');
select is((select count(*)::int from public.contact_eindverantwoordelijke('a2000000-0000-4000-8000-000000000002')), 0,
  'bij een afgelopen activiteit: geen rij');
select is((select count(*)::int from public.contact_eindverantwoordelijke(gen_random_uuid())), 0, 'bij een onbekende activiteit: geen rij');
select is((select count(*)::int from public.leden_prive where email = 't_een@example.com'), 0,
  'het lid leest nog steeds niets uit leden_prive van een ander');
reset role;
-- Een activiteit voor een groep waar het lid niet in zit, en een inactieve eindverantwoordelijke.
insert into public.activiteit_groep (activiteit_id, groep_id) values (current_setting('test.pa2')::uuid, current_setting('test.g_bestuur')::uuid);
select pg_temp.als('t_truus', 'aal1');
set local role authenticated;
select is((select count(*)::int from public.contact_eindverantwoordelijke(current_setting('test.pa2')::uuid)), 0,
  'een activiteit voor een andere groep: geen rij');
reset role;
delete from public.activiteit_groep where activiteit_id = current_setting('test.pa2')::uuid;
update public.leden set actief = false where id = current_setting('test.l_een')::uuid;
select pg_temp.als('t_truus', 'aal1');
set local role authenticated;
select is((select count(*)::int from public.contact_eindverantwoordelijke(current_setting('test.pa2')::uuid)), 0,
  'een inactieve eindverantwoordelijke: geen rij');
reset role;

-- ===== Het seizoen van vandaag =====
select set_config('test.seizoen', intern.seizoen_van(intern.vandaag(now()))::text, true);
select pg_temp.als('t_truus', 'aal1');
set local role authenticated;
select is(public.huidig_seizoen()::text, current_setting('test.seizoen'), 'huidig_seizoen() is uit te voeren door een lid en geeft het seizoen van vandaag');
reset role;
select throws_ok($$ set local role anon; select public.huidig_seizoen() $$, '42501', null, 'niet ingelogd: geen huidig_seizoen');
reset role;

-- ===== De bewaker: wie schrijft er in rol_slots en activiteit_groep =====
-- activiteit_opslaan verhoogt de versie zelf. Komt er een functie bij die in deze tabellen schrijft, dan faalt deze test:
-- pas de lijst aan en beslis of de versie omhoog moet (Datamodel-fase-2.md punt 2).
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'intern') and p.proname not like 't\_%'
      and p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+public\.(rol_slots|activiteit_groep)'),
  array['activiteit_opslaan'],
  'alleen activiteit_opslaan schrijft in rol_slots en activiteit_groep (de versie gaat daar omhoog)');

select * from finish();
rollback;
