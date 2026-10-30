-- Het programma Vastelaovend 2026/2027 voor het ONTWIKKELproject (SQL Editor), zodat het scherm Programma echte regels toont.
-- Bron: het programma van de vereniging (2026-2027 Programma cvBK.pdf): 28 regels, 32 activiteiten (de verkoop van
-- donateurskaarten van 4 t/m 8 januari is vijf dagen). Alleen datum en naam zijn bekend, dus alles komt als concept en
-- alleen een beheerder ziet het. De regels zijn dezelfde als in supabase/seed.sql.
--
-- Veilig om twee keer te draaien: staat er al een activiteit, dan gebeurt er niets.
do $$
begin
  if exists (select 1 from public.activiteiten) then
    raise notice 'Er staan al activiteiten; er is niets toegevoegd.';
    return;
  end if;

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
end
$$;
