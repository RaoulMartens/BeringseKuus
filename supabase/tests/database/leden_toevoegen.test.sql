-- Databasetests voor leden toevoegen in de app (migratie 20261127110000): een lid toevoegen, de uitnodiging opnieuw sturen, het adres
-- corrigeren, meerdere leden tegelijk en de opdrachten voor de taken-Worker. Draaien met: npm run test:db. Alleen eigen namen ("T ...").


begin;
create extension if not exists pgtap with schema extensions;
select plan(55);

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

-- De foutcode van een aanroep als tekst ("geen fout" als het lukt), en het detail van de laatste fout.
create function public.t_rz(p_sql text) returns text
language plpgsql
as $$
declare v_msg text; v_detail text;
begin
  execute p_sql;
  perform set_config('test.detail', '', true);
  return 'geen fout';
exception when others then
  get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
  perform set_config('test.detail', coalesce(v_detail, ''), true);
  return v_msg;
end
$$;
grant execute on function public.t_rz(text) to authenticated;

select pg_temp.maak('t_beheer', true);
select pg_temp.maak('t_lid');
select pg_temp.maak('t_ingelogd');
update auth.users set last_sign_in_at = now() where email = 't_ingelogd@example.com';

select set_config('test.ingelogd', (select lid::text from pg_temp.gebruikers where naam = 't_ingelogd'), true);
select set_config('test.dames', (select id::text from public.groepen where naam = 'Dames'), true);
select set_config('test.bestuur', (select id::text from public.groepen where naam = 'Bestuur'), true);

-- ===== 1. Wie het mag =====
select pg_temp.als('t_lid', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.lid_toevoegen('T Piet', 'Aarts', 't_piet@example.com', null, array['$$ || current_setting('test.dames') || $$']::uuid[]) $$),
  'geen_admin', 'een gewoon lid voegt niemand toe');
select is(public.t_rz($$ select public.leden_importeren('[]'::jsonb) $$), 'geen_admin', 'een gewoon lid importeert niets');
reset role;
select pg_temp.als('t_beheer', 'aal1');
set local role authenticated;
select is(public.t_rz($$ select public.lid_toevoegen('T Piet', 'Aarts', 't_piet@example.com', null, array['$$ || current_setting('test.dames') || $$']::uuid[]) $$),
  'geen_admin', 'een beheerder zonder recente code voegt niemand toe');
reset role;

-- ===== 2. Een lid toevoegen =====
select pg_temp.als('t_beheer', 'aal2');
set local role authenticated;
select set_config('test.res1', public.lid_toevoegen('  T Piet ', 'Aarts', '  T_Piet@Example.com ', '06 12 34 56 78',
  array[current_setting('test.dames')::uuid, current_setting('test.bestuur')::uuid], true, false)::text, true);
reset role;

select is((select p.email from public.leden_prive p where p.lid_id = (current_setting('test.res1')::jsonb ->> 'lid_id')::uuid),
  't_piet@example.com', 'het adres is zonder spaties en hoofdletters opgeslagen');
select is((select l.voornaam || ' ' || l.achternaam || '|' || l.actief::text || '|' || coalesce(l.auth_user_id::text, 'geen account')
             from public.leden l where l.id = (current_setting('test.res1')::jsonb ->> 'lid_id')::uuid),
  'T Piet Aarts|true|geen account', 'actief lid zonder inlogaccount (dat maakt de taken-Worker)');
select is((select count(*)::int from public.lid_groep where lid_id = (current_setting('test.res1')::jsonb ->> 'lid_id')::uuid), 2, 'twee groepen');
select is((select p.telefoon || '|' || p.mag_bob::text || '|' || p.mag_eindverantw::text
             from public.leden_prive p where p.lid_id = (current_setting('test.res1')::jsonb ->> 'lid_id')::uuid),
  '06 12 34 56 78|true|false', 'telefoon en aanmerkingen zijn overgenomen');
select is((select count(*)::int from public.lid_uitnodigingen where lid_id = (current_setting('test.res1')::jsonb ->> 'lid_id')::uuid and status = 'wacht'),
  1, 'er staat één opdracht klaar voor de taken-Worker');
select is((select count(*)::int from public.wijzigingen_log where actie = 'lid_toegevoegd' and rij_id = (current_setting('test.res1')::jsonb ->> 'lid_id')::uuid),
  1, 'het staat in het wijzigingenlog');

-- ===== 3. Foutcodes =====
select pg_temp.als('t_beheer', 'aal2');
set local role authenticated;
select is(public.t_rz($$ select public.lid_toevoegen('T Twee', 'Test', 'T_PIET@example.com', null, array['$$ || current_setting('test.dames') || $$']::uuid[]) $$),
  'email_bestaat', 'een bestaand adres, hoofdletters tellen niet mee');
