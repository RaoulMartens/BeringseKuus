-- Databasetests voor de wensen van 09-11-2026 (migratie 20261109120000): de nieuwe rollen en een eigen rol, een nieuwe
-- externe helper zonder e-mailadres, en een gepubliceerde activiteit verwijderen. Draaien met: npm run test:db. Alles in
-- één transactie die wordt teruggedraaid. Eigen namen ("T ...").

begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

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
  insert into public.leden_prive (lid_id, email, telefoon, is_admin, beheerder_sinds)
  values (v_lid, p_naam || '@example.com', '06 12 34 56 78', p_admin, case when p_admin then timestamptz '2026-06-01' end);
  if p_admin then
    insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
    values (gen_random_uuid(), v_uid, 'totp', 'verified', timestamptz '2026-05-01', timestamptz '2026-05-01');
  end if;
  insert into pg_temp.gebruikers values (p_naam, v_uid, v_lid);
end
$$;

create function pg_temp.als(p_naam text, p_aal text default 'aal1') returns void
language sql
as $$
  select set_config('request.jwt.claims',
    (json_build_object('sub', (select uid from pg_temp.gebruikers where naam = p_naam),
                       'role', 'authenticated', 'aal', p_aal)::jsonb
     || jsonb_build_object('amr',
          jsonb_build_array(jsonb_build_object('method', 'otp', 'timestamp', extract(epoch from now())::bigint))
          || case when p_aal = 'aal2'
                  then jsonb_build_array(jsonb_build_object('method', 'totp',
                         'timestamp', extract(epoch from now() - interval '1 minute')::bigint))
                  else '[]'::jsonb end))::text, true)
$$;

-- De foutcode van een aanroep als tekst ("geen fout" als het lukt); een fout rolt alleen die aanroep terug.
create function public.t_rz(p_sql text) returns text
language plpgsql
as $$
declare v_msg text;
begin
  execute p_sql;
  return 'geen fout';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end
$$;
grant execute on function public.t_rz(text) to authenticated;

select pg_temp.maak('t_mark', true);
select pg_temp.maak('t_truus');
select set_config('test.truus', (select lid::text from pg_temp.gebruikers where naam = 't_truus'), true);

-- ===== 1. De rollen =====
select is((select array_agg(code order by volgorde) from public.roltypen where toevoegbaar),
  array['tapper', 'buffet', 'ober', 'bonnenkassa', 'drankhaler', 'fotograaf', 'bob'],
  'toe te voegen rollen: tapper, buffet, ober, bonnenkassa, drankhaler, fotograaf en BOB, in die volgorde');
select ok(not (select toevoegbaar from public.roltypen where code = 'werker'), 'werker kan niet meer worden toegevoegd');
select ok((select bool_and(ruilbaar_door_lid and not alleen_admin) from public.roltypen
            where code in ('tapper', 'buffet', 'ober', 'bonnenkassa')),
  'de nieuwe rollen kan een lid zelf overdragen, net als werker');

