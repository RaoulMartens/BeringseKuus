-- Databasetests fase 3: afmelden, afmelding intrekken, dienst overdragen en Mijn diensten (docs/bouw/Datamodel-fase-3.md).
-- Draaien met: npm run test:db. Alles in één transactie die wordt teruggedraaid. Eigen namen ("T F3 ..." en "t_..").
-- De gelijktijdigheid (twee sessies) staat in e2e/gelijktijdig.spec.ts: pgTAP draait in één sessie.

begin;
create extension if not exists pgtap with schema extensions;
select plan(122);

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
  perform set_config('test.' || p_naam, v_lid::text, true);
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

-- Een activiteit, rechtstreeks (de tests draaien als postgres); datum en tijden zodat hij ver in de toekomst of in het verleden valt.
create function pg_temp.act(p_naam text, p_datum date, p_status text default 'gepubliceerd') returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  insert into public.activiteiten (naam, datum, starttijd, eindtijd, locatie, status)
  values (p_naam, p_datum, case when p_status = 'concept' then null else time '20:00' end,
          case when p_status = 'concept' then null else time '23:00' end,
          case when p_status = 'concept' then null else 'De Kuus' end, p_status)
  returning id into v_id;
  perform set_config('test.' || replace(lower(p_naam), ' ', '_'), v_id::text, true);
  return v_id;
end
$$;

create function pg_temp.slot(p_act uuid, p_rol text, p_lid uuid default null, p_label text default null) returns uuid
language sql
as $$
  insert into public.rol_slots (activiteit_id, rol_type, bezetter_id, plek_label)
  values (p_act, p_rol, p_lid, p_label) returning id
$$;

-- t_fout: de foutcode met detail als tekst ("geen fout" als het lukt). Een fout rolt alleen deze aanroep terug; een
-- succes blijft staan. t_probe: probeert een overdracht en rolt altijd terug (voor de pariteit met beschikbare_vervangers).
create function public.t_fout(p_sql text) returns text
language plpgsql
as $$
declare v_msg text; v_detail text;
begin
  execute p_sql;
  return 'geen fout';
exception when others then
  get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
  return v_msg || ' ' || coalesce(v_detail, '');
end
$$;
create function public.t_probe(p_slot uuid, p_vervanger uuid) returns text
language plpgsql
as $$
declare v_msg text; v_detail text;
begin
  perform public.ruil_dienst(p_slot, p_vervanger);
  raise exception using errcode = 'BK999', message = 'gelukt';
exception when others then
  if sqlstate = 'BK999' then return 'geen fout'; end if;
  get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
  return v_msg || ' ' || coalesce(v_detail, '');
end
$$;
grant execute on function public.t_fout(text), public.t_probe(uuid, uuid) to authenticated;