select is(public.t_rz($$ select public.lid_toevoegen('T Twee', 'Test', 'geen-adres', null, array['$$ || current_setting('test.dames') || $$']::uuid[]) $$),
  'email_ongeldig', 'een adres dat niet klopt');
select is(public.t_rz($$ select public.lid_toevoegen('T Twee', 'Test', 't_twee@example.com', null, array[]::uuid[]) $$),
  'groep_nodig', 'minstens één groep');
select is(public.t_rz($$ select public.lid_toevoegen('T Twee', 'Test', 't_twee@example.com', null, array[gen_random_uuid()]) $$),
  'groep_onbekend', 'een onbekende groep');
select is(public.t_rz($$ select public.lid_toevoegen('', 'Test', 't_twee@example.com', null, array['$$ || current_setting('test.dames') || $$']::uuid[]) $$),
  'veld_ontbreekt', 'een voornaam is verplicht');
select is(public.t_rz($$ select public.lid_toevoegen('T Twee', 'Test', 't_twee@example.com', '123', array['$$ || current_setting('test.dames') || $$']::uuid[]) $$),
  'telefoon_ongeldig', 'een telefoonnummer dat niet klopt');
reset role;
select is((select count(*)::int from public.leden where voornaam = 'T Twee'), 0, 'na een fout is er niets aangemaakt');

-- ===== 4. De uitnodiging opnieuw sturen =====
set local role authenticated;
select is(public.t_rz(format($$ select public.lid_uitnodiging_opnieuw(%L) $$, current_setting('test.res1')::jsonb ->> 'lid_id')),
  'te_snel', 'direct na het toevoegen kan het niet nog eens (R39)');
reset role;
update public.lid_uitnodigingen set aangemaakt = now() - interval '1 hour' where lid_id = (current_setting('test.res1')::jsonb ->> 'lid_id')::uuid;
set local role authenticated;
select is(public.t_rz(format($$ select public.lid_uitnodiging_opnieuw(%L) $$, current_setting('test.res1')::jsonb ->> 'lid_id')),
  'geen fout', 'na tien minuten wel');
select is(public.t_rz(format($$ select public.lid_uitnodiging_opnieuw(%L) $$, current_setting('test.ingelogd')::uuid)),
  'al_ingelogd', 'een lid dat al is ingelogd heeft geen uitnodiging nodig');
select is(public.t_rz($$ select public.lid_uitnodiging_opnieuw(gen_random_uuid()) $$), 'lid_onbekend', 'een onbekend lid');
reset role;
select is((select count(*)::int from public.lid_uitnodigingen where lid_id = (current_setting('test.res1')::jsonb ->> 'lid_id')::uuid), 2,
  'er zijn nu twee opdrachten');

-- ===== 5. Het e-mailadres corrigeren =====
set local role authenticated;
select is(public.t_rz(format($$ select public.lid_adres_corrigeren(%L, 't_ingelogd@example.com') $$, current_setting('test.res1')::jsonb ->> 'lid_id')),
  'email_bestaat', 'het nieuwe adres hoort al bij een ander lid');
select is(public.t_rz(format($$ select public.lid_adres_corrigeren(%L, 'T_Piet@example.com') $$, current_setting('test.res1')::jsonb ->> 'lid_id')),
  'adres_ongewijzigd', 'hetzelfde adres is niets te corrigeren');
select is(public.t_rz(format($$ select public.lid_adres_corrigeren(%L, 't_ander@example.com') $$, current_setting('test.ingelogd')::uuid)),
  'al_ingelogd', 'een lid dat al is ingelogd houdt zijn adres (R33)');
select is(public.t_rz(format($$ select public.lid_adres_corrigeren(%L, 't_nieuw@example.com') $$, current_setting('test.res1')::jsonb ->> 'lid_id')),
  'geen fout', 'het adres wijzigen lukt zolang het lid nooit is ingelogd');
reset role;
select is((select p.email from public.leden_prive p where p.lid_id = (current_setting('test.res1')::jsonb ->> 'lid_id')::uuid), 't_nieuw@example.com',
  'het nieuwe adres staat er');
select is((select count(*)::int from public.lid_uitnodigingen where lid_id = (current_setting('test.res1')::jsonb ->> 'lid_id')::uuid and status = 'wacht'), 3,
  'en er staat een nieuwe opdracht klaar voor het nieuwe adres');

-- Een lid zonder groep (van voor dit scherm) kan zijn adres toch corrigeren.
insert into public.leden (id, voornaam, achternaam, type) values ('00000000-0000-4000-8000-0000000000c1', 'T Zonder', 'Groep', 'lid');
insert into public.leden_prive (lid_id, email) values ('00000000-0000-4000-8000-0000000000c1', 't_zondergroep@example.com');
set local role authenticated;
select is(public.t_rz($$ select public.lid_adres_corrigeren('00000000-0000-4000-8000-0000000000c1', 't_zondergroep2@example.com') $$),
  'geen fout', 'ook een lid zonder groep kan zijn adres corrigeren');
