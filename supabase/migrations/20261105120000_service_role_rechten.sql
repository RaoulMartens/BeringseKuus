-- service_role krijgt zijn rechten op de tabellen in public nu uitdrukkelijk, in plaats van ze van de standaardrechten van het
-- project te verwachten.
--
-- Waarom: de lokale Supabase geeft service_role vanzelf alle rechten op elke tabel in public (standaardrechten). Het online
-- project deed dat niet: het script dat de ledenlijst zet (npm run leden:zet) kreeg daar "permission denied for table groepen"
-- (42501), terwijl alle tests lokaal groen waren. Lokaal en online gedragen zich nu hetzelfde, en een tabel die later bijkomt
-- krijgt dezelfde rechten.
--
-- Wat niet verandert: dezelfde twee beperkingen als in 20261029100100_fase1_rechten.sql (PR22-07): service_role mag geen
-- tabel leegmaken (truncate slaat de triggers over) en de auditlog niet wijzigen of wissen. De revokes volgen daarom op
-- de grants. Voor een tabel die later bijkomt geldt wat daar staat: eigen revoke waar het moet, de rechtentest controleert het.
--
-- service_role omzeilt row level security; deze rechten maken dus niets open voor een lid of een bezoeker (die gebruiken
-- anon en authenticated, daar verandert niets aan). Het is de sleutel van een script of, later, van de taken-Worker.
--
-- Bewust nog niet: uitvoerrechten op functies in public. Het script voor de ledenlijst roept er geen aan. Online kan het
-- zijn dat service_role die ook niet vanzelf heeft (20261027120000_standaardrechten_dicht.sql trekt execute voor PUBLIC in);
-- controleer dat vóór de taken-Worker van fase 7 en geef dan precies de functies die hij nodig heeft execute.

grant select, insert, update, delete, references, trigger on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;

revoke truncate on all tables in schema public from service_role;
revoke update, delete on public.wijzigingen_log from service_role;

-- Voor tabellen en reeksen die latere migraties maken, zoals lokaal. Uitdrukkelijk voor de rol postgres, die de migraties
-- draait (zoals 20261027120000_standaardrechten_dicht.sql): een migratie als een andere rol zet het niet stilletjes
-- elders. Bewust zonder truncate: online komt een nieuwe tabel zo niet met een recht dat we elke keer weer moeten intrekken
-- (lokaal geeft Supabase het wel mee, daar blijft de revoke per tabel nodig).
alter default privileges for role postgres in schema public
  grant select, insert, update, delete, references, trigger on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select, update on sequences to service_role;