-- ===== Leden, groepen en activiteiten =====
select pg_temp.maak('t_mark', true);  -- beheerder en lid
select pg_temp.maak('t_anna');        -- heeft een werkersdienst
select pg_temp.maak('t_bert');        -- heeft ook een werkersdienst, en zit in Dames
select pg_temp.maak('t_carla');       -- eindverantwoordelijke
select pg_temp.maak('t_dirk');        -- BOB
select pg_temp.maak('t_els');         -- vrij: de vervanger
select pg_temp.maak('t_fay');         -- afgemeld
select pg_temp.maak('t_gina');        -- inactief
select pg_temp.maak('t_hugo');        -- extern
select pg_temp.maak('t_ivo');         -- niet in Dames
select pg_temp.maak('t_jan');         -- zit in Dames
update public.leden set actief = false where id = current_setting('test.t_gina')::uuid;
update public.leden set type = 'extern', auth_user_id = null where id = current_setting('test.t_hugo')::uuid;
-- Een gepubliceerde activiteit moet een eindverantwoordelijke met telefoonnummer houden (R21), ook bij de opslagen hieronder.
update public.leden_prive set telefoon = '06 12 34 56 78' where lid_id = current_setting('test.t_carla')::uuid;
-- Een sessie zonder lid.
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values ('f3000000-0000-4000-8000-0000000000aa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'geenlid@example.com', now(), now());
insert into pg_temp.gebruikers values ('t_geenlid', 'f3000000-0000-4000-8000-0000000000aa', null);

select set_config('test.g_dames', (select id::text from public.groepen where naam = 'Dames'), true);
insert into public.lid_groep (lid_id, groep_id) values
  (current_setting('test.t_bert')::uuid, current_setting('test.g_dames')::uuid),
  (current_setting('test.t_jan')::uuid, current_setting('test.g_dames')::uuid);

-- t_f3_open: de gewone activiteit, zonder doelgroep (iedereen).
select pg_temp.act('T F3 Open', '2099-04-01');
select pg_temp.act('T F3 Concept', '2099-04-02', 'concept');
select pg_temp.act('T F3 Geannuleerd', '2099-04-03', 'geannuleerd');
select pg_temp.act('T F3 Voorbij', '2020-01-01');
select pg_temp.act('T F3 Dames', '2099-04-04');
select pg_temp.act('T F3 Bak', '2099-04-05');
select pg_temp.act('T F3 Grens', '2099-04-06');
select pg_temp.act('T F3 Zonder grens', '2099-04-07');
select pg_temp.act('T F3 Geen minimum', '2099-04-08');
insert into public.activiteit_groep (activiteit_id, groep_id)
values (current_setting('test.t_f3_dames')::uuid, current_setting('test.g_dames')::uuid);

-- De slots. Anna en Bert zijn werker; Carla eindverantwoordelijke; Dirk BOB; er is ook een lege werkersplek.
select set_config('test.s_anna', pg_temp.slot(current_setting('test.t_f3_open')::uuid, 'werker', current_setting('test.t_anna')::uuid)::text, true);
select set_config('test.s_bert', pg_temp.slot(current_setting('test.t_f3_open')::uuid, 'werker', current_setting('test.t_bert')::uuid)::text, true);
select set_config('test.s_leeg', pg_temp.slot(current_setting('test.t_f3_open')::uuid, 'werker')::text, true);
select set_config('test.s_ev', pg_temp.slot(current_setting('test.t_f3_open')::uuid, 'eindverantwoordelijke', current_setting('test.t_carla')::uuid)::text, true);
select set_config('test.s_bob', pg_temp.slot(current_setting('test.t_f3_open')::uuid, 'bob', current_setting('test.t_dirk')::uuid)::text, true);
-- Anna ook in een concept en in een geannuleerde en afgelopen activiteit; de beheerder in een activiteit voor Dames en in een concept.
select set_config('test.s_concept', pg_temp.slot(current_setting('test.t_f3_concept')::uuid, 'werker', current_setting('test.t_anna')::uuid)::text, true);
select set_config('test.s_geann', pg_temp.slot(current_setting('test.t_f3_geannuleerd')::uuid, 'werker', current_setting('test.t_anna')::uuid)::text, true);
select set_config('test.s_voorbij', pg_temp.slot(current_setting('test.t_f3_voorbij')::uuid, 'werker', current_setting('test.t_anna')::uuid)::text, true);
select set_config('test.s_dames_bert', pg_temp.slot(current_setting('test.t_f3_dames')::uuid, 'werker', current_setting('test.t_bert')::uuid)::text, true);
select set_config('test.s_dames_mark', pg_temp.slot(current_setting('test.t_f3_dames')::uuid, 'werker', current_setting('test.t_mark')::uuid)::text, true);
select set_config('test.s_concept_mark', pg_temp.slot(current_setting('test.t_f3_concept')::uuid, 'werker', current_setting('test.t_mark')::uuid)::text, true);
-- De bak: Anna staat er in met een plek.
select pg_temp.slot(current_setting('test.t_f3_bak')::uuid, 'bak', current_setting('test.t_anna')::uuid, 'prins');
-- Fay is al afgemeld voor de open activiteit (rechtstreeks, als de beheerder-SQL).
insert into public.afmeldingen (activiteit_id, lid_id) values (current_setting('test.t_f3_open')::uuid, current_setting('test.t_fay')::uuid);

select set_config('test.versie', (select versie::text from public.activiteiten where id = current_setting('test.t_f3_open')::uuid), true);
select set_config('test.bijgewerkt', (select bijgewerkt::text from public.activiteiten where id = current_setting('test.t_f3_open')::uuid), true);

-- ===== De toelichting =====
select is(intern.afmeldtoelichting(null), null, 'toelichting: null blijft leeg');
select is(intern.afmeldtoelichting('   '), null, 'toelichting: alleen spaties wordt null');
select is(intern.afmeldtoelichting('  ziek  '), 'ziek', 'toelichting: spaties vooraan en achteraan weg');
select is(intern.afmeldtoelichting(E'a\nb\tc'), 'a b c', 'toelichting: stuurtekens worden een spatie');
select is(intern.afmeldtoelichting('a' || chr(8238) || 'b'), 'a b', 'toelichting: een richtingteken wordt een spatie');
select is(length(intern.afmeldtoelichting(repeat('x', 600))), 500, 'toelichting: afgekapt op 500 tekens');
select is(intern.afmeldtoelichting('a' || chr(8232) || 'b' || chr(8233) || 'c'), 'a b c',
  'toelichting: een regel- of alineascheidingsteken wordt een spatie');
select is(length(intern.afmeldtoelichting(repeat('x', 100000))), 500, 'toelichting: een enorme tekst wordt ook afgekapt op 500 tekens');

-- ===== meld_af: wie belt =====
select pg_temp.als('t_geenlid');
set local role authenticated;
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_open')::uuid) $$), 'geen_lid {}',
  'meld_af: een sessie zonder lid geeft geen_lid');
reset role;
select pg_temp.als('t_gina');
set local role authenticated;
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_open')::uuid) $$), 'geen_lid {}',
  'meld_af: een inactief lid geeft geen_lid');
reset role;
select pg_temp.als('t_hugo');
set local role authenticated;
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_open')::uuid) $$), 'geen_lid {}',
  'meld_af: een externe helper geeft geen_lid');
reset role;

-- ===== meld_af: de activiteit =====
select pg_temp.als('t_els');
set local role authenticated;
select set_config('test.onbekend', public.t_fout($$ select public.meld_af(gen_random_uuid()) $$), true);
select is(current_setting('test.onbekend'), 'activiteit_niet_open {}', 'meld_af: een onbekend id geeft activiteit_niet_open zonder reden');
select is(public.t_fout($$ select public.meld_af(null) $$), 'activiteit_niet_open {}', 'meld_af: null als id geeft activiteit_niet_open');
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_concept')::uuid) $$), current_setting('test.onbekend'),
  'meld_af: een concept ziet er hetzelfde uit als een onbekend id');
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_dames')::uuid) $$), current_setting('test.onbekend'),
  'meld_af: een activiteit voor een andere doelgroep ziet er hetzelfde uit als een onbekend id');
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_geannuleerd')::uuid) $$),
  'activiteit_niet_open {"reden": "geannuleerd"}', 'meld_af: een geannuleerde activiteit noemt de reden');
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_voorbij')::uuid) $$),
  'activiteit_niet_open {"reden": "afgelopen"}', 'meld_af: een afgelopen activiteit noemt de reden');
