# Leden beheren in de app (UC-013)

Tot nu toe zette de bouwer telefoon, groepen en aanmerkingen met `npm run leden:zet` en een lid dat stopte met SQL
(`Pilotleden.md`). Het bestuur doet dat nu zelf, in Beheer onder **Leden**.

## Wat er is

| Scherm | Wat |
|---|---|
| `/beheer/leden` | Alle actieve leden met een zoekveld. Bovenaan "Vraagt aandacht": wie nog nooit is ingelogd. Filter actief / inactief. |
| `/beheer/leden/[lid]` | Eén lid: e-mailadres en laatst ingelogd (niet te wijzigen), telefoon, groepen, "mag BOB zijn", "mag eindverantwoordelijke zijn" en de komende diensten. Opslaan is groen als er iets te bewaren is. |
| `/beheer/leden/[lid]/inactief` | Bevestigen: toont vooraf welke plekken openvallen. |
| `/beheer/leden/inactief` | De inactieve leden; een rij opent de bevestiging van weer actief maken. |
| `/beheer/leden/[lid]/actief` | Bevestigen van weer actief maken. |

Na elke handeling gaat de beheerder naar het overzicht met een melding in de woorden van de knop. Op het beheeroverzicht staat een
kaart "Leden" met de taak als regel ("2 nog niet ingelogd").

## Regels (in de database, migratie `20261126100000_ledenbeheer.sql`)

Vijf functies, elk alleen voor een beheerder met een recente code (`intern.is_beheerder()`); de app vertaalt alleen de foutcode.

- **R30.** Op inactief zetten maakt alle komende plekken van het lid leeg (concept en gepubliceerd). Afmeldingen en eerdere diensten
  blijven staan. Eén transactie: eerst de locks op de betrokken activiteiten in vaste volgorde (O-4a), dan het lid.
- **R31.** Een inactief lid is geen lid meer (`intern.huidig_lid()`), krijgt geen indeling, bericht of uitnodiging en komt in geen
  keuzelijst. De sessies worden verwijderd. Weer actief maken brengt de plekken van eerder niet terug.
- **R32.** Is het lid eindverantwoordelijke van een gepubliceerde activiteit, dan mag het toch op inactief: de plek valt open en de
  activiteit komt onder "Vraagt aandacht". De bevestigpagina zegt dat vooraf.
- **R33.** Jezelf of een beheerder zet je niet op inactief (`zelf`, `is_beheerder`); trek eerst de rechten in. Zo blijft er altijd een
  beheerder over. Naam en e-mailadres wijzig je hier niet.
- **R34.** Elke handeling staat in `wijzigingen_log` (`lid_inactief_gezet`, `lid_actief_gezet`, `lid_gewijzigd`).
- Een groepswijziging die het lid uit de doelgroep haalt van een activiteit waar het een plek heeft, wordt geweigerd
  (`dienst_blokkeert`, met de activiteiten). Een lid heeft minstens één groep. Een telefoonnummer wissen kan niet (R21); een leeg veld
  laat het nummer staan.
- Een beheeraccount (`alleen_beheer`) en een externe helper staan niet in de lijst.

## Wat er niet is (volgende stap)

- **Een nieuw lid toevoegen** en **de uitnodiging opnieuw sturen**: die maken een inlogaccount aan, en de geheime sleutel daarvoor hoort
  alleen bij de taken-Worker (Bouwbesluiten). Voorlopig blijft dat `leden:zet` en `leden:uitnodigen`.
- Anonimiseren na twee jaar (FO 12) en een bericht aan het lid of de leden bij inactief zetten (berichten staan nog uit, `Berichten.md`).
- Gelijktijdig bewerken van hetzelfde lid door twee beheerders: de laatste opslag wint (de plekken en groepen worden wel
  tegen elkaar beschermd door de locks).

## Tests

- `supabase/tests/database/ledenbeheer.test.sql` (36): rechten, lijst, lezen, opslaan en elke foutcode, inactief zetten en weer actief.
- `src/lib/leden.test.ts`: de teksten, het tellen van wijzigingen en het lezen van het antwoord van de database.
- `e2e/ledenbeheer.spec.ts`: het hele pad in de browser, met toegankelijkheidscontrole.
- `rechten.test.sql` en `fase2_opslaan.test.sql` kennen de vijf functies: ze mogen worden aangeroepen en `lid_inactief_zetten` schrijft in
  `rol_slots`.
