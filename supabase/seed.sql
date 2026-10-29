-- Seed voor de lokale database (`supabase db reset`): het programma 2026/2027 (bouwgids 13.5) en verzonnen leden.
-- Alleen lokaal en in de poort; het ontwikkelproject krijgt de seed niet (de job migraties doet db push zonder seed),
-- en het pilotproject nooit. Hier staan geen echte persoonsgegevens: namen en adressen zijn verzonnen (example.com).
-- De seed draait als postgres en mag daarom rechtstreeks in de tabellen schrijven; de app nooit (Datamodel punt 10).
--
-- Bewust geen doelgroepen (activiteit_groep): de tests tellen wat een lid ziet en rekenen op een seed zonder.

update public.verenigingsinstellingen set bus_vertrekplaats = 'Parkeerplaats Sporthal';

-- ===== Verzonnen leden =====
-- Mark is lid én bestuurslid; is_admin staat aan. Een echte tweede factor (MFA) stel je lokaal zelf in (stap D, daarvoor
-- zet je TOTP aan in config.toml). Zonder factor krijgt hij geen beheerrechten. beheerder_sinds staat ver in de toekomst:
-- is_beheerder() telt alleen een factor van vóór dat moment, dus lokaal telt elke factor die je nu inschrijft. Online
-- draait deze seed nooit; daar zet de trigger beheerder_sinds op het moment waarop is_admin aangaat (PR22-02).
-- Draai nooit `supabase db reset --linked`: dat zou het ontwikkelproject leegmaken en deze verzonnen leden erin zetten.
create temp table seed_leden (
  voornaam text, achternaam text, groepen text[], admin boolean default false, mag_bob boolean default false,
  mag_eindverantw boolean default false
);
insert into seed_leden (voornaam, achternaam, groepen, admin, mag_bob, mag_eindverantw) values
  ('Mark', 'Hendriks', '{Bestuur}', true, false, true),
  ('Ger', 'Hermans', '{Bestuur}', false, false, true),
  ('Wim', 'Coumans', '{}', false, true, false),
  ('Truus', 'Janssen', '{Dames}', false, false, false),
  ('Piet', 'Verhoeven', '{}', false, false, false),
  ('Loes', 'Driessen', '{Dames}', false, false, false),
  ('Sjaak', 'Nelissen', '{}', false, false, false),
  ('Anne', 'Smeets', '{Dames}', false, false, false),
  ('Karin', 'Peeters', '{"Raad van Elf"}', false, false, false),
  ('Ton', 'Gubbels', '{"Raad van Elf"}', false, false, false),
  ('Math', 'Reijnders', '{"Raad van Elf"}', false, false, false),
  ('Bert', 'Claessens', '{"Raad van Elf"}', false, false, false);

do $$
declare
  r record;
  v_uid uuid;
  v_lid uuid;
  v_email text;
begin
  for r in select * from seed_leden loop
    v_uid := gen_random_uuid();
    v_email := lower(r.voornaam || '.' || r.achternaam) || '@example.com';
    -- Een Auth-account zoals GoTrue het maakt, zonder wachtwoord: inloggen kan met een link per mail.
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
    values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email, now(),
            '{"provider": "email", "providers": ["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid, v_uid::text, jsonb_build_object('sub', v_uid::text, 'email', v_email), 'email',
            now(), now(), now());
    insert into public.leden (auth_user_id, voornaam, achternaam, type) values (v_uid, r.voornaam, r.achternaam, 'lid')
    returning id into v_lid;
    insert into public.leden_prive (lid_id, email, is_admin, beheerder_sinds, mag_bob, mag_eindverantw)
    values (v_lid, v_email, r.admin, case when r.admin then timestamptz '2099-01-01 00:00+00' end, r.mag_bob, r.mag_eindverantw);
    insert into public.lid_groep (lid_id, groep_id)
    select v_lid, g.id from public.groepen g where g.naam = any (r.groepen);
  end loop;
end
$$;

-- Een externe helper: geen inlog, wel een e-mailadres voor de dagmelding (V8 3.1 en 9).
with nieuw as (
  insert into public.leden (voornaam, achternaam, type) values ('Hulp', 'Helper', 'extern') returning id
)
insert into public.leden_prive (lid_id, email) select id, 'hulp.helper@example.com' from nieuw;