reset role;

-- ===== meld_af: rollen =====
select pg_temp.als('t_carla');
set local role authenticated;
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_open')::uuid) $$), 'heeft_adminrol {}',
  'meld_af: de eindverantwoordelijke kan zich niet afmelden');
reset role;
select pg_temp.als('t_dirk');
set local role authenticated;
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_open')::uuid) $$), 'heeft_adminrol {}',
  'meld_af: de BOB kan zich niet afmelden');
reset role;
select pg_temp.als('t_anna');
set local role authenticated;
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_bak')::uuid) $$), 'heeft_adminrol {}',
  'meld_af: een plek in de bak valt onder heeft_adminrol');
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_open')::uuid) $$), 'heeft_ruilbare_rol {}',
  'meld_af: een lid met een werkersdienst moet eerst ruilen');
reset role;

-- ===== meld_af: slagen, een tweede keer, en wat er niet verandert =====
select set_config('test.n_open', intern.aantal_aanwezigen(current_setting('test.t_f3_open')::uuid)::text, true);
select pg_temp.als('t_els');
set local role authenticated;
select set_config('test.r', public.meld_af(current_setting('test.t_f3_open')::uuid, E'  ziek\n  ')::text, true);
select is(current_setting('test.r')::jsonb ->> 'activiteit_id', current_setting('test.t_f3_open'),
  'meld_af: een lid zonder rol meldt zich af');
select is((current_setting('test.r')::jsonb ->> 'aanwezigen')::int, current_setting('test.n_open')::int - 1,
  'meld_af: het antwoord bevat het aantal aanwezigen na de afmelding');
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_open')::uuid) $$), 'al_afgemeld {}',
  'meld_af: een tweede afmelding geeft al_afgemeld');
reset role;
select is((select toelichting from public.afmeldingen where activiteit_id = current_setting('test.t_f3_open')::uuid
             and lid_id = current_setting('test.t_els')::uuid), 'ziek', 'meld_af: de toelichting is schoongemaakt opgeslagen');
select is((select versie::text from public.activiteiten where id = current_setting('test.t_f3_open')::uuid),
  current_setting('test.versie'), 'meld_af verandert de versie niet');
select is((select bijgewerkt::text from public.activiteiten where id = current_setting('test.t_f3_open')::uuid),
  current_setting('test.bijgewerkt'), 'meld_af verandert bijgewerkt niet');
select is((select count(*)::int from public.wijzigingen_log where actie = 'afgemeld' and omschrijving like '%ziek%'), 0,
  'het log bevat de toelichting niet');
select is((select count(*)::int from public.wijzigingen_log where actie = 'afgemeld' and omschrijving ilike '%t_els%'), 0,
  'het log bevat geen naam');
select is((select count(*)::int from public.wijzigingen_log where actie = 'afgemeld'
            and rij_id = (select id from public.afmeldingen where activiteit_id = current_setting('test.t_f3_open')::uuid
                            and lid_id = current_setting('test.t_els')::uuid)), 1, 'meld_af: één logregel');
select is(intern.aantal_aanwezigen(current_setting('test.t_f3_open')::uuid),
  (select count(*)::int from public.leden l where l.actief and l.type = 'lid'
      and not exists (select 1 from public.afmeldingen af where af.activiteit_id = current_setting('test.t_f3_open')::uuid and af.lid_id = l.id)),
  'de afgemelden en de externe helpers tellen niet mee als aanwezig');

-- Een beheerder zonder tweede factor meldt zich als lid af (besluit 3.1): geen aal2 nodig.
select pg_temp.als('t_mark', 'aal1');
set local role authenticated;
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_zonder_grens')::uuid) $$), 'geen fout',
  'meld_af: een beheerder zonder aal2 meldt zich als lid af');
reset role;

-- ===== meld_af: de ondergrens (R8) =====
-- Deadline verstreken, minimum aan. n is wat er nu aanwezig is; precies op de grens uitkomen is toegestaan.
update public.activiteiten set afmeld_deadline = timestamptz '2020-01-01 12:00' where id = current_setting('test.t_f3_grens')::uuid;
select set_config('test.n', intern.aantal_aanwezigen(current_setting('test.t_f3_grens')::uuid)::text, true);
update public.activiteiten set min_aanwezigen = current_setting('test.n')::int where id = current_setting('test.t_f3_grens')::uuid;
select pg_temp.als('t_els');
set local role authenticated;
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_grens')::uuid) $$),
  format('onder_ondergrens {"min": %s, "aanwezigen_na": %s, "aanwezigen_nu": %s}', current_setting('test.n'),
         current_setting('test.n')::int - 1, current_setting('test.n')),
  'meld_af: na de deadline en onder het minimum geeft onder_ondergrens, met de stand nu en na afmelden');