reset role;

-- ===== 6. Meerdere leden =====
select set_config('test.regels', jsonb_build_array(
  jsonb_build_object('regel', 2, 'voornaam', 'T Een', 'achternaam', 'Import', 'email', 't_een@example.com', 'groepen', jsonb_build_array(current_setting('test.dames'))),
  jsonb_build_object('regel', 3, 'voornaam', 'T Twee', 'achternaam', 'Import', 'email', 't_nieuw@example.com', 'groepen', jsonb_build_array(current_setting('test.dames'))),
  jsonb_build_object('regel', 4, 'voornaam', 'T Drie', 'achternaam', 'Import', 'email', 't_drie@example.com', 'groepen', jsonb_build_array(current_setting('test.bestuur')))
)::text, true);
select set_config('test.regels_fout', jsonb_build_array(
  jsonb_build_object('regel', 2, 'voornaam', 'T Een', 'achternaam', 'Import', 'email', 't_een@example.com', 'groepen', jsonb_build_array(current_setting('test.dames'))),
  jsonb_build_object('regel', 3, 'voornaam', 'T Fout', 'achternaam', 'Import', 'email', 'kapot', 'groepen', jsonb_build_array(current_setting('test.dames'))),
  jsonb_build_object('regel', 4, 'voornaam', 'T Dubbel', 'achternaam', 'Import', 'email', 'T_EEN@example.com', 'groepen', jsonb_build_array(current_setting('test.dames')))
)::text, true);

set local role authenticated;
select set_config('test.proef', public.leden_importeren(current_setting('test.regels')::jsonb)::text, true);
reset role;
select is(current_setting('test.proef')::jsonb - 'regels', '{"proef": true, "fouten": 0, "toevoegen": 2, "bestaat_al": 1}'::jsonb,
  'de proef telt: twee nieuw, één bestaat al');
select is((select array_agg(r ->> 'status' order by (r ->> 'regel')::int) from jsonb_array_elements(current_setting('test.proef')::jsonb -> 'regels') r),
  array['toevoegen', 'bestaat_al', 'toevoegen'], 'per regel de uitkomst, met het regelnummer van het bestand');
select is((select count(*)::int from public.leden where achternaam = 'Import'), 0, 'een proef schrijft niets');

set local role authenticated;
select is(public.t_rz(format($$ select public.leden_importeren(%L::jsonb, false) $$, current_setting('test.regels_fout'))),
  'import_fout', 'een regel met een fout houdt alles tegen');
select is(public.t_rz(format($$ select public.leden_importeren(%L::jsonb) $$, current_setting('test.regels_fout'))), 'geen fout',
  'de proef zelf meldt de fouten per regel, zonder te falen');
select set_config('test.proef2', public.leden_importeren(current_setting('test.regels_fout')::jsonb)::text, true);
reset role;
select is((select array_agg(coalesce(r ->> 'code', r ->> 'status') order by (r ->> 'regel')::int) from jsonb_array_elements(current_setting('test.proef2')::jsonb -> 'regels') r),
  array['toevoegen', 'email_ongeldig', 'email_dubbel'], 'ongeldig adres en dubbel adres in het bestand zijn fouten');
select is((select count(*)::int from public.leden where achternaam = 'Import'), 0, 'en er is niets aangemaakt');

set local role authenticated;
select set_config('test.imp', public.leden_importeren(current_setting('test.regels')::jsonb, false)::text, true);
reset role;
select is((select count(*)::int from public.leden where achternaam = 'Import'), 2, 'zonder fouten: twee nieuwe leden, het bestaande adres is overgeslagen');
select is((select count(*)::int from public.lid_uitnodigingen u join public.leden l on l.id = u.lid_id where l.achternaam = 'Import' and u.status = 'wacht'), 2,
  'twee opdrachten voor de taken-Worker');

-- ===== 7. De taken-Worker =====
select is(has_function_privilege('authenticated', 'public.claim_uitnodigingen(int, int)', 'execute'), false, 'een ingelogde gebruiker pakt geen opdrachten op');
select is(has_function_privilege('authenticated', 'public.uitnodiging_afronden(bigint, text, uuid, text)', 'execute'), false, 'en rondt ze niet af');
select is(has_function_privilege('service_role', 'public.claim_uitnodigingen(int, int)', 'execute'), true, 'de taken-Worker wel');

