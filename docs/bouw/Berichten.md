# Berichten per mail (O-1)

Het platform kan een lid per mail laten weten dat er iets verandert bij een gepubliceerde activiteit (R18, BA-4). Dit
document legt uit hoe het werkt, wat bewust niet, en hoe je het aanzet.

## Hoe het werkt

1. **De database zet berichten klaar.** Bij een wijziging van een gepubliceerde activiteit zet een trigger een regel in de
   tabel `berichten` (een postvak-uit). Dat gebeurt in dezelfde transactie als de wijziging: faalt de wijziging, dan staat
   er ook geen bericht. Migratie `20261117120000_berichten.sql`, tests `supabase/tests/database/berichten.test.sql`.
2. **De taken-Worker verstuurt ze.** `taken/worker.ts` draait elke minuut (Cron Trigger), haalt de wachtende regels op,
   voegt de regels van één lid over één activiteit samen tot één mail (`taken/berichten.ts`) en verstuurt die via
   Postmark. Daarna staat de regel op `verstuurd`. Gaat het mis, dan blijft hij staan voor de volgende minuut, tot vijf
   pogingen; dan staat hij op `mislukt` met een foutcode. Een regel ouder dan 24 uur wordt niet meer verstuurd
   (`mislukt`, fout `verlopen`).
3. **Waarom een postvak-uit en niet direct mailen?** Een bericht gaat zo alleen uit als de wijziging echt is doorgevoerd,
   een storing bij Postmark kan een wijziging niet laten mislukken, en alleen de taken-Worker heeft de geheime sleutels
   (de app niet: `docs/hosting.md`, Geheimen).

## Wie krijgt wat

| Wat verandert | Wie krijgt een mail |
|---|---|
| Naam, datum, verzameltijd, begintijd, eindtijd, locatie, busplaats of bustijd, afmeld-deadline, minimaal aanwezig | Alle leden die de activiteit zien en zich niet hebben afgemeld |
| Iemand wordt ingedeeld | Dat lid ("Je staat ingedeeld als werker.") |
| Iemand wordt vervangen | Allebei: de oude ("niet meer ingedeeld") en de nieuwe |
| Iemand gaat van een plek af, of de plek wordt weggehaald | Dat lid |
| De doelgroep verandert | Wie de activiteit daardoor niet meer ziet |
| Een concept wordt gepubliceerd | De leden met een plek |
| Een gepubliceerde activiteit wordt verwijderd | De leden met een plek |

**Nooit:** een concept (R18), het type of het seizoen, een activiteit die al afgelopen is, de wijziger zelf (die weet het),
het beheeraccount, een inactief lid, een externe helper (geen adres), en een wijziging zonder verschil (opslaan zonder iets
te veranderen).

**Bewust nog niet:** het notitieveld. BA-4 zegt dat de beheerder zelf kiest of een notitie een bericht geeft; die keuze
(een vinkje bij het opslaan) is er nog niet, dus nu gaat er voor een notitie geen mail uit. Ook niet gebouwd: de stap
"Wie krijgt bericht" vóór het opslaan, en een mail aan het bestuur onder het minimum.

Wat er in een mail staat, is een regel per wijziging: "Begint: nu 19:30 (was 20:00)." De mail heeft een tekst- en een
HTML-versie, geen afbeeldingen en geen volglinks (`TrackOpens` uit, `TrackLinks` geen).

## Aanzetten (door de eigenaar van het Cloudflare-account)

De code staat online en de regels worden al klaargezet, maar er gaat **geen mail uit zolang de geheimen ontbreken**: een
run schrijft dan één regel in de logs en doet niets. Zo zet je het aan, eerst als proef.

1. **Supabase**, Project Settings, API Keys: maak een nieuwe secret key met de naam `berichten_taak`. Hij gaat om alle
   rechten heen: gebruik hem nergens anders en zet hem nooit bij de app-Worker. Kopieer hem niet naar een bestand of chat.
2. **Cloudflare**, Workers, `ledenplatform-taken`, Settings, Variables and Secrets. Voeg toe, allemaal van het type
   *Secret* (een variabele van het type *Text* haalt de volgende uitrol weg):
   - `SUPABASE_URL`: dezelfde project-URL als bij de app;
   - `SUPABASE_SECRET_KEY`: de key uit stap 1;
   - `POSTMARK_TOKEN`: het server-token van Postmark (hetzelfde als bij de uitnodiging; de oude is vervangen);
   - `BERICHT_AFZENDER`: het afzenderadres met naam, `Naam <adres>`, een adres waarvan het domein bij Postmark is
     geverifieerd;
   - `BERICHT_ONDERTEKENING`: de naam onder de mail, bijvoorbeeld de naam van de vereniging;
   - `SITE_URL`: het adres van de site (zonder slash achteraan);
   - **voor de proef:** `BERICHT_TEST_ADRES`: je eigen adres. Zolang dit gezet is, gaat **elke** mail naar dat adres met
     [TEST] in het onderwerp en krijgt geen lid iets. De berichten die in die tijd klaarstaan zijn dan wel verbruikt.
3. **Proef:** wijzig in beheer een gepubliceerde activiteit (bijvoorbeeld de begintijd) en wacht een minuut. Je krijgt de
   mail op het testadres. Controleer onderwerp, regels, datum en link. In Supabase, Table Editor, `berichten`: de regels
   staan op `verstuurd`. In Cloudflare, `ledenplatform-taken`, Observability: "berichten: N verstuurd".
4. **Echt aanzetten:** verwijder `BERICHT_TEST_ADRES`. Vanaf dan krijgen de leden de mails.
5. **Teksten in de app aanpassen** (nu zeggen ze nog "er gaat geen bericht uit"): `acties.ts` en de bevestigingspagina bij
   verwijderen, het formulier van een gepubliceerde activiteit, en de pagina na een overdracht (ruilen). Dat is een
   aparte wijziging, te doen op het moment dat de mail echt aan gaat; niet eerder, want de teksten moeten waar zijn.

## Wat je ziet als het misgaat

- `mislukt` met fout `postmark_<code>`: Postmark weigerde (401: token fout; 422: afzenderadres niet geverifieerd of het
  adres klopt niet; 429: te veel mails). Los de oorzaak op en zet de regels terug op `wacht` in de Table Editor.
- `mislukt` met fout `geen_adres`: het lid heeft geen adres in `leden_prive`.
- `mislukt` met fout `verlopen`: de regel was ouder dan 24 uur toen de Worker hem zag (mail stond uit).
- Valt de verbinding weg tussen het versturen en het bijwerken van de status, dan krijgt dat lid dezelfde mail twee keer.
  Dat is bewust het kleinere kwaad boven een mail die nooit aankomt.
- De logs bevatten alleen aantallen en foutcodes, nooit namen, adressen of tekst.