reset role;
select is((select count(*)::int from public.afmeldingen where activiteit_id = current_setting('test.t_f3_grens')::uuid), 0,
  'een geweigerde afmelding legt niets vast');
update public.activiteiten set min_aanwezigen = current_setting('test.n')::int - 1 where id = current_setting('test.t_f3_grens')::uuid;
set local role authenticated;
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_grens')::uuid) $$), 'geen fout',
  'meld_af: precies op het minimum uitkomen is toegestaan');
reset role;
select pg_temp.als('t_ivo');
set local role authenticated;
select alike(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_grens')::uuid) $$), 'onder_ondergrens%',
  'meld_af: de volgende afmelding zakt onder het minimum');
reset role;
-- Zonder deadline of zonder minimum blokkeert de ondergrens nooit.
update public.activiteiten set min_aanwezigen = 1000 where id = current_setting('test.t_f3_zonder_grens')::uuid;
select pg_temp.als('t_ivo');
set local role authenticated;
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_zonder_grens')::uuid) $$), 'geen fout',
  'meld_af: zonder deadline blokkeert de ondergrens nooit');
reset role;
update public.activiteiten set afmeld_deadline = timestamptz '2020-01-01 12:00' where id = current_setting('test.t_f3_geen_minimum')::uuid;
set local role authenticated;
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_geen_minimum')::uuid) $$), 'geen fout',
  'meld_af: zonder minimum blokkeert de ondergrens nooit');
reset role;
select is(intern.deadline_verstreken(timestamptz '2099-01-01 12:00', timestamptz '2099-01-01 12:00'), false,
  'op het deadline-moment zelf mag je nog vrij afmelden');

-- ===== trek_afmelding_in =====
select pg_temp.als('t_els');
set local role authenticated;
select set_config('test.onbekend', public.t_fout($$ select public.trek_afmelding_in(gen_random_uuid()) $$), true);
select is(current_setting('test.onbekend'), 'activiteit_niet_open {}', 'trek_afmelding_in: een onbekend id geeft activiteit_niet_open');
select is(public.t_fout($$ select public.trek_afmelding_in(current_setting('test.t_f3_concept')::uuid) $$), current_setting('test.onbekend'),
  'trek_afmelding_in: een concept ziet er hetzelfde uit als een onbekend id');
select is(public.t_fout($$ select public.trek_afmelding_in(current_setting('test.t_f3_dames')::uuid) $$), current_setting('test.onbekend'),
  'trek_afmelding_in: een andere doelgroep ziet er hetzelfde uit als een onbekend id');
select is(public.t_fout($$ select public.trek_afmelding_in(current_setting('test.t_f3_geannuleerd')::uuid) $$),
  'activiteit_niet_open {"reden": "geannuleerd"}', 'trek_afmelding_in: een geannuleerde activiteit geeft activiteit_niet_open');
select is(public.t_fout($$ select public.trek_afmelding_in(current_setting('test.t_f3_voorbij')::uuid) $$), 'activiteit_voorbij {}',
  'trek_afmelding_in: een afgelopen activiteit geeft activiteit_voorbij');
select is(public.t_fout($$ select public.trek_afmelding_in(current_setting('test.t_f3_zonder_grens')::uuid) $$), 'niet_afgemeld {}',
  'trek_afmelding_in: zonder afmelding geeft niet_afgemeld');
reset role;
select set_config('test.aanwezig', intern.aantal_aanwezigen(current_setting('test.t_f3_open')::uuid)::text, true);
select set_config('test.log', (select count(*)::text from public.wijzigingen_log), true);
set local role authenticated;
select is((public.trek_afmelding_in(current_setting('test.t_f3_open')::uuid) ->> 'aanwezigen')::int,
  current_setting('test.aanwezig')::int + 1, 'trek_afmelding_in: slaagt en het aantal aanwezigen gaat met 1 omhoog');
reset role;
select is((select count(*)::int from public.afmeldingen where activiteit_id = current_setting('test.t_f3_open')::uuid
             and lid_id = current_setting('test.t_els')::uuid), 0, 'trek_afmelding_in: de afmelding is weg');
select is((select count(*)::int from public.wijzigingen_log where actie = 'afmelding_ingetrokken'), 1, 'trek_afmelding_in: één logregel');
select is((select versie::text from public.activiteiten where id = current_setting('test.t_f3_open')::uuid),
  current_setting('test.versie'), 'trek_afmelding_in verandert de versie niet');
select is((select bijgewerkt::text from public.activiteiten where id = current_setting('test.t_f3_open')::uuid),
  current_setting('test.bijgewerkt'), 'trek_afmelding_in verandert bijgewerkt niet');
-- Een afmelding op een activiteit die daarna wordt geannuleerd blijft staan en is niet meer in te trekken (besluit 3.5).
insert into public.afmeldingen (activiteit_id, lid_id) values (current_setting('test.t_f3_geannuleerd')::uuid, current_setting('test.t_els')::uuid);
set local role authenticated;
select alike(public.t_fout($$ select public.trek_afmelding_in(current_setting('test.t_f3_geannuleerd')::uuid) $$), 'activiteit_niet_open%',
  'trek_afmelding_in: een afmelding op een geannuleerde activiteit blijft staan');
reset role;

