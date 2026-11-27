# Oud papier automatisch (UC-014)

Het systeem maakt elke eerste vrijdag en zaterdag van de maand (het hele jaar, ook buiten het seizoen) een concept
"Oud papier" aan, 12 maanden vooruit. De beheerder ziet ze in het gewone overzicht en maakt ze af (tijden, indelen,
publiceren).

## Hoe het werkt

- De taken-Worker (`taken/worker.ts`) draait elke nacht om 03:00 UTC (`taken/wrangler.jsonc`) en roept de databasefunctie
  `oud_papier_aanmaken` aan (migratie `20261127100000_oud_papier.sql`, tests `supabase/tests/database/oud_papier.test.sql`).
  Alleen `service_role` mag die functie aanroepen.
- **Concept (BA-10):** een concept geeft geen bericht aan leden (R18); pas bij publiceren is het zichtbaar.
- **Zo goed mogelijk gevuld:** verzameltijd, starttijd, eindtijd, locatie, doelgroep, het aantal plekken per rol en de
  eindverantwoordelijke komen van de dichtstbijzijnde volledig ingevulde oud-papierdag op dezelfde weekdag (vrijdag van
  vrijdag, zaterdag van zaterdag; eerst eentje ervoor, anders erna). De eindverantwoordelijke wordt alleen overgenomen als die
  nog actief lid is (geen extern en geen beheeraccount). De andere plekken blijven leeg: wie er staat is het indelen, met
  "Wie is aan de beurt?".
- **Er is nog geen voorbeeld?** Dan wordt het concept kaal (alleen datum en een lege eindverantwoordelijke-plek). Vul één
  vrijdag en één zaterdag in en publiceer of bewaar die; de concepten die daarna worden aangemaakt volgen het voorbeeld.
  Bestaande kale concepten worden niet achteraf aangepast.
- **Nooit dubbel (R36):** de tabel `oud_papier_aangemaakt` onthoudt per datum dat het systeem die heeft aangemaakt, ook als de
  beheerder het concept daarna verwijdert of verplaatst. Staat er op een dag al een oud-papieractiviteit, dan slaat het die
  dag over. Een andere dag (feestdag) pas je per concept aan of verwijder je.
- In het wijzigingenlog staat de aanmaker als "het systeem" (geen lid).

## Niet

De herinnering een week van tevoren en de melding op de dag zelf (FO 6, 11) zijn apart werk.

## Aanzetten

Niets te doen: bij de eerstvolgende uitrol krijgt de taken-Worker de tweede trigger, en de eerste run maakt de concepten aan.
Een run met `select public.oud_papier_aanmaken();` in de SQL-editor van Supabase doet hetzelfde direct. Bij een eerste run
zonder voorbeeld: eerst een vrijdag en zaterdag met de hand invullen en dan pas runnen, of verwijder de kale concepten en
laat de taak ze nog eens aanmaken (de lijst `oud_papier_aangemaakt` moet dan ook leeg: `delete from public.oud_papier_aangemaakt;`).