set local role service_role;
select set_config('test.claim', (select jsonb_agg(to_jsonb(c))::text from public.claim_uitnodigingen(100)  c), true);
select is((select count(*)::int from public.claim_uitnodigingen(100)), 0, 'een tweede run pakt dezelfde opdrachten niet nog eens op');
reset role;
select ok(jsonb_array_length(current_setting('test.claim')::jsonb) >= 4, 'de opdrachten zijn opgepakt (twee van de import, het lid en de adreswijziging)');
select is((select count(*)::int from public.lid_uitnodigingen where status = 'wacht' and pogingen = 1), jsonb_array_length(current_setting('test.claim')::jsonb),
  'de poging is geteld');

select set_config('test.opdracht', (select id::text from public.lid_uitnodigingen where lid_id = (current_setting('test.res1')::jsonb ->> 'lid_id')::uuid
  and status = 'wacht' order by id desc limit 1), true);
select set_config('test.account', gen_random_uuid()::text, true);
insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
values (current_setting('test.account')::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        't_nieuw@example.com', now(), now());
set local role service_role;
select public.uitnodiging_afronden(current_setting('test.opdracht')::bigint, 'verstuurd', current_setting('test.account')::uuid);
reset role;
select is((select status from public.lid_uitnodigingen where id = current_setting('test.opdracht')::bigint), 'verstuurd', 'afgerond als verstuurd');
select is((select auth_user_id::text from public.leden where id = (current_setting('test.res1')::jsonb ->> 'lid_id')::uuid), current_setting('test.account'),
  'het inlogaccount is aan het lid gekoppeld');

-- ===== 7b. Herinnering =====
-- Een lid met een verstuurde uitnodiging van 4 dagen geleden, nooit ingelogd: krijgt één herinnering, en daarna geen meer.
select pg_temp.als('t_beheer', 'aal2');
set local role authenticated;
select set_config('test.her', public.lid_toevoegen('T Her', 'Inner', 't_her@example.com', null, array[current_setting('test.dames')::uuid])::jsonb ->> 'lid_id', true);
reset role;
update public.lid_uitnodigingen set status = 'verstuurd', verstuurd_op = now() - interval '4 days', aangemaakt = now() - interval '4 days'
 where lid_id = current_setting('test.her')::uuid;
set local role service_role;
select is(public.herinneringen_klaarzetten(), 1, 'na 3 dagen zonder inloggen komt er een herinnering klaar');
select is(public.herinneringen_klaarzetten(), 0, 'een tweede keer maakt niets bij (er wacht er al een)');
reset role;
select is((select soort || ' ' || status from public.lid_uitnodigingen where lid_id = current_setting('test.her')::uuid order by id desc limit 1),
  'herinnering wacht', 'de herinnering is een opdracht voor de Worker');
update public.lid_uitnodigingen set status = 'verstuurd', verstuurd_op = now() - interval '10 days', aangemaakt = now() - interval '10 days'
 where lid_id = current_setting('test.her')::uuid and soort = 'herinnering';
set local role service_role;
select is(public.herinneringen_klaarzetten(), 0, 'ook lang daarna komt er geen tweede herinnering: hooguit één');
reset role;
-- De beheerder kan zelf nog een keer mailen (de uitnodiging opnieuw), en ook dan volgt er geen automatische herinnering meer.
select pg_temp.als('t_beheer', 'aal2');
set local role authenticated;
select is(public.t_rz(format($$ select public.lid_uitnodiging_opnieuw(%L) $$, current_setting('test.her'))), 'geen fout', 'de beheerder stuurt zelf de uitnodiging opnieuw');
reset role;
update public.lid_uitnodigingen set status = 'verstuurd', verstuurd_op = now() - interval '5 days', aangemaakt = now() - interval '5 days'
 where lid_id = current_setting('test.her')::uuid and soort = 'uitnodiging' and status = 'wacht';
set local role service_role;
select is(public.herinneringen_klaarzetten(), 0, 'na een zelf gestuurde uitnodiging volgt er geen tweede automatische herinnering');
reset role;
select is((select count(*)::int from public.lid_uitnodigingen where lid_id = current_setting('test.her')::uuid and soort = 'herinnering'), 1, 'één herinnering in totaal');
select is((select count(*)::int from public.lid_uitnodigingen where lid_id = (current_setting('test.res1')::jsonb ->> 'lid_id')::uuid and soort = 'herinnering'), 0,
  'een lid dat net een uitnodiging kreeg of nog wacht krijgt er geen');
select is(has_function_privilege('authenticated', 'public.herinneringen_klaarzetten(int)', 'execute'), false, 'alleen de taken-Worker zet herinneringen klaar');

-- ===== 8. De uitnodigingen in de lijst =====
select pg_temp.als('t_beheer', 'aal2');
set local role authenticated;
select is((select status from public.leden_uitnodigingen() where lid_id = (current_setting('test.res1')::jsonb ->> 'lid_id')::uuid), 'verstuurd',
  'per lid de laatste opdracht');
reset role;

select * from finish();
rollback;