-- ===== beschikbare_vervangers =====
select pg_temp.als('t_anna');
set local role authenticated;
select is(pg_get_function_result('public.beschikbare_vervangers(uuid)'::regprocedure),
  'TABLE(lid_id uuid, voornaam text, achternaam text, beschikbaar boolean, reden text)',
  'beschikbare_vervangers geeft alleen id, naam, beschikbaar en reden: geen e-mail, telefoon of toelichting');
select is((select beschikbaar::text from public.beschikbare_vervangers(current_setting('test.t_f3_open')::uuid) where lid_id = current_setting('test.t_els')::uuid),
  'true', 'beschikbare_vervangers: een vrij lid is beschikbaar');
select is((select reden from public.beschikbare_vervangers(current_setting('test.t_f3_open')::uuid) where lid_id = current_setting('test.t_fay')::uuid),
  'afgemeld', 'beschikbare_vervangers: een afgemeld lid heet afgemeld');
select is((select reden from public.beschikbare_vervangers(current_setting('test.t_f3_open')::uuid) where lid_id = current_setting('test.t_bert')::uuid),
  'al_ingedeeld', 'beschikbare_vervangers: een lid met een andere plek heet al_ingedeeld');
select is((select count(*)::int from public.beschikbare_vervangers(current_setting('test.t_f3_open')::uuid)
            where lid_id in (current_setting('test.t_anna')::uuid, current_setting('test.t_gina')::uuid, current_setting('test.t_hugo')::uuid)), 0,
  'beschikbare_vervangers: niet het lid zelf, geen inactief lid en geen externe helper');
-- Pariteit: wie beschikbaar is, kan overnemen; elke reden komt overeen met de foutcode van ruil_dienst.
select is_empty(
  $$ select v.lid_id from public.beschikbare_vervangers(current_setting('test.t_f3_open')::uuid) v
      where (v.beschikbaar and public.t_probe(current_setting('test.s_anna')::uuid, v.lid_id) <> 'geen fout')
         or (v.reden = 'afgemeld' and public.t_probe(current_setting('test.s_anna')::uuid, v.lid_id) not like 'vervanger_afgemeld%')
         or (v.reden = 'al_ingedeeld' and public.t_probe(current_setting('test.s_anna')::uuid, v.lid_id) not like 'dubbelboeking%') $$,
  'beschikbare_vervangers komt overeen met ruil_dienst: beschikbaar slaagt, de reden is de foutcode');
select is((select count(*)::int from public.beschikbare_vervangers(current_setting('test.t_f3_voorbij')::uuid)), 0,
  'beschikbare_vervangers: een afgelopen activiteit geeft niets');
select is((select count(*)::int from public.beschikbare_vervangers(current_setting('test.t_f3_geannuleerd')::uuid)), 0,
  'beschikbare_vervangers: een geannuleerde activiteit geeft niets');
select is((select count(*)::int from public.beschikbare_vervangers(current_setting('test.t_f3_concept')::uuid)), 0,
  'beschikbare_vervangers: een concept geeft niets');
reset role;
select pg_temp.als('t_els');
set local role authenticated;
select is((select count(*)::int from public.beschikbare_vervangers(current_setting('test.t_f3_open')::uuid)), 0,
  'beschikbare_vervangers: wie zelf geen ruilbare dienst heeft, krijgt niets');
reset role;
select pg_temp.als('t_carla');
set local role authenticated;
select is((select count(*)::int from public.beschikbare_vervangers(current_setting('test.t_f3_open')::uuid)), 0,
  'beschikbare_vervangers: een niet-ruilbare rol krijgt niets');
reset role;
select pg_temp.als('t_bert');
set local role authenticated;
select is((select count(*)::int from public.beschikbare_vervangers(current_setting('test.t_f3_dames')::uuid)
            where lid_id = current_setting('test.t_ivo')::uuid), 0,
  'beschikbare_vervangers: een lid buiten de doelgroep staat er niet in');
select is((select beschikbaar::text from public.beschikbare_vervangers(current_setting('test.t_f3_dames')::uuid)
            where lid_id = current_setting('test.t_jan')::uuid), 'true', 'beschikbare_vervangers: een lid in de doelgroep wel');
reset role;

-- ===== ruil_dienst: de controles =====
select pg_temp.als('t_anna');
set local role authenticated;
select is(public.t_fout(format($f$ select public.ruil_dienst(%L, %L) $f$, current_setting('test.s_bert'), current_setting('test.t_els'))), 'geen_bezetter {}',
  'ruil_dienst: het slot van een ander geeft geen_bezetter');
select is(public.t_fout(format($f$ select public.ruil_dienst(%L, %L) $f$, current_setting('test.s_leeg'), current_setting('test.t_els'))), 'geen_bezetter {}',
  'ruil_dienst: een leeg slot geeft geen_bezetter');
select is(public.t_fout(format($f$ select public.ruil_dienst(gen_random_uuid(), %L) $f$, current_setting('test.t_els'))), 'geen_bezetter {}',
  'ruil_dienst: een onbekend slot geeft geen_bezetter');
select is(public.t_fout(format($f$ select public.ruil_dienst(null, %L) $f$, current_setting('test.t_els'))), 'geen_bezetter {}',
  'ruil_dienst: null als slot geeft geen_bezetter');
select is(public.t_fout(format($f$ select public.ruil_dienst(%L, null) $f$, current_setting('test.s_anna'))), 'vervanger_ongeldig {"lid_id": null}',
  'ruil_dienst: null als vervanger geeft vervanger_ongeldig');
