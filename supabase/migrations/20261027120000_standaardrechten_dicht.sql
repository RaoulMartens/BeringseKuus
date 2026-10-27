-- Standaardrechten dicht (bouwgids 14.4, Bouwbesluiten 4.3).
--
-- Supabase geeft nieuwe tabellen, reeksen en functies in het schema public standaard rechten voor de rollen anon
-- (niet ingelogd) en authenticated (ingelogd). Dan is een nieuwe tabel via de Data API bereikbaar voordat er
-- bewust rechten zijn gegeven. Deze migratie zet die standaard uit: elke tabel en functie krijgt zijn rechten
-- expliciet, in de migratie waarin hij wordt aangemaakt, met een test op wat níet mag.
--
-- Migraties draaien als de rol postgres; de standaardrechten hieronder gelden voor objecten die postgres aanmaakt.

alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;

-- Postgres geeft functies daarnaast standaard EXECUTE aan iedereen (PUBLIC). Dat is een algemene standaard,
-- niet per schema, en moet daarom zonder "in schema" worden uitgezet.
alter default privileges for role postgres revoke execute on functions from public;