select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select set_config('test.a',
  (public.activiteit_opslaan(null, '{"naam": "T Rollen", "datum": "2099-05-01"}',
     '[{"handeling": "plek_toevoegen", "rol_type": "tapper", "tijdelijk_id": "n1"},
       {"handeling": "plek_toevoegen", "rol_naam": "  Garderobe  ", "tijdelijk_id": "n2"},
       {"handeling": "plek_toevoegen", "rol_naam": "garderobe", "tijdelijk_id": "n3"},
       {"handeling": "plek_toevoegen", "rol_naam": "BONNENKASSA", "tijdelijk_id": "n4"}]') ->> 'activiteit_id'), true);
reset role;
select is((select array_agg(rol_type order by volgorde) from public.rol_slots
            where activiteit_id = current_setting('test.a')::uuid and rol_type <> 'eindverantwoordelijke'),
  array['tapper', 'Garderobe', 'Garderobe', 'bonnenkassa'],
  'een eigen rol: de naam is de code, zonder spaties eromheen; dezelfde naam in andere letters is dezelfde rol, ook bij een vaste rol');
select is((select count(*)::int from public.roltypen where lower(code) = 'garderobe'), 1, 'de eigen rol staat er één keer');
select ok((select toevoegbaar and ruilbaar_door_lid and not alleen_admin from public.roltypen where code = 'Garderobe'),
  'een eigen rol staat daarna in de lijst en kan door een lid worden overgedragen');
select is((select count(*)::int from public.wijzigingen_log where actie = 'roltype_toegevoegd' and omschrijving = 'Rol Garderobe toegevoegd'),
  1, 'het toevoegen van een rol staat in het wijzigingenlog');

select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.activiteit_opslaan('$$ || current_setting('test.a') || $$', '{}',
  '[{"handeling": "plek_toevoegen", "rol_naam": "   ", "tijdelijk_id": "n9"}]', false, 1) $$),
  'veld_ongeldig', 'een lege eigen rol kan niet');
select is(public.t_rz($$ select public.activiteit_opslaan('$$ || current_setting('test.a') || $$', '{}',
  '[{"handeling": "plek_toevoegen", "rol_naam": "$$ || repeat('x', 41) || $$", "tijdelijk_id": "n9"}]', false, 1) $$),
  'veld_ongeldig', 'een eigen rol van meer dan 40 tekens kan niet');
select is(public.t_rz($$ select public.activiteit_opslaan('$$ || current_setting('test.a') || $$', '{}',
  '[{"handeling": "plek_toevoegen", "rol_naam": "Eindverantwoordelijke", "tijdelijk_id": "n9"}]', false, 1) $$),
  'niet_ondersteund', 'een eigen rol met de naam Eindverantwoordelijke wordt geen tweede eindverantwoordelijke');
select is(public.t_rz($$ select public.activiteit_opslaan('$$ || current_setting('test.a') || $$', '{}',
  '[{"handeling": "plek_toevoegen", "rol_type": "tapper", "rol_naam": "Tapper", "tijdelijk_id": "n9"}]', false, 1) $$),
  'wijziging_ongeldig', 'rol_type en rol_naam samen kan niet');
reset role;

-- ===== 2. Een nieuwe externe helper =====
select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select set_config('test.b',
  (public.activiteit_opslaan(null, '{"naam": "T Helper", "datum": "2099-05-02"}',
     '[{"handeling": "plek_toevoegen", "rol_type": "tapper", "tijdelijk_id": "n1"},
       {"handeling": "toewijzen", "tijdelijk_id": "n1", "verwachte_bezetter": null,
        "nieuwe_helper": {"voornaam": " Kees ", "achternaam": "Buurman"}},
       {"handeling": "plek_toevoegen", "rol_type": "ober", "tijdelijk_id": "n2"},
       {"handeling": "toewijzen", "tijdelijk_id": "n2", "verwachte_bezetter": null,
        "nieuwe_helper": {"voornaam": "Els", "achternaam": "Buurvrouw", "email": "Els@Example.com"}}]') ->> 'activiteit_id'), true);
reset role;
select is((select l.type || ' ' || l.voornaam || ' ' || coalesce(p.email, '(geen)') from public.rol_slots s
             join public.leden l on l.id = s.bezetter_id join public.leden_prive p on p.lid_id = l.id
            where s.activiteit_id = current_setting('test.b')::uuid and s.rol_type = 'tapper'),
  'extern Kees (geen)', 'een nieuwe externe helper zonder e-mailadres staat op zijn plek');
select is((select p.email from public.rol_slots s join public.leden_prive p on p.lid_id = s.bezetter_id
            where s.activiteit_id = current_setting('test.b')::uuid and s.rol_type = 'ober'),
  'els@example.com', 'een e-mailadres wordt in kleine letters bewaard');
select ok(not exists (select 1 from public.lid_groep lg join public.leden l on l.id = lg.lid_id
                       where l.voornaam in ('Kees', 'Els') and l.type = 'extern'),
  'een nieuwe externe helper hoort bij geen groep');
select is((select count(*)::int from public.wijzigingen_log where actie = 'helper_toegevoegd'
            and omschrijving like 'Externe helper toegevoegd bij T Helper%'), 2,
  'het toevoegen van een helper staat in het wijzigingenlog, zonder zijn naam');

select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.activiteit_opslaan('$$ || current_setting('test.b') || $$', '{}',
  '[{"handeling": "plek_toevoegen", "rol_type": "tapper", "tijdelijk_id": "n9"},
    {"handeling": "toewijzen", "tijdelijk_id": "n9", "verwachte_bezetter": null,
     "nieuwe_helper": {"voornaam": "Dubbel", "achternaam": "Adres", "email": "t_truus@example.com"}}]', false,
  (select versie from public.activiteiten where id = '$$ || current_setting('test.b') || $$')) $$),
  'email_bestaat', 'een e-mailadres dat al bij iemand hoort, kan niet nog een keer');