select is(public.t_fout(format($f$ select public.ruil_dienst(%L, %L) $f$, current_setting('test.s_concept'), current_setting('test.t_els'))), 'geen_bezetter {}',
  'ruil_dienst: een slot in een concept ziet er hetzelfde uit als een onbekend slot');
select is(public.t_fout(format($f$ select public.ruil_dienst(%L, %L) $f$, current_setting('test.s_geann'), current_setting('test.t_els'))),
  'activiteit_niet_open {"reden": "geannuleerd"}', 'ruil_dienst: een geannuleerde activiteit');
select is(public.t_fout(format($f$ select public.ruil_dienst(%L, %L) $f$, current_setting('test.s_voorbij'), current_setting('test.t_els'))),
  'activiteit_niet_open {"reden": "afgelopen"}', 'ruil_dienst: een afgelopen activiteit');
select alike(public.t_fout(format($f$ select public.ruil_dienst(%L, %L) $f$, current_setting('test.s_anna'), current_setting('test.t_anna'))), 'vervanger_ongeldig%',
  'ruil_dienst: wisselen met zichzelf geeft vervanger_ongeldig');
select alike(public.t_fout(format($f$ select public.ruil_dienst(%L, %L) $f$, current_setting('test.s_anna'), current_setting('test.t_gina'))), 'vervanger_ongeldig%',
  'ruil_dienst: een inactief lid kan niet overnemen');
select alike(public.t_fout(format($f$ select public.ruil_dienst(%L, %L) $f$, current_setting('test.s_anna'), current_setting('test.t_hugo'))), 'vervanger_ongeldig%',
  'ruil_dienst: een externe helper kan niet overnemen');
select alike(public.t_fout(format($f$ select public.ruil_dienst(%L, gen_random_uuid()) $f$, current_setting('test.s_anna'))), 'vervanger_ongeldig%',
  'ruil_dienst: een onbekende vervanger');
select is(public.t_fout(format($f$ select public.ruil_dienst(%L, %L) $f$, current_setting('test.s_anna'), current_setting('test.t_fay'))), 'vervanger_afgemeld {}',
  'ruil_dienst: een afgemelde vervanger geeft vervanger_afgemeld');
select is(public.t_fout(format($f$ select public.ruil_dienst(%L, %L) $f$, current_setting('test.s_anna'), current_setting('test.t_bert'))), 'dubbelboeking {}',
  'ruil_dienst: een vervanger met een ander slot geeft dubbelboeking');
reset role;
select pg_temp.als('t_bert');
set local role authenticated;
select alike(public.t_fout(format($f$ select public.ruil_dienst(%L, %L) $f$, current_setting('test.s_dames_bert'), current_setting('test.t_ivo'))), 'vervanger_ongeldig%',
  'ruil_dienst: een vervanger buiten de doelgroep van de activiteit geeft vervanger_ongeldig');
reset role;
select pg_temp.als('t_carla');
set local role authenticated;
select is(public.t_fout(format($f$ select public.ruil_dienst(%L, %L) $f$, current_setting('test.s_ev'), current_setting('test.t_els'))), 'rol_niet_ruilbaar {}',
  'ruil_dienst: de eindverantwoordelijke is niet ruilbaar');
reset role;
select pg_temp.als('t_dirk');
set local role authenticated;
select is(public.t_fout(format($f$ select public.ruil_dienst(%L, %L) $f$, current_setting('test.s_bob'), current_setting('test.t_els'))), 'rol_niet_ruilbaar {}',
  'ruil_dienst: de BOB is niet ruilbaar');
reset role;
select pg_temp.als('t_geenlid');
set local role authenticated;
select is(public.t_fout(format($f$ select public.ruil_dienst(%L, %L) $f$, current_setting('test.s_anna'), current_setting('test.t_els'))), 'geen_lid {}',
  'ruil_dienst: een sessie zonder lid geeft geen_lid');
reset role;

-- ===== mijn_diensten, voor de ruil =====
select pg_temp.als('t_anna');
set local role authenticated;
select is((select count(*)::int from public.mijn_diensten where activiteit_id = current_setting('test.t_f3_open')::uuid), 1,
  'mijn_diensten: de eigen dienst staat erin');
select is((select rol_type || ' ' || ruilbaar::text from public.mijn_diensten where activiteit_id = current_setting('test.t_f3_open')::uuid),
  'werker true', 'mijn_diensten: met de rol en of die ruilbaar is');
select isnt((select eindigt_om from public.mijn_diensten where activiteit_id = current_setting('test.t_f3_open')::uuid), null,
  'mijn_diensten: met eindigt_om, zodat het scherm komend en geweest kan splitsen');
select is((select count(*)::int from public.mijn_diensten where activiteit_id in
  (current_setting('test.t_f3_concept')::uuid, current_setting('test.t_f3_geannuleerd')::uuid, current_setting('test.t_f3_bak')::uuid)), 0,
  'mijn_diensten: geen concept, geen geannuleerde activiteit en geen plek in de bak');
select is((select count(*)::int from public.mijn_diensten where rol_slot_id in (current_setting('test.s_bert')::uuid, current_setting('test.s_ev')::uuid)), 0,
  'mijn_diensten: nooit de dienst van een ander');
