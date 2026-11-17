-- Een lid zet zijn eigen telefoonnummer (Rogers wens, 05-11-2026): voor een eindverantwoordelijke is het nummer nodig (R21: een
-- gepubliceerde activiteit heeft een eindverantwoordelijke met nummer), en het bestuur hoeft ze niet meer met een lijst te zetten.
--
-- Een lid schrijft niet rechtstreeks in leden_prive (alleen de functies van de app doen dat). Deze functie zet alleen het nummer van het
-- aanroepende lid, nooit dat van een ander, en alleen een nummer dat klopt: cijfers met eventueel spaties en streepjes, beginnend met
-- een 0 of een plus, 9 tot 15 cijfers en hooguit 20 tekens (dezelfde regel als de ledenlijst, scripts/leden-invoer.ts). Het nummer wissen
-- kan niet: een eindverantwoordelijke zonder nummer houdt zijn activiteit tegen; wie zijn nummer kwijt wil, vraagt het bestuur.
--
-- Wie het nummer te zien krijgt, verandert niet: alleen bij de eindverantwoordelijke van een activiteit die iemand mag zien
-- (contact_eindverantwoordelijke, R10).
create function public.zet_eigen_telefoon(p_telefoon text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_lid uuid := intern.huidig_lid();
  v_nummer text := regexp_replace(btrim(coalesce(p_telefoon, '')), '\s+', ' ', 'g');
  v_cijfers int := length(regexp_replace(v_nummer, '\D', '', 'g'));
begin
  if v_lid is null then
    perform intern.fout('geen_lid');
  end if;
  if length(v_nummer) > 20 or v_nummer !~ '^[0+][0-9 -]*$' or v_cijfers < 9 or v_cijfers > 15 then
    perform intern.fout('telefoon_ongeldig');
  end if;

  update public.leden_prive set telefoon = v_nummer where lid_id = v_lid;
end
$$;

revoke all on function public.zet_eigen_telefoon(text) from public, anon;
grant execute on function public.zet_eigen_telefoon(text) to authenticated;