select is(public.t_rz($$ select public.activiteit_opslaan('$$ || current_setting('test.b') || $$', '{}',
  '[{"handeling": "plek_toevoegen", "rol_type": "tapper", "tijdelijk_id": "n9"},
    {"handeling": "toewijzen", "tijdelijk_id": "n9", "verwachte_bezetter": null,
     "nieuwe_helper": {"voornaam": "Fout", "achternaam": "Adres", "email": "geen-adres"}}]', false,
  (select versie from public.activiteiten where id = '$$ || current_setting('test.b') || $$')) $$),
  'veld_ongeldig', 'een e-mailadres dat niet klopt, kan niet');
select is(public.t_rz($$ select public.activiteit_opslaan('$$ || current_setting('test.b') || $$', '{}',
  '[{"handeling": "plek_toevoegen", "rol_type": "tapper", "tijdelijk_id": "n9"},
    {"handeling": "toewijzen", "tijdelijk_id": "n9", "verwachte_bezetter": null,
     "nieuwe_helper": {"voornaam": "Alleen"}}]', false,
  (select versie from public.activiteiten where id = '$$ || current_setting('test.b') || $$')) $$),
  'veld_ongeldig', 'zonder achternaam kan niet');
select is(public.t_rz($$ select public.activiteit_opslaan('$$ || current_setting('test.b') || $$', '{}',
  '[{"handeling": "plek_toevoegen", "rol_type": "bob", "tijdelijk_id": "n9"},
    {"handeling": "toewijzen", "tijdelijk_id": "n9", "verwachte_bezetter": null,
     "nieuwe_helper": {"voornaam": "Geen", "achternaam": "Bob"}}]', false,
  (select versie from public.activiteiten where id = '$$ || current_setting('test.b') || $$')) $$),
  'extern_niet_toegestaan', 'een nieuwe externe helper kan geen BOB zijn');
select is(public.t_rz($$ select public.activiteit_opslaan('$$ || current_setting('test.b') || $$', '{}',
  '[{"handeling": "plek_toevoegen", "rol_type": "tapper", "tijdelijk_id": "n9"},
    {"handeling": "toewijzen", "tijdelijk_id": "n9", "verwachte_bezetter": null, "lid_id": "$$
    || current_setting('test.truus') || $$",
     "nieuwe_helper": {"voornaam": "Twee", "achternaam": "Keer"}}]', false,
  (select versie from public.activiteiten where id = '$$ || current_setting('test.b') || $$')) $$),
  'wijziging_ongeldig', 'een lid en een nieuwe helper tegelijk kan niet');