reset role;
-- Een beheerder op aal2 ziet geen dienst buiten zijn doelgroep en geen concept (R22, de policies laten hem anders alles zien).
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is((select count(*)::int from public.mijn_diensten
            where rol_slot_id in (current_setting('test.s_dames_mark')::uuid, current_setting('test.s_concept_mark')::uuid)), 0,
  'mijn_diensten: een beheerder ziet geen dienst buiten zijn doelgroep en geen concept');
reset role;

-- ===== ruil_dienst: slagen =====
select set_config('test.versie', (select versie::text from public.activiteiten where id = current_setting('test.t_f3_open')::uuid), true);
select set_config('test.bijgewerkt', (select bijgewerkt::text from public.activiteiten where id = current_setting('test.t_f3_open')::uuid), true);
select set_config('test.slots', (select count(*)::text from public.rol_slots where activiteit_id = current_setting('test.t_f3_open')::uuid), true);
select pg_temp.als('t_anna');
set local role authenticated;
select is(public.ruil_dienst(current_setting('test.s_anna')::uuid, current_setting('test.t_els')::uuid) ->> 'rol_slot_id',
  current_setting('test.s_anna'), 'ruil_dienst: de overdracht slaagt');
reset role;
select is((select bezetter_id::text from public.rol_slots where id = current_setting('test.s_anna')::uuid), current_setting('test.t_els'),
  'ruil_dienst: de vervanger staat op het slot');
select is((select count(*)::text from public.rol_slots where activiteit_id = current_setting('test.t_f3_open')::uuid), current_setting('test.slots'),
  'ruil_dienst: geen lege plek erbij, geen slot weg');
select is((select count(*)::int from public.rol_slots where activiteit_id = current_setting('test.t_f3_open')::uuid and bezetter_id is null), 1,
  'ruil_dienst: alleen de lege plek die er al was');
select is((select versie::text from public.activiteiten where id = current_setting('test.t_f3_open')::uuid), current_setting('test.versie'),
  'ruil_dienst verandert de versie niet (fase 2, besluit 1)');
select isnt((select bijgewerkt::text from public.activiteiten where id = current_setting('test.t_f3_open')::uuid), current_setting('test.bijgewerkt'),
  'ruil_dienst verschuift bijgewerkt: leden zien dat de bezetting is veranderd');
select is((select count(*)::int from public.wijzigingen_log where actie = 'dienst_geruild' and rij_id = current_setting('test.s_anna')::uuid), 1,
  'ruil_dienst: één logregel');
select is((select count(*)::int from public.wijzigingen_log where actie = 'dienst_geruild' and omschrijving ilike '%t_anna%'), 0,
  'ruil_dienst: het log bevat geen naam');
select is(current_setting('bk.zichtbaar', true), '', 'ruil_dienst laat bk.zichtbaar niet staan');

-- Een beheerder met een open formulier: de oude verwachte bezetter geeft slot_gewijzigd, de oude versie slaagt voor een ander veld.
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select alike(public.t_fout(format($f$ select public.activiteit_opslaan(%L, '{}', %L, false, %s) $f$, current_setting('test.t_f3_open'),
  format('[{"handeling": "toewijzen", "rol_slot_id": "%s", "lid_id": "%s", "verwachte_bezetter": "%s"}]',
         current_setting('test.s_anna'), current_setting('test.t_ivo'), current_setting('test.t_anna')), current_setting('test.versie'))),
  'slot_gewijzigd%', 'na een ruil: de oude verwachte bezetter geeft slot_gewijzigd');
select is(public.t_fout(format($f$ select public.activiteit_opslaan(%L, '{"notitie": "Zaal klaar"}', '[]', false, %s) $f$,
  current_setting('test.t_f3_open'), current_setting('test.versie'))), 'geen fout',
  'na een ruil: een opslag met de oude versie van een ander veld slaagt (de versie is niet omhoog gegaan)');
reset role;

-- Anna heeft geen slot meer: afmelden en intrekken kan, en de overgedragen dienst komt niet terug (R9, UC-003 AF-1).
select pg_temp.als('t_anna');
set local role authenticated;
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_open')::uuid) $$), 'geen fout',
  'na een geslaagde ruil kan het lid zonder rol zich afmelden');
select is(public.t_fout($$ select public.trek_afmelding_in(current_setting('test.t_f3_open')::uuid) $$), 'geen fout',
  'en de afmelding intrekken');
reset role;
select is((select bezetter_id::text from public.rol_slots where id = current_setting('test.s_anna')::uuid), current_setting('test.t_els'),
  'de overgedragen dienst komt bij het intrekken niet terug');

-- ===== mijn_diensten, na de ruil =====
select pg_temp.als('t_anna');
set local role authenticated;
select is((select count(*)::int from public.mijn_diensten where activiteit_id = current_setting('test.t_f3_open')::uuid), 0,
  'mijn_diensten: na de ruil staat de dienst niet meer bij het vertrekkende lid');
reset role;
select pg_temp.als('t_els');
set local role authenticated;
select is((select count(*)::int from public.mijn_diensten where rol_slot_id = current_setting('test.s_anna')::uuid), 1,
  'mijn_diensten: maar wel bij de vervanger');
reset role;

-- ===== Aanvullingen na de review =====
-- De doelgroep (R22) via meld_af: alleen de leden van Dames tellen mee, en de ondergrens rekent daarmee.
select set_config('test.n_dames', (select count(*)::text from public.leden l
  where l.actief and l.type = 'lid'
    and exists (select 1 from public.lid_groep lg where lg.lid_id = l.id and lg.groep_id = current_setting('test.g_dames')::uuid)), true);
