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
| `/beheer/leden/nieuw` en `/nieuw/bevestigen` | Een lid toevoegen: formulier (naam, e-mailadres, telefoon, groepen, bijzondere rollen) en een bevestigingspagina. Formulier en bevestiging delen de ingevulde waarden via een layout (`nieuwlidstaat.tsx`), zodat Annuleren je terugbrengt in het ingevulde formulier. |
| `/beheer/leden/[lid]/uitnodigen` | De uitnodiging opnieuw sturen aan een lid dat nog nooit is ingelogd (bevestigen). |
| `/beheer/leden/[lid]/adres` | Het e-mailadres corrigeren van een lid dat nog nooit is ingelogd; het lid krijgt een uitnodiging op het nieuwe adres. |
| `/beheer/leden/importeren` | Meerdere leden uit een Excel-bestand (`public/lid-sjabloon.xlsx`): bestand kiezen, controle (de proef van de database), toevoegen. Alles of niets. |

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

## Leden toevoegen en uitnodigen (BA-11)

De app kan geen inlogaccount aanmaken: dat vraagt de geheime sleutel van Supabase en die hoort alleen bij de taken-Worker. Daarom werkt dit zoals de
berichten per mail (`Berichten.md`), in migratie `20261127110000_leden_toevoegen.sql`:

1. De database maakt het lid aan (`leden`, `leden_prive`, `lid_groep`) en zet in dezelfde transactie een opdracht klaar in `lid_uitnodigingen`. Het lid
   staat dus meteen in lijsten, groepen en het overzicht, zonder account (`auth_user_id` is leeg).
2. De taken-Worker (`stuurUitnodigingen`, elke minuut) pakt de opdrachten op met `claim_uitnodigingen` (atomair; het aantal pogingen telt bij het oppakken,
   na vijf is het `mislukt`), maakt het inlogaccount aan, of zet het nieuwe e-mailadres als het account een ander adres heeft, stuurt de uitnodigingsmail
   (de tekst van `scripts/uitnodiging.ts`, zonder de alinea over de proef) en legt het resultaat vast met `uitnodiging_afronden`, ook de koppeling van het
   account aan het lid. Een fout laat de opdracht staan voor een volgende run; één mislukte opdracht stopt de rest niet.
3. Met `BERICHT_TEST_ADRES` gaat de mail naar dat adres (met [TEST] in het onderwerp); het account wordt dan wel echt aangemaakt.

Functies (alleen beheerders met een recente code; de Worker-functies alleen `service_role`):
`lid_toevoegen`, `lid_uitnodiging_opnieuw` (niet vaker dan één keer per 10 minuten, R39), `lid_adres_corrigeren` (alleen zolang het lid nooit is ingelogd),
`leden_importeren` (met `p_proef` alleen een controle per regel; zonder is het alles of niets, een bestaand adres wordt overgeslagen, R40) en
`leden_uitnodigingen` (de laatste opdracht per lid, voor de lijst en het lidscherm). Foutcodes: `email_bestaat` (met het lid erbij, voor de link),
`email_ongeldig`, `email_dubbel`, `veld_ontbreekt`, `groep_nodig`, `al_ingelogd`, `te_snel`, `lid_inactief`, `adres_ongewijzigd`, `import_fout`.

Een lid dat nog niet is ingelogd staat onder "Vraagt aandacht" met de status van de uitnodiging ("uitnodiging wordt verstuurd", "uitgenodigd 14 november",
"versturen is mislukt"). Zonder Worker (geheimen niet gezet) blijft het bij "wordt verstuurd": de opdracht wacht.

## Herinnering aan wie nog niet is ingelogd

Een lid dat na de uitnodiging nog nooit is ingelogd krijgt **één** herinnering, 3 dagen na de laatste verstuurde uitnodiging; nooit meer dan één per lid. Wil de
beheerder nog een keer mailen, dan stuurt hij zelf de uitnodiging opnieuw (lidscherm, "Uitnodiging opnieuw sturen"); daarna volgt er geen automatische herinnering
meer. De taken-Worker draait hiervoor elke ochtend om 07:00 UTC (`HERINNERING_CRON`, `zetHerinneringenKlaar`) en roept `herinneringen_klaarzetten` aan; die zet een
opdracht klaar (`soort = 'herinnering'` in `lid_uitnodigingen`) die de gewone minuuttaak verstuurt, met een eigen, kortere mail (`maakHerinnering`). Alleen actieve
leden die kunnen inloggen: geen beheeraccount, geen extern, niet inactief, en alleen als de uitnodiging echt is verstuurd (geen opdracht die nog wacht). Een lid dat
inlogt of inactief wordt gezet, krijgt er geen. Op "Vraagt aandacht" staat "herinnerd 18 november"; het lidscherm zegt "Herinnering verstuurd op …". De 3 dagen zijn de
standaardwaarde van de functie.

Niet: een herinnering voor leden die de bouwer met `leden:uitnodigen` heeft uitgenodigd (die hebben geen opdracht in `lid_uitnodigingen`), en een schakelaar om
herinneringen uit te zetten.

## Wat er niet is

- Anonimiseren na twee jaar (FO 12) en een bericht aan het lid of de leden bij inactief zetten (dat laatste volgt met de berichten, `Berichten.md`).
- Het e-mailadres wijzigen van een lid dat al inlogt: dat is het adres waarmee het lid inlogt (R33). Daarvoor is nog geen scherm.
- Gelijktijdig bewerken van hetzelfde lid door twee beheerders: de laatste opslag wint (de plekken en groepen worden wel tegen elkaar beschermd door de locks).

## Tests

- `supabase/tests/database/ledenbeheer.test.sql` (36): rechten, lijst, lezen, opslaan en elke foutcode, inactief zetten en weer actief.
- `src/lib/leden.test.ts`: de teksten, het tellen van wijzigingen en het lezen van het antwoord van de database.
- `e2e/ledenbeheer.spec.ts`: het hele pad in de browser, met toegankelijkheidscontrole.
- `supabase/tests/database/leden_toevoegen.test.sql` (46): toevoegen, de foutcodes, opnieuw uitnodigen, adres corrigeren, import (proef en alles of niets) en de opdrachten voor de Worker.
- `src/lib/ledenimport.test.ts`, `scripts/taken-uitnodigingen.test.ts` en `e2e/ledenbeheer-toevoegen.spec.ts`: het bestand lezen, de Worker, en de schermen in de browser.
- `rechten.test.sql` en `fase2_opslaan.test.sql` kennen de vijf functies: ze mogen worden aangeroepen en `lid_inactief_zetten` schrijft in
  `rol_slots`.