reset role;
select is((select count(*)::int from public.leden where voornaam in ('Dubbel', 'Fout', 'Alleen', 'Geen', 'Twee')), 0,
  'na een fout is er geen helper aangemaakt: alles of niets');

select pg_temp.als('t_truus', 'aal1');
set local role authenticated;
select is(public.t_rz($$ select public.activiteit_opslaan('$$ || current_setting('test.b') || $$', '{}',
  '[{"handeling": "plek_toevoegen", "rol_naam": "Stiekem", "tijdelijk_id": "n9"}]', false, 1) $$),
  'geen_admin', 'een lid kan geen rol of helper toevoegen');
reset role;

-- ===== 3. Verwijderen =====
-- Een gepubliceerde activiteit, met een afmelding.
insert into public.activiteiten (id, naam, datum, starttijd, eindtijd, locatie, status)
values ('a0000000-0000-4000-8000-0000000009e1', 'T Pub weg', '2099-06-01', '20:00', '23:00', 'Zaal', 'gepubliceerd'),
       ('a0000000-0000-4000-8000-0000000009e2', 'T Geweest', '2020-06-01', '20:00', '23:00', 'Zaal', 'gepubliceerd');
insert into public.rol_slots (activiteit_id, rol_type, bezetter_id) values
  ('a0000000-0000-4000-8000-0000000009e1', 'eindverantwoordelijke', (select lid from pg_temp.gebruikers where naam = 't_mark')),
  ('a0000000-0000-4000-8000-0000000009e1', 'tapper', (select lid from pg_temp.gebruikers where naam = 't_truus'));
insert into public.afmeldingen (activiteit_id, lid_id) values
  ('a0000000-0000-4000-8000-0000000009e1', (select id from public.leden where voornaam = 'Kees' and type = 'extern'));

select throws_ok($$ delete from public.activiteiten where id = 'a0000000-0000-4000-8000-0000000009e1' $$,
  'vangnet_alleen_concept', 'buiten de functie om blijft een gepubliceerde activiteit staan (vangnet)');

select pg_temp.als('t_truus', 'aal1');
set local role authenticated;
select is(public.t_rz($$ select public.activiteit_verwijderen('a0000000-0000-4000-8000-0000000009e1') $$),
  'geen_admin', 'een lid kan niets verwijderen');
reset role;

select pg_temp.als('t_mark', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.activiteit_verwijderen(gen_random_uuid()) $$), 'activiteit_onbekend',
  'een onbekende activiteit: activiteit_onbekend');
select is(public.t_rz($$ select public.activiteit_verwijderen('a0000000-0000-4000-8000-0000000009e2') $$),
  'activiteit_niet_open', 'een activiteit die al geweest is, blijft staan');
select is(public.activiteit_verwijderen('a0000000-0000-4000-8000-0000000009e1') ->> 'status', 'gepubliceerd',
  'een gepubliceerde activiteit die nog moet komen, kan weg');
select is(public.activiteit_verwijderen(current_setting('test.a')::uuid) ->> 'status', 'concept',
  'een concept kan ook weg');
reset role;
select is((select count(*)::int from public.rol_slots where activiteit_id = 'a0000000-0000-4000-8000-0000000009e1')
          + (select count(*)::int from public.afmeldingen where activiteit_id = 'a0000000-0000-4000-8000-0000000009e1'),
  0, 'de plekken en afmeldingen gaan mee');
select is((select array_agg(actie || ': ' || omschrijving order by id) from public.wijzigingen_log
            where actie in ('activiteit_verwijderd', 'concept_verwijderd')
              and rij_id in ('a0000000-0000-4000-8000-0000000009e1', current_setting('test.a')::uuid)),
  array['activiteit_verwijderd: T Pub weg (01-06-2099) verwijderd na publiceren',
        'concept_verwijderd: T Rollen (01-05-2099) verwijderd als concept'],
  'het verwijderen staat in het wijzigingenlog, een concept zoals voorheen');

select * from finish();
rollback;