select is(intern.aantal_aanwezigen(current_setting('test.t_f3_dames')::uuid), current_setting('test.n_dames')::int,
  'aantal aanwezigen bij een activiteit voor Dames: alleen de leden van Dames');
update public.activiteiten set afmeld_deadline = timestamptz '2020-01-01 12:00', min_aanwezigen = current_setting('test.n_dames')::int
 where id = current_setting('test.t_f3_dames')::uuid;
select pg_temp.als('t_jan');
set local role authenticated;
select is(public.t_fout($$ select public.meld_af(current_setting('test.t_f3_dames')::uuid) $$),
  format('onder_ondergrens {"min": %s, "aanwezigen_na": %s, "aanwezigen_nu": %s}', current_setting('test.n_dames'),
         current_setting('test.n_dames')::int - 1, current_setting('test.n_dames')),
  'meld_af bij een activiteit voor Dames: de ondergrens rekent met de leden van Dames, niet met alle leden');
reset role;
update public.activiteiten set min_aanwezigen = current_setting('test.n_dames')::int - 1 where id = current_setting('test.t_f3_dames')::uuid;
set local role authenticated;
select is((public.meld_af(current_setting('test.t_f3_dames')::uuid) ->> 'aanwezigen')::int, current_setting('test.n_dames')::int - 1,
  'meld_af bij een activiteit voor Dames: het antwoord telt alleen Dames');
reset role;

-- Geen lid: ook voor intrekken, de vervangerslijst, Mijn diensten, en voor een inactief lid of een externe helper bij ruilen.
select pg_temp.als('t_geenlid');
set local role authenticated;
select is(public.t_fout($$ select public.trek_afmelding_in(current_setting('test.t_f3_open')::uuid) $$), 'geen_lid {}',
  'trek_afmelding_in: een sessie zonder lid geeft geen_lid');
select is((select count(*)::int from public.beschikbare_vervangers(current_setting('test.t_f3_open')::uuid)), 0,
  'beschikbare_vervangers: een sessie zonder lid krijgt niets');
select is((select count(*)::int from public.mijn_diensten), 0, 'mijn_diensten: een sessie zonder lid ziet niets');
reset role;
select pg_temp.als('t_gina');
set local role authenticated;
select is(public.t_fout(format($f$ select public.ruil_dienst(%L, %L) $f$, current_setting('test.s_anna'), current_setting('test.t_ivo'))), 'geen_lid {}',
  'ruil_dienst: een inactief lid geeft geen_lid');
reset role;
select pg_temp.als('t_hugo');
set local role authenticated;
select is(public.t_fout(format($f$ select public.ruil_dienst(%L, %L) $f$, current_setting('test.s_anna'), current_setting('test.t_ivo'))), 'geen_lid {}',
  'ruil_dienst: een externe helper geeft geen_lid');
reset role;

-- Een beheerder (aal2) met een slot in een activiteit buiten zijn doelgroep: die activiteit bestaat voor hem niet als lid.
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is((select count(*)::int from public.beschikbare_vervangers(current_setting('test.t_f3_dames')::uuid)), 0,
  'beschikbare_vervangers: een beheerder met een slot buiten zijn doelgroep krijgt niets');
select is(public.t_fout(format($f$ select public.ruil_dienst(%L, %L) $f$, current_setting('test.s_dames_mark'), current_setting('test.t_ivo'))), 'geen_bezetter {}',
  'ruil_dienst: een slot in een activiteit buiten de doelgroep van de beheerder geeft geen_bezetter');
reset role;

-- ===== Bewakers =====
select is_empty($$ select code from public.roltypen where ruilbaar_door_lid = alleen_admin $$,
  'elk roltype is ruilbaar door het lid of alleen voor de beheerder, nooit beide of geen van beide');

-- ===== Rechten =====
select throws_ok($$ set local role anon; select public.meld_af(gen_random_uuid()) $$, '42501', null, 'niet ingelogd: geen meld_af');
reset role;
select throws_ok($$ set local role anon; select public.trek_afmelding_in(gen_random_uuid()) $$, '42501', null, 'niet ingelogd: geen trek_afmelding_in');
reset role;
select throws_ok($$ set local role anon; select public.ruil_dienst(gen_random_uuid(), gen_random_uuid()) $$, '42501', null, 'niet ingelogd: geen ruil_dienst');
reset role;
select throws_ok($$ set local role anon; select * from public.beschikbare_vervangers(gen_random_uuid()) $$, '42501', null,
  'niet ingelogd: geen beschikbare_vervangers');
reset role;
select throws_ok($$ set local role anon; select * from public.mijn_diensten $$, '42501', null, 'niet ingelogd: geen mijn_diensten');
reset role;
select ok(has_function_privilege('authenticated', 'public.meld_af(uuid, text)', 'execute')
      and has_function_privilege('authenticated', 'public.trek_afmelding_in(uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.ruil_dienst(uuid, uuid)', 'execute')
      and has_function_privilege('authenticated', 'public.beschikbare_vervangers(uuid)', 'execute'),
  'ingelogd: de vier functies zijn uit te voeren');
select ok(not has_function_privilege('authenticated', 'intern.afmeldtoelichting(text)', 'execute'),
  'ingelogd: de hulpfunctie voor de toelichting niet');

select * from finish();
rollback;