-- ===== Het programma Vastelaovend 2026/2027 =====
-- 28 regels, 32 activiteiten: de verkoop van donateurskaarten (4 t/m 8 januari) is vijf dagen, dus vijf activiteiten.
-- Alleen datum en naam zijn bekend: alles komt als concept (bouwgids 13.5). "Prins Onthulling" zonder namen.
insert into public.activiteiten (naam, datum) values
  ('Jaarvergadering', '2026-11-09'),
  ('Onthulling Prins + jeugd prinsenpaar', '2026-11-14'),
  ('Intern kennis maken met Prins/Adjudant', '2026-11-15'),
  ('Heilige mis en Liedjesfestival Beringse Kuus', '2026-11-21'),
  ('BCL-treffen in Kerkrade (o.v.b.)', '2026-11-22'),
  ('Verlovingsbal boerenbruidspaar', '2027-01-03'),
  ('Verkoop donateurskaarten', '2027-01-04'),
  ('Verkoop donateurskaarten', '2027-01-05'),
  ('Verkoop donateurskaarten', '2027-01-06'),
  ('Verkoop donateurskaarten', '2027-01-07'),
  ('Verkoop donateurskaarten', '2027-01-08'),
  ('Receptie Graasvraeters Grashoek', '2027-01-08'),
  ('Liedjesfestival P&M in Helden', '2027-01-09'),
  ('Receptie Kemphazen Egchel', '2027-01-10'),
  ('Voorverkoop Bonte Avonden', '2027-01-10'),
  ('Bonte Avond', '2027-01-15'),
  ('Bonte Avond', '2027-01-16'),
  ('Jeugd van Vreuger middig', '2027-01-17'),
  ('Receptie Kuus oeht Kepel Panningen', '2027-01-17'),
  ('Receptie Brookhazen Koningslust', '2027-01-24'),
  ('Prinsen receptie Beringe', '2027-01-30'),
  ('Receptie Dörper Kuus Helden', '2027-01-31'),
  ('Schoolcarnaval', '2027-02-05'),
  ('Machtsoverdracht Kessel-Eik', '2027-02-05'),
  ('Optocht / Optochtbal', '2027-02-07'),
  ('Boerenbruiloft', '2027-02-08'),
  ('Excursie Prins 2027', '2027-02-09'),
  ('De Doorgedreijde Dinsig', '2027-02-09'),
  ('Aafsloeting café de Nabber', '2027-02-09'),
  ('Opruimen en Hieringsjille', '2027-02-10'),
  ('Ledenvergadering', '2027-03-08'),
  ('Feestavond', '2027-05-22');

-- Elke activiteit heeft precies één lege eindverantwoordelijke, zoals activiteit_opslaan het aanmaakt.
insert into public.rol_slots (activiteit_id, rol_type, volgorde)
select id, 'eindverantwoordelijke', 0 from public.activiteiten;

-- Een paar activiteiten zijn al ingevuld en gepubliceerd, met verzonnen tijden en plaatsen, zodat de ledenschermen
-- iets tonen. De tijden en de locatie zijn niet uit het programma: dat bevat ze niet.
update public.activiteiten
   set verzameltijd = '18:45', starttijd = '20:11', eindtijd = '01:11', locatie = 'Gemeenschapshuis De Kuus',
       bus_vertrektijd = '19:15', status = 'gepubliceerd'
 where naam = 'Bonte Avond';
update public.activiteiten
   set verzameltijd = '13:00', starttijd = '14:00', eindtijd = '18:00', locatie = 'Gemeenschapshuis De Kuus',
       status = 'gepubliceerd'
 where naam = 'Verlovingsbal boerenbruidspaar';
update public.activiteiten
   set verzameltijd = '12:00', starttijd = '13:00', eindtijd = '17:00', locatie = 'Beringe', bus_vertrektijd = '12:15',
       status = 'gepubliceerd'
 where naam = 'Optocht / Optochtbal';
update public.activiteiten
   set verzameltijd = '10:30', starttijd = '11:00', eindtijd = '15:00', locatie = 'Gemeenschapshuis De Kuus',
       status = 'gepubliceerd'
 where naam = 'Opruimen en Hieringsjille';

-- Plekken bij de gepubliceerde activiteiten: de eindverantwoordelijke en een paar diensten, deels bezet.
update public.rol_slots s
   set bezetter_id = (select l.id from public.leden l where l.voornaam = 'Ger' and l.achternaam = 'Hermans')
  from public.activiteiten a
 where s.activiteit_id = a.id and s.rol_type = 'eindverantwoordelijke' and a.status = 'gepubliceerd';
insert into public.rol_slots (activiteit_id, rol_type, volgorde)
select a.id, r.rol, r.volgorde
  from public.activiteiten a
 cross join (values ('werker', 1), ('werker', 2), ('werker', 3), ('drankhaler', 4), ('drankhaler', 5), ('fotograaf', 6))
   as r(rol, volgorde)
 where a.status = 'gepubliceerd';
-- Op elke gepubliceerde activiteit staan Truus als werker en Loes als drankhaler; de rest blijft leeg.
update public.rol_slots s
   set bezetter_id = (select l.id from public.leden l where l.voornaam = 'Truus' and l.achternaam = 'Janssen')
 where s.id in (select min(s2.id::text)::uuid from public.rol_slots s2 join public.activiteiten a on a.id = s2.activiteit_id
                 where a.status = 'gepubliceerd' and s2.rol_type = 'werker' group by s2.activiteit_id);
update public.rol_slots s
   set bezetter_id = (select l.id from public.leden l where l.voornaam = 'Loes' and l.achternaam = 'Driessen')
 where s.id in (select min(s2.id::text)::uuid from public.rol_slots s2 join public.activiteiten a on a.id = s2.activiteit_id
                 where a.status = 'gepubliceerd' and s2.rol_type = 'drankhaler' group by s2.activiteit_id);

-- Twee afmeldingen, zodat het aantal aanwezigen niet het aantal leden is.
insert into public.afmeldingen (activiteit_id, lid_id, toelichting)
select a.id, l.id, 'Verzonnen reden'
  from public.activiteiten a, public.leden l
 where (a.naam, a.datum, l.voornaam) in (('Bonte Avond', date '2027-01-15', 'Piet'),
                                          ('Optocht / Optochtbal', date '2027-02-07', 'Anne'));
