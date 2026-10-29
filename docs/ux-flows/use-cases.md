# Use cases — Ledenplatform C.V. De Beringse Kuus

Bron: `FO_Beringse_Kuus_V4.docx` (het "wat") en `Bouwgids_Beringse_Kuus_V7.docx` (het "hoe").
Scope: **MVP-pilot**, leden en beheer. Desktop-first (1200px), met een mobiele weergave.

## Scope

**In scope (uitgewerkt in deze fase)**

| ID | Naam |
|----|------|
| UC-001 | Activiteit bekijken — via het welkomscherm (vandaag) of via het programma |
| UC-002 | Dienst ruilen (werker / drankhaler / fotograaf) |
| UC-003 | Afmelden voor een activiteit (incl. intrekken) |
| UC-004 | Activiteit aanmaken, bewerken en publiceren (admin) |
| UC-005 | Leden indelen op rol-slots (admin) |
| UC-006 | Meerdere activiteiten tegelijk aanmaken: vorig seizoen kopiëren of Excel-sjabloon importeren (admin) |
| UC-007 | Mijn diensten bekijken: al je diensten in één overzicht (lid) |
| UC-008 | Activiteiten in je agenda zetten en up-to-date houden (lid) |

UC-006 is toegevoegd op 02-10-2026 na feedback van de opdrachtgever (gemak bij de start van een seizoen).
UC-007, UC-008, de groepen (BA-7) en de bak (BA-8) zijn toegevoegd op 15-10-2026 na een vergadering van de opdrachtgever met het bestuur. Ze staan voorlopig in het prototype; wat daarbij nog bij de opdrachtgever ligt staat onder "update van de opdrachtgever van 15-10-2026" in `UX-FLOWS.md`.
UC-004 en UC-005 zijn toegevoegd op 18-09-2026. Aanleiding: de bouwgids zet
"activiteiten aanmaken (admin)" in fase 1 en "admin deelt in" in fase 2 — dus
vóór de ledenflows uit fase 3. Zonder die twee schermen is er niets om te tonen,
te ruilen of om je voor af te melden.

**Buiten scope (latere fase)**
Excel-import en registratiestatus (FO 8.2/8.3; een eenvoudige import van *activiteiten* via een sjabloon zit sinds 02-10-2026 wel in UC-006), ledenbeheer en het op inactief
zetten van leden (FO 8.1/9.1), activiteit annuleren (FO 5, fase 5),
openstaande-ruilverzoeken (FO 3.1, fase 5), eerlijke-verdelingsoverzicht
(FO 9.2, fase 6), oud papier automatisch aanmaken (FO 6, fase 7),
meldingeninstellingen en de wijzigingenlog-weergave (FO 9.1, 11).

## Actoren

| Actor | Toelichting |
|-------|-------------|
| Lid | Ingelogd verenigingslid (`type = 'lid'`, `actief = ja`). Standaard aanwezig bij elke activiteit. |
| Systeem | App + database (Supabase-functies die de regels afdwingen). |
| Admin | Bestuurslid (`is_admin`). Maakt activiteiten aan, deelt leden in, en is de enige die BOB en eindverantwoordelijke toewijst. In de ledenflows daarnaast het *vangnet buiten de app*. |
| Vervanger | Ander actief verenigingslid dat een dienst overneemt (R14). |
| Externe helper | `type = 'extern'`. Wordt door de admin in een slot geplaatst, heeft geen inlog, geen ruil- of afmeldrechten, telt niet mee voor de ondergrens (R12). Komt in deze flows alleen voor als naam in de rolbezetting. |

## Domeinregels die in alle flows kloppend moeten zijn

| # | Regel | Bron |
|---|-------|------|
| R1 | Elk **actief verenigingslid** (`type = 'lid'`) staat standaard op aanwezig; alleen afmeldingen worden vastgelegd. Externe helpers en op inactief gezette leden vallen buiten deze telling (R12). | FO 4, BG 3.4 |
| R2 | Een lid komt pas uit een **eigen ruilbare** dienst als het zelf een vervanger aanwijst; die wissel is één handeling, dus door zelf ruilen ontstaat nooit een lege plek. De admin kan een slot wél leegmaken — bijvoorbeeld bij het op inactief zetten van een lid (FO 8.1). | FO 3, BG 4 |
| R3 | De afstemming wie overneemt gebeurt buiten de app. De app registreert alleen de uitkomst. Er is géén "vraag om te ruilen"-functie in deze MVP. | FO 3 |
| R4 | BOB en eindverantwoordelijke zijn niet zelf ruilbaar en niet zelf afmeldbaar; alleen de admin wijzigt die rollen. | FO 2.2, 4.2 |
| R5 | Een vervanger mag niet al afgemeld zijn voor die activiteit. | FO 3, BG 4 |
| R6 | Een vervanger mag niet al op een ander rol-slot van dezelfde activiteit staan (dubbelboeking). Afgedwongen met een unieke constraint op `(activiteit_id, bezetter_id)` waar `bezetter_id` niet leeg is. | FO 3, BG 3.3/4 |
| R7 | Afmelden met een ruilbare rol = eerst ruilen. | FO 4.2, BG 5.1 |
| R8 | Afmelden wordt geblokkeerd als **alle drie** waar zijn: (a) de afmeld-deadline is verstreken, (b) de ondergrens staat aan, en (c) na de afmelding blijven er *minder dan* `min_aanwezigen` aanwezigen over. Exact op de ondergrens uitkomen is dus toegestaan. De deadline is verstreken vanaf het moment `nu > afmeld_deadline`; op het deadline-moment zelf mag je nog vrij afmelden. Is er geen deadline ingesteld, dan blokkeert de ondergrens nooit. Melding: "Meld je bij de eindverantwoordelijke, afmelden gaat nu niet i.v.m. laag aantal aanwezigen." | FO 4.1, BG 5.2 |
| R9 | Een afmelding kan altijd worden ingetrokken zolang de activiteit nog niet is geweest. Een geruilde rol komt niet terug. | FO 4.3, BG 5.3 |
| R10 | Op het welkomscherm is alleen het telefoonnummer van de eindverantwoordelijke zichtbaar voor andere leden. | FO 7.1, BG 7.1 |
| R11 | Bij twee of meer activiteiten op één dag worden ze allemaal getoond, op tijd, tot hun eindtijd (R16). *Besluit 11-09-2026 schrapte dit uit de MVP; teruggedraaid op 02-10-2026 omdat de opdrachtgever zegt dat het voorkomt (Jeugdmiddag 12-15u, daarna de receptie in Panningen 15:30-21:00, met wisselende werkers per activiteit).* | FO 7.1 |
| R12 | Externe helpers tellen niet mee voor de ondergrens en hebben geen ruil-/afmeldrechten. | FO 8, BG 9 |
| R13 | Lege rol-slots zijn niet zichtbaar voor leden. **Aanvullend ontwerpbesluit** (11-09-2026), niet uit de bronnen: een lid kan een open plek niet zelf innemen, en lege plekken zijn in het FO een adminsignaal. | FO 9.2, BG 3.3 |
| R14 | Alleen een **actief verenigingslid** (`type = 'lid'`, `actief = ja`) kan als vervanger worden aangewezen. Externe helpers worden door de admin geplaatst; inactieve leden krijgen geen indelingen meer. Server-side te controleren. | FO 8.1, BG 9 |
| R15 | Ruilen en afmelden kunnen alleen bij een activiteit met status `gepubliceerd` die nog niet is geweest. Concept- en geannuleerde activiteiten zijn voor leden niet benaderbaar. | FO 5, FO 11, BG 3.2 |
| R16 | Een activiteit is **geweest** zodra het eindtijdstip is gepasseerd: `datum + eindtijd`, plus één dag als de eindtijd vóór de starttijd ligt (de Bonte Avond eindigt om 01:00). Tot dat moment kan een afmelding worden ingetrokken. *Besluit 18-09-2026; de bronnen laten dit open.* | FO 4.3, BG 3.2 |
| R18 | Meldingen gaan pas uit zodra een activiteit de status `gepubliceerd` heeft. Zolang hij concept is, ziet alleen de admin hem en gebeurt er niets. Wijzigt er daarna iets dat bepaalde personen raakt, dan krijgen alleen die personen bericht, met vermelding van wat er is gewijzigd. | FO 11, BG 8.3 |
| R19 | De geschiktheidsvlaggen `mag_bob` en `mag_eindverantw` zijn een **hulp bij het kiezen**, geen slot. Het FO noemt ze "vooral een hulp"; de admin mag ervan afwijken en ziet dan een waarschuwing. Voor fotograaf bestaat geen vlag. | FO 10, BG 3.1 |
| R20 | De dubbelboeking-regel (R6) geldt óók voor de admin: de unieke constraint op `(activiteit_id, bezetter_id)` staat niemand toe twee slots bij dezelfde activiteit te bezetten, ongeacht wie de wijziging doet. | BG 3.3 |
| R21 | Een activiteit kan alleen worden gepubliceerd als het slot **eindverantwoordelijke** bezet is door een lid met een telefoonnummer, en als de **eindtijd** is ingevuld. Gewone dienstslots mogen leeg blijven. Na publicatie kan de eindverantwoordelijke alleen rechtstreeks worden vervangen, niet leeggemaakt. *Aanvullend ontwerpbesluit 18-09-2026.* | FO 4.1, 7.1 |
| R17 | Alleen een actief verenigingslid kan vervanger zijn; een **externe helper niet**. Helpers worden door de admin geplaatst (BG 9) en tellen niet mee voor de ondergrens, dus een dienst die bij hen terechtkomt is niet afgestemd. *Besluit 18-09-2026; de bronnen laten dit open.* | BG 9 |
| R22 | Een activiteit heeft een **doelgroep**: iedereen, of één of meer groepen (Bestuur, Raad van Elf, Dames, Overige leden; "Bestuur en Raad van Elf" voor een gezamenlijke vergadering, de opdrachtgever 16-10-2026). Alleen leden van die groepen zien de activiteit en tellen mee als aanwezig (R1); wie er niet in zit ziet hem nergens: niet in het programma, in Mijn diensten, in de agenda of in meldingen. Een lid kan in meer groepen zitten (Mark is lid én bestuur). Zichtbaarheid is iets anders dan beheerrechten: de groep Bestuur geeft geen beheerrechten. Afgedwongen in RLS, niet alleen in het scherm. De doelgroep gaat mee bij kopiëren en in het Excel-sjabloon (kolom `voor_wie`, leeg is iedereen). Zichtbaar in `programma-raadslid.html`: een lid buiten het bestuur ziet de Bestuursvergadering niet. Wijzigt de groep van een gepubliceerde activiteit, dan is dat altijd een melding (BA-4): wie hem daardoor niet meer ziet, krijgt bericht. De keuzelijst toont hoeveel leden elke groep heeft en waarschuwt bij een gepubliceerde activiteit; de opslagstap toont vooraf hoeveel leden hem niet meer zien (`admin-wijzigingen-opslaan-groep.html`, interactiecheck B2). | BA-7 (voorlopig) |
| R23 | De **bak** (prins, adjudant, vorst en de elf raadsleden van de Raad van Elf, samen 14; bij de Bonte Avond en bij andere activiteiten waar het bestuur de bak aanzet) is een lijst plekken die alleen de admin wijzigt; **alle leden die de Bonte Avond zien, zien de bak als lijst (alleen lezen)**, onder de rolbezetting, in de opgeslagen stand (16-10-2026). Een lid kan zijn plek in de bak niet ruilen of zich ervoor afmelden: zelfde vlag `alleen_admin` als BOB en eindverantwoordelijke (R4). De bak wordt vooraf gevuld met de Raad van Elf, de prins, de adjudant en de vorst; de admin vervangt iemand, bijvoorbeeld bij ziekte. Een wijziging in de bak meldt de betrokkenen, zoals bij andere plekken (BA-4). Het lid krijgt in de statuskaart geen knop Afmelden maar het nummer van de eindverantwoordelijke (`welkom-raadslid.html`, interactiecheck B4); de server weigert een afmelding voor een plek in de bak ook. | BA-8 (voorlopig) |
| R24 | De agenda-feed is alleen bereikbaar met een geheime persoonlijke link (token) en bevat uitsluitend wat het lid mag zien (R22, R15). Een activiteit waarvoor het lid is afgemeld staat er niet in. Het token kan worden vervangen; de oude link werkt dan niet meer. | BA-9 (voorlopig) |

## Gelijktijdigheid: één slot per activiteit

`ruil_dienst()`, `meld_af()` en `trek_afmelding_in()` raken alle drie dezelfde
gedeelde toestand: wie is er ingedeeld en hoeveel mensen zijn er aanwezig bij
*deze* activiteit. Een transactie alleen is niet genoeg — twee gelijktijdige
afmeldingen kunnen allebei een telling lezen die nog niet de ander bevat, en
samen onder de ondergrens zakken.

**Daarom nemen alle drie de functies als eerste handeling dezelfde rij-lock:**

```sql
SELECT * FROM activiteiten WHERE id = p_activiteit_id FOR UPDATE;
```

Dat serialiseert elke schrijfactie op één activiteit: de tweede transactie wacht
tot de eerste klaar is en ziet dan de bijgewerkte stand. Gevolgen:

| Scenario | Zonder gezamenlijke lock | Met de lock op `activiteiten` |
|----------|--------------------------|-------------------------------|
| Twee leden melden zich tegelijk af, 14 aanwezig, ondergrens 13 | Beiden lezen 14, beiden mogen, resultaat 12 — grens doorbroken | De tweede leest 13, ziet 12 < 13, wordt geweigerd |
| Lid X wordt vervanger terwijl X zich afmeldt | Beide slagen: X is bezetter én afgemeld | Wie tweede is, ziet de andere staat en wordt geweigerd (`vervanger_afgemeld` of `heeft_ruilbare_rol`) |
| Twee ruilacties op verschillende slots, zelfde vervanger | Rij-locks op de slots raken elkaar niet; alleen de unieke constraint vangt het | De tweede wacht en wordt netjes geweigerd met `dubbelboeking` |

Bij `trek_afmelding_in()` is de lock niet nodig voor de correctheid — intrekken
verhoogt het aantal aanwezigen en kan de ondergrens nooit doorbreken — maar hij
staat er wel, zodat alle schrijfacties op een activiteit dezelfde volgorde
aanhouden.

De unieke constraint uit R6 blijft daarnaast bestaan als vangnet op databaseniveau
(BG 3.3, 4.2): ook een schrijfactie die buiten deze functies om zou gaan, kan geen
dubbelboeking maken.

---

## UC-001 — Activiteit bekijken

| Veld | Inhoud |
|------|--------|
| **ID** | UC-001 |
| **Naam** | Activiteit bekijken (welkomscherm = vandaag/eerstvolgend) |
| **Actoren** | Lid, Systeem |
| **Preconditions** | Lid is ingelogd (persistente sessie, FO 8). Er is minimaal één gepubliceerde activiteit, of niet (zie AF-1). |

**Main flow**

1. Lid komt binnen via een van twee ingangen:
   - **Inloggen of "Start"** — het systeem kiest de gepubliceerde activiteit van vandaag, of anders de eerstvolgende. Kop: "Alaaf, [voornaam]"; de dag (Vandaag, Morgen of de datum) staat als label boven de naam op het activiteitkaartje.
   - **Programma → een rij aanklikken** — het systeem toont die activiteit. Kop: naam en datum van de activiteit.
2. Vanaf hier is het scherm identiek: dezelfde opbouw, dezelfde acties. Alleen de vulling verschilt, want weken vooruit is nog niet alles ingevuld.
3. Systeem toont per activiteit: datum, verzameltijd, starttijd, eindtijd, locatie.
4. Systeem toont "Bus vertrekt" met de tijd en de vertrekplaats (de plaats is een vaste instelling van de vereniging, tenzij de admin voor deze activiteit een andere plek invult) en de notitie "Belangrijk om te weten" als die zijn ingevuld. Zijn ze leeg — wat bij een activiteit verderop in het seizoen normaal is — dan benoemt het scherm dat ze nog niet zijn ingevuld, in plaats van de blokken stilzwijgend weg te laten (AF-7).
5. Systeem toont de rolbezetting: werkers, drankhalers, fotograaf, BOB, eindverantwoordelijke — met naam per bezet slot. Nog niet ingevulde rol-slots worden **niet** getoond aan leden (R13).
6. Systeem toont **alleen** bij de eindverantwoordelijke het telefoonnummer (R10).
7. Systeem haalt de **eigen** afmeldstatus op voor deze activiteit. Afmeldingen van andere leden worden hier niet opgehaald — die zijn pas nodig in UC-002 (zie daar, stap 3).
8. Systeem bepaalt uit de geladen bezetting en de eigen afmeldstatus de begintoestand: afgemeld, of aanwezig zonder rol, met ruilbare rol, of met adminrol.
9. Systeem markeert de eigen rol in de lijst. De acties staan niet in de lijst maar op één plek in de zijkolom "Jouw status".
10. Lid leest de informatie en kiest eventueel een actie → UC-002 of UC-003.

**Alternative flows**

- **AF-1 — Geen geplande activiteit.** Er is geen activiteit vandaag en geen toekomstige gepubliceerde activiteit. Systeem toont een lege staat: "Er staat op dit moment niets gepland." Geen acties beschikbaar.
- **AF-2 — Twee activiteiten op één dag.** Zie AF-8. (Eerst als MVP-afwijking geschrapt, sinds 02-10-2026 weer in de MVP, zie R11.)
- **AF-3 — Lid is afgemeld voor deze activiteit.** Systeem toont de status "Je bent afgemeld" met de actie "Afmelding intrekken" (R9) in plaats van "Afmelden".
- **AF-4 — Lid heeft geen rol.** Rolbezetting wordt gewoon getoond; het lid ziet alleen de actie "Afmelden".
- **AF-5 — Concept- of geannuleerde activiteit.** Niet zichtbaar voor leden; het systeem slaat ze over bij het bepalen van de eerstvolgende activiteit (R15).
- **AF-6 — Laden mislukt.** Netwerk- of serverfout bij het ophalen. Systeem toont een foutmelding met "opnieuw proberen"; er is geen gedeeltelijk scherm.
- **AF-7 — Activiteit nog niet ingedeeld.** Bij een activiteit die verder weg ligt heeft het bestuur vaak nog geen rol-slots gevuld. Omdat lege slots verborgen zijn (R13) zou de rolbezetting dan leeg zijn; het systeem toont in plaats daarvan dat de indeling nog niet is gemaakt. Ontbrekende busgegevens en een lege notitie worden op dezelfde manier benoemd in plaats van stilzwijgend weggelaten.
- **AF-8 — Twee activiteiten op één dag (FO 7.1, R11).** Alle activiteiten van vandaag staan op het welkomscherm, onder elkaar **op tijd**, elk met tijden, locatie en eigen rolbezetting (de werkers verschillen per activiteit). In de zijkolom "Jouw status" staat per activiteit wat jij daar doet ("je staat op aanwezig als werker" of "je staat op aanwezig, zonder dienst") met de bijbehorende knoppen: Afmelden, en bij een ruilbare dienst ook Dienst overdragen. Zo staan alle acties op één plek en blijft de volgorde van de dag. *Wat nog komt of loopt:* zodra de eindtijd van een activiteit voorbij is (R16) verdwijnt hij van "Vandaag" en blijft de rest over; hij staat dan in het programma onder "Geweest dit seizoen". Voorbeeld: na 15:00 toont "Vandaag" alleen nog de receptie.

**Postconditions**
Geen datawijziging. Het lid weet waar, wanneer en met welke rol hij verwacht wordt, en wie het aanspreekpunt is.

---

## UC-002 — Dienst ruilen (werker / drankhaler / fotograaf)

| Veld | Inhoud |
|------|--------|
| **ID** | UC-002 |
| **Naam** | Dienst overdragen aan een vervanger |
| **Actoren** | Lid (vertrekkende bezetter), Systeem, Vervanger (passief — wordt aangewezen) |
| **Preconditions** | Lid is bezetter van een rol_slot met rol_type werker, drankhaler of fotograaf. De activiteit is gepubliceerd en nog niet geweest (R15). Het lid heeft **buiten de app** al afgestemd wie overneemt (R3). |

**Main flow**

1. Lid kiest op het welkomscherm in de zijkolom "Dienst overdragen" — of komt hier via de aankondiging uit UC-003 AF-1.
2. Systeem toont het overdrachtsscherm met de dienst (activiteit, rol, tijden) en de uitleg: de afstemming gebeurt onderling; de dienst is direct van de vervanger zodra je bevestigt.
3. Systeem haalt de **beschikbaarheid van mogelijke vervangers** op met een aparte aanroep — `beschikbare_vervangers(activiteit_id)`. Die levert per actief verenigingslid (R14) of het lid kan overnemen, en zo niet, waarom: `afgemeld` of `al_ingedeeld`. Deze gegevens staan niet al klaar uit UC-001; dat scherm haalt alleen de eigen afmeldstatus op.
4. Systeem toont de lijst: beschikbare leden zijn selecteerbaar, niet-beschikbare staan er grijs bij met de reden.
5. Lid selecteert een vervanger.
6. Lid bevestigt de overdracht.
7. `ruil_dienst(rol_slot_id, vervanger_id)` neemt de lock op de activiteit en controleert in één transactie de zes controles uit de tabel hieronder.
8. Systeem zet `bezetter_id` in dezelfde stap van het lid naar de vervanger — er ontstaat geen lege plek (R2).
9. Systeem legt de wijziging vast in de wijzigingenlog en stuurt de vervanger een wijzigingsmelding.
10. Systeem toont een bevestiging: de dienst staat nu op naam van de vervanger; die is vanaf nu verantwoordelijk.
11. Lid keert terug naar het welkomscherm (of gaat door naar stap 2 van de afmeldtaak, zie UC-003 AF-1).

**Servercontroles in `ruil_dienst()`**

| # | Controle | Foutcode | Regel |
|---|----------|----------|-------|
| 1 | Is de aanroeper de huidige bezetter van dit slot? | `geen_bezetter` | BG 4 |
| 2 | Is `rol_type` werker, drankhaler of fotograaf? | `rol_niet_ruilbaar` | R4 |
| 3 | Is de activiteit gepubliceerd en nog niet geweest? | `activiteit_niet_open` | R15 |
| 4 | Is de vervanger een actief verenigingslid (`type = 'lid'`, `actief`)? | `vervanger_ongeldig` | R14 |
| 5 | Is de vervanger niet afgemeld voor deze activiteit? | `vervanger_afgemeld` | R5 |
| 6 | Staat de vervanger niet al op een ander slot van deze activiteit? | `dubbelboeking` | R6 |

Alle zes worden server-side afgedwongen. De UI past controle 4, 5 en 6 alvast toe
op de lijst uit stap 3, zodat je niet tegen een muur loopt die vooraf zichtbaar
was — dat is voorlichting, geen afdwinging.

**Alternative flows**

- **AF-1 — Vervanger is al afgemeld (R5).** In de lijst al zichtbaar en niet selecteerbaar. Bereikt de server toch: wanneer de vervanger zich afmeldt terwijl het lid de lijst open heeft staan. Weigering `vervanger_afgemeld`, de dienst blijft bij het lid staan, lid keert terug naar de vervangerskeuze.
- **AF-2 — Vervanger staat al op een ander slot van dezelfde activiteit (R6).** In de lijst al zichtbaar en niet selecteerbaar. Bereikt de server bij een gelijktijdige ruil (AF-7) of als de admin intussen heeft ingedeeld. Weigering `dubbelboeking`.
- **AF-3 — Rol is BOB of eindverantwoordelijke (R4).** De actie wordt niet getoond. Bij directe navigatie of een handmatige aanroep weigert de server met `rol_niet_ruilbaar`.
- **AF-4 — Vervanger is geen actief verenigingslid (R14).** Externe helper of op inactief gezet lid. Staat niet in de lijst; bereikt de server alleen bij een handmatige aanroep of als het lid net op inactief is gezet. Weigering `vervanger_ongeldig`.
- **AF-5 — Activiteit is niet meer open (R15).** Inmiddels geannuleerd, of het tijdstip is gepasseerd terwijl het scherm openstond. Weigering `activiteit_niet_open`; het lid gaat terug naar het welkomscherm.
- **AF-6 — Lid is zelf niet meer de bezetter.** De admin heeft de dienst herverdeeld. Weigering `geen_bezetter`, terug naar het welkomscherm met de actuele bezetting.
- **AF-7 — Gelijktijdige ruil.** Drie gevallen, zie de tabel in "Gelijktijdigheid" hierboven: hetzelfde slot (→ `geen_bezetter`), verschillende slots binnen dezelfde activiteit (→ `dubbelboeking`), en verschillende activiteiten (geen conflict — een lid mág bij meerdere activiteiten ingedeeld staan).
- **AF-8 — Geen vervanger gevonden.** Het lid gaat terug naar Start ("← Terug naar start"; in de visuele versie is de aparte knop "Annuleren" vervallen omdat hij naar dezelfde plek leidde, de wireframes tonen hem nog). De dienst blijft bij de oorspronkelijke bezetter; er is geen automatische vrijgave (FO 3.1). *De "wil ruilen"-signalering en het admin-overzicht openstaande ruilverzoeken zijn een **MVP-afwijking van FO 3.1**: uitgesteld, niet geschrapt.*

**Postconditions**
`rol_slots.bezetter_id` wijst naar de vervanger. Er is geen lege plek ontstaan.
De wijziging staat in de wijzigingenlog. Het vertrekkende lid is nog steeds
*aanwezig* tenzij het zich daarna ook afmeldt (UC-003).

---

## UC-003 — Afmelden voor een activiteit

| Veld | Inhoud |
|------|--------|
| **ID** | UC-003 |
| **Naam** | Afmelden voor een activiteit (en afmelding intrekken) |
| **Actoren** | Lid, Systeem |
| **Preconditions** | Lid is ingelogd, staat standaard op aanwezig (R1), en de activiteit is gepubliceerd en nog niet geweest (R15). De flow start vanaf het welkomscherm óf vanaf een activiteit die het lid in het programma heeft aangeklikt — afmelden mag voor elke toekomstige activiteit, niet alleen die van vandaag (FO 4). |

**Main flow (lid zonder rol)**

1. Lid kiest op het welkomscherm "Afmelden".
2. Systeem toont het afmeldscherm met de activiteit, de gevolgen en een optioneel toelichtingsveld.
3. Lid bevestigt.
4. `meld_af(activiteit_id, toelichting)` neemt de lock op de activiteit en doorloopt de controles uit de tabel hieronder.
5. Systeem legt een rij vast in `afmeldingen` — inclusief de toelichting, in de kolom `toelichting` (besluit, zie hieronder) — en logt de actie in `wijzigingen_log`.
6. Systeem toont de bevestiging met de actie "Afmelding intrekken".
7. Lid keert terug naar het welkomscherm; daar staat nu de status "Je bent afgemeld".

**Servercontroles in `meld_af()`**

| # | Controle | Foutcode | Regel |
|---|----------|----------|-------|
| 1 | Is de activiteit gepubliceerd en nog niet geweest? | `activiteit_niet_open` | R15 |
| 2 | Bestaat er nog geen afmelding van dit lid voor deze activiteit? | `al_afgemeld` | — |
| 3 | Bezet het lid geen ruilbaar slot bij deze activiteit? | `heeft_ruilbare_rol` | R7 |
| 4 | Bezet het lid geen BOB- of eindverantwoordelijke-slot? | `heeft_adminrol` | R4 |
| 5 | Deadline verstreken **en** ondergrens aan **en** zou onder het minimum zakken? | `onder_ondergrens` | R8 |

Controle 3 en 4 staan bewust ook op de server, niet alleen in het scherm: tussen
het laden van het welkomscherm en het bevestigen kan de admin het lid alsnog
hebben ingedeeld.

**Servercontroles in `trek_afmelding_in()`**

| # | Controle | Foutcode | Regel |
|---|----------|----------|-------|
| 1 | Is de activiteit nog niet geweest? | `activiteit_voorbij` | R9 |
| 2 | Bestaat er een afmelding van dit lid? | `niet_afgemeld` | — |

Geen ondergrens-check: intrekken verhoogt het aantal aanwezigen (BG 5.3).

**Alternative flows**

- **AF-1 — Lid heeft een ruilbare rol (R7).** Afmelden is dan **één taak van twee stappen**. Een eigen pagina kondigt dat vooraf aan: stap 1 vervanger aanwijzen, stap 2 afmelden bevestigen. De route is overal dezelfde:

  `overdracht geslaagd → automatisch door naar stap 2 → meld_af() controleert de rol opnieuw server-side`

  Er is geen tussenscherm dat de rol nog eens laat bevestigen: de unieke constraint uit R6 garandeert dat het lid na de overdracht geen slot meer heeft bij deze activiteit. Wat de server wél opvangt, is dat de admin het lid tussen stap 1 en stap 2 opnieuw indeelt — dan weigert `meld_af()` met `heeft_ruilbare_rol` en staat het lid weer aan het begin van AF-1.

  **Afbreken of geweigerd worden ná stap 1 laat de overdracht staan.** De dienst is dan definitief van de vervanger en het lid is *aanwezig zonder rol*. Dat geldt ook als stap 2 op de ondergrens strandt (AF-3): je bent dan je dienst kwijt én niet afgemeld. Dit wordt vooraf op de aankondigingspagina genoemd en herhaald op het bevestigingsscherm van stap 2.

- **AF-2 — Lid is BOB of eindverantwoordelijke (R4).** Geen afmeldmogelijkheid in de app, ook niet via ruilen. Het welkomscherm toont geen knop Afmelden of Dienst overdragen: de statuskaart zegt dat de rol alleen het bestuur wijzigt en toont het nummer van de eindverantwoordelijke (`welkom-bob.html`, interactiecheck B4). Bij de eindverantwoordelijke zelf is het contact het bestuur. Server: `heeft_adminrol` blijft de controle voor wie het toch probeert, bijvoorbeeld met een verouderd scherm.
- **AF-3 — Ondergrens bereikt (R8).** Alle drie de voorwaarden zijn waar. Systeem blokkeert met exact de tekst: **"Meld je bij de eindverantwoordelijke, afmelden gaat nu niet i.v.m. laag aantal aanwezigen."** Het scherm toont het telefoonnummer van de eindverantwoordelijke als vervolgstap en benoemt beide voorwaarden. Er wordt niets vastgelegd.
- **AF-4 — Ondergrens staat uit (standaard bij oud papier).** Afmelden blijft vrij, ook na de deadline. Een ruilbare rol loopt nog steeds via AF-1.
- **AF-5 — Geen deadline ingesteld.** `afmeld_deadline` is optioneel (BG 3.2). Dan geldt fase 1 permanent: vrij afmelden, de ondergrens blokkeert nooit (R8).
- **AF-6 — Afmelding intrekken (R9).** Lid kiest "Afmelding intrekken". `trek_afmelding_in()` controleert alleen of de activiteit nog niet is geweest, verwijdert de rij en logt de actie. Een eerder overgedragen rol komt **niet** terug.
- **AF-7 — Activiteit is al geweest of geannuleerd.** Systeem toont geen afmeld- of intrek-actie meer; een alsnog binnenkomende aanroep wordt geweigerd met `activiteit_niet_open` respectievelijk `activiteit_voorbij`.
- **AF-8 — Al afgemeld.** Een tweede afmelding voor dezelfde activiteit wordt geweigerd met `al_afgemeld`. Treedt vooral op bij dubbelklikken of een tweede tabblad.

**Postconditions**
Bij succes bestaat er een rij in `afmeldingen` voor (activiteit, lid) — of die rij
is juist verwijderd bij intrekken. Bij een blokkade is er niets gewijzigd en weet
het lid wie hij moet benaderen.

---

---

## UC-004 — Activiteit aanmaken, bewerken en publiceren (admin)

| Veld | Inhoud |
|------|--------|
| **ID** | UC-004 |
| **Naam** | Activiteit beheren |
| **Actoren** | Admin, Systeem |
| **Preconditions** | Ingelogd lid met `is_admin`. |

**Main flow**

1. Admin opent het activiteitenoverzicht: de komende activiteiten, verdeeld in "Vraagt aandacht" en "Op orde". Bovenaan staan twee tellers (diensten nog in te delen, concepten); een tegel kiezen filtert de lijst eronder, en de gekozen tegel of "Alles tonen" brengt je terug. Onder "Vraagt aandacht" staat per regel wat er te doen is ("1 werker indelen", "Eindtijd en eindverantwoordelijke invullen"); is de bezetting de reden (bijna te weinig), dan staat er "Bijna te weinig: 14 aanwezig, minimaal 13". Onder "Op orde" staat "N aanwezig". Een concept heeft het label "concept".
2. Admin kiest "Activiteit aanmaken" (op mobiel een knop direct onder de kop, bovenaan; op desktop in de zijkolom).
3. Admin vult in: **naam**, datum, verzameltijd, starttijd, eindtijd, locatie, en optioneel de busvertrektijd. De vertrekplaats is een vaste instelling van de vereniging (de bus vertrekt bijna altijd vanaf dezelfde plek, de bouwer 15-10-2026); per activiteit is een andere plek in te vullen ("andere plek"). De naam is wat leden overal terugzien — "Bonte Avond", "Oud papier", "Optocht".
4. Admin vult het notitieveld "Belangrijk om te weten" in — mag leeg blijven en later worden aangevuld.
5. Het type hoeft de admin niet te kiezen: een activiteit die hij zelf aanmaakt is een `seizoen`-activiteit. Oud-papieractiviteiten zet het systeem zelf klaar (BG 8.1) met type `oud_papier`. Het minimum aantal aanwezigen staat ingevuld op de standaard, 13; de admin kan dat aanpassen (beslispunt BA-5).
6. Admin voegt per rol plekken toe met "+ werker-plek" enzovoort. Er is geen getalveld: het aantal plekken is het aantal regels. De eindverantwoordelijke heeft altijd precies één plek.
7. Admin stelt optioneel een afmeld-deadline in. Leeg betekent: vrij afmelden tot het einde (R8).
8. Admin kiest "Opslaan als concept". Systeem slaat op met status `concept`. De activiteit is alleen voor admins zichtbaar; er gaan geen meldingen uit (R18).
9. Admin deelt de rollen in → **UC-005**. Dat gebeurt op hetzelfde scherm; er is geen apart indeelscherm.
10. Admin kiest "Publiceren". Systeem controleert de publicatievoorwaarden uit R21 en toont wat publiceren betekent: de activiteit verschijnt bij alle leden en de betrokkenen krijgen bericht.
11. Admin bevestigt. Openstaande wijzigingen en het publiceren gaan samen door (zie "Opslaan"). Status wordt `gepubliceerd`, de wijziging gaat in de wijzigingenlog, en de meldingen gaan uit.

**Opslaan (BG 4.4)**

Alles wat de admin op het activiteitscherm wijzigt — velden, rolbezetting, plekken erbij
of eraf — blijft eerst op het scherm staan, met een stip bij elk gewijzigd veld. Pas bij
Opslaan, Opslaan als concept of Publiceren gaat het naar de server, in één aanroep:
`activiteit_opslaan(activiteit_id, velden, wijzigingen, publiceren)`. Die draait als één
transactie: **faalt één wijziging, dan gaat er niets door**. Zo staat in de database nooit
een half aangepast rooster dat de admin zelf niet op het scherm heeft gezien, en krijgt
niemand bericht over een wijziging die niet is doorgevoerd.

**Publicatievoorwaarden (R21)**

| Voorwaarde | Waarom |
|------------|--------|
| Eindtijd ingevuld | R16 leidt daaruit af wanneer de activiteit "geweest" is. Zonder eindtijd werkt het intrekken van een afmelding op een onbekende grens. |
| Eindverantwoordelijke bezet | Het blokkadescherm bij de ondergrens stuurt een lid naar deze persoon (R8). Zonder bezetting verwijst de app naar niemand. |
| Die persoon heeft een telefoonnummer | Het is het enige nummer dat leden te zien krijgen (R10). Een lege waarde maakt de verwijzing net zo leeg. |

Gewone dienstslots — werker, drankhaler, fotograaf, BOB — mogen wél leeg blijven.
Dat de bezetting nog niet rond is, is normaal en juist zichtbaar (FO 9.2).

**Alternative flows**

- **AF-1 — Bewerken van een concept.** Vrij te wijzigen; er gaan geen meldingen uit, ook niet over rolwijzigingen (R18).
- **AF-2 — Bewerken van een gepubliceerde activiteit.** Mag. Bij opslaan toont het systeem per gewijzigd veld wie er bericht over krijgt, zodat de admin ziet wat hij in gang zet vóór hij bevestigt (R18, BA-4). Ook de afmeld-deadline en de ondergrens vallen daaronder: die bepalen of een lid zich nog kan afmelden, dus een wijziging daarvan raakt iedereen die nog niet is afgemeld. Bij een gewijzigd notitieveld kiest de admin zelf of er bericht uitgaat — een typefout hoeft niet bij vijftig mensen te landen, een gewijzigde verzamelinstructie wel. Wie bericht heeft gekregen en waarover, gaat mee in de wijzigingenlog.
- **AF-3 — Plekken verminderen.** Een lege plek haal je weg met het &times;. Een bezette plek haal je weg via de keuzelijst: "Truus eraf halen → Plek weghalen". Zie beslispunt BA-2.
- **AF-4 — Verplicht veld leeg.** Naam, datum, starttijd en locatie zijn altijd verplicht; het systeem slaat niet op en markeert wat ontbreekt. De eindtijd mag in een concept nog leeg zijn, maar is verplicht om te kunnen publiceren (R21).
- **AF-5 — Publiceren met lege dienstslots.** Toegestaan. Het systeem meldt hoeveel slots nog leeg zijn, maar blokkeert niet (FO 9.2).
- **AF-6 — Publiceren geblokkeerd (R21).** Eindtijd ontbreekt, of het slot eindverantwoordelijke is leeg, of die persoon heeft geen telefoonnummer. De knop Publiceren staat uitgeschakeld. Eronder staat precies welke van de drie ontbreekt, met een link naar het veld: de eindtijd, of de plek eindverantwoordelijke op hetzelfde scherm. De server controleert het opnieuw, omdat een ander bestuurslid intussen iets kan hebben gewijzigd.
- **AF-7 — Terug naar concept.** Niet mogelijk (besluit BA-3). Leden hebben de activiteit al gezien en bericht gehad.
- **AF-8 — Activiteit annuleren.** *Buiten deze scope* (FO 5, fase 5).
- **AF-9 — Weggaan met niet-opgeslagen wijzigingen.** Wie terug klikt, de bovenbalk gebruikt of "Alles ongedaan maken" kiest terwijl er wijzigingen openstaan, krijgt eerst "N wijzigingen weggooien?" met de lijst. Weggooien gooit alles weg; er gaat niets naar de server en niemand krijgt bericht.
- **AF-10 — Concept verwijderen.** Alleen voor een concept (status `concept`): in het statuspaneel staat "Concept verwijderen". Dat opent een eigen bevestigingspagina ("Jeugdmiddag verwijderen?") met de activiteit, wat er meegaat (de indeling, als aantal leden) en de waarschuwing dat het niet terug kan. Na "Concept verwijderen" komt de admin terug op het overzicht met "Jeugdmiddag is verwijderd". Er gaan **geen meldingen** uit: leden zien een concept niet en hebben er niets over gehoord (R18). De server (`concept_verwijderen`) controleert dat de aanroeper admin is (`geen_admin`) en dat de activiteit nog een concept is (`alleen_concept`); is hij intussen gepubliceerd, dan wordt er niets verwijderd en blijft annuleren (AF-8) de weg. Een gepubliceerde activiteit verwijderen kan dus niet: die annuleer je later. Een foute bulk-aanmaak (UC-006) ruim je hiermee op, een concept per keer.

**Postconditions**
Er bestaat een rij in `activiteiten` met bijbehorende lege of gevulde `rol_slots`.
Bij `gepubliceerd` is de activiteit zichtbaar voor leden en zijn de meldingen verstuurd.

---

## UC-005 — Leden indelen op rol-slots (admin)

| Veld | Inhoud |
|------|--------|
| **ID** | UC-005 |
| **Naam** | Indelen |
| **Actoren** | Admin, Systeem |
| **Preconditions** | Ingelogd lid met `is_admin`. De activiteit bestaat en heeft rol-slots. |

**Main flow**

1. Admin opent de activiteit en ziet alle rol-slots, bezet én leeg. Anders dan bij leden (R13) zijn lege plekken hier juist het belangrijkste signaal.
2. Admin klikt op een plek. De naam is het veld: de keuzelijst opent eronder.
3. Systeem toont de beschikbare actieve verenigingsleden en externe helpers. Wie al is ingedeeld bij deze activiteit of zich heeft afgemeld, staat er niet in; die verschijnt alleen als je op de naam zoekt, grijs en met de reden.
4. Gaat het om BOB of eindverantwoordelijke, dan toont het systeem bij elk lid of de geschiktheidsvlag is gezet (R19).
5. Admin kiest een lid. Het scherm toont de nieuwe naam met een stip: gewijzigd, nog niet opgeslagen.
6. Admin herhaalt dit tot de bezetting klopt.
7. Admin kiest Opslaan (of Opslaan als concept, of Publiceren). Bij een gepubliceerde activiteit toont het systeem eerst per wijziging wie er bericht krijgt.
8. Systeem verwerkt alle wijzigingen in één transactie (`activiteit_opslaan`, BG 4.4) en controleert daarbij de tabel hieronder. Lukt alles, dan staat alles in de wijzigingenlog en krijgen de betrokkenen bericht als de activiteit gepubliceerd is (R18). Faalt één controle, dan gaat er niets door.

**Servercontroles bij indelen**

| # | Controle | Foutcode | Regel |
|---|----------|----------|-------|
| 1 | Is de aanroeper admin? | `geen_admin` | FO 9.1 |
| 2 | Is de activiteit niet geannuleerd en nog niet geweest? | `activiteit_niet_open` | R15, R16 |
| 3 | Is het gekozen lid actief? | `lid_inactief` | FO 8.1 |
| 4 | Staat het lid niet al op een ander slot van deze activiteit? | `dubbelboeking` | R6, R20 |
| 5 | Is het lid niet afgemeld voor deze activiteit? | `lid_afgemeld` | besluit BA-1 |
| 6 | Is het slot nog bezet door wie de admin dacht? | `slot_gewijzigd` | zie AF-8 |
| 7 | Is de eindverantwoordelijke van een gepubliceerde activiteit na de opslag nog bezet? | `eindverantwoordelijke_verplicht` | R21, zie AF-4 |

Controle 6 geldt **per plek** die de opslag raakt: elke wijziging stuurt mee wie de admin
op die plek zag staan (`verwachte_bezetter`). Controle 4 en 7 kijken naar de
**eindtoestand**, na alle wijzigingen samen. Anders zou een wissel tussen twee plekken
(Truus naar drankhaler, Loes naar werker) halverwege als dubbelboeking worden geweigerd.

Controle 4 en 5 zijn dezelfde als bij ruilen, maar hier geldt controle 3 breder:
de admin mag ook een **externe helper** indelen (BG 9) — dat is juist de enige
manier waarop een helper aan een dienst komt (R17).

**Alternative flows**

- **AF-1 — Lid staat al op een ander slot (R6/R20).** In de lijst al zichtbaar en niet selecteerbaar; bereikt de server alleen bij gelijktijdig werken. Weigering `dubbelboeking`.
- **AF-2 — Lid is afgemeld.** Zie beslispunt BA-1. Voorstel: blokkeren, met de suggestie eerst met het lid te overleggen.
- **AF-3 — Geschiktheidsvlag ontbreekt (R19).** Het lid heeft geen `mag_bob` of `mag_eindverantw`. Systeem waarschuwt maar blokkeert niet; de admin bevestigt bewust.
- **AF-4 — Bezetter verwijderen.** Admin haalt iemand van een slot af. Dat mag — de regel "nooit een lege plek" (R2) geldt voor leden die zelf ruilen, niet voor de admin. Het slot wordt leeg en het lid krijgt bericht als de activiteit gepubliceerd is. **Uitzondering:** bij een gepubliceerde activiteit kan het slot eindverantwoordelijke niet worden leeggemaakt, alleen rechtstreeks vervangen (R21) — anders valt de contactroute bij een geblokkeerde afmelding weg.
- **AF-5 — Bezetter vervangen.** Admin kiest een ander lid voor een bezet slot. Systeem behandelt dit als verwijderen plus indelen in één handeling. Is de activiteit **gepubliceerd**, dan krijgen beide leden bericht — de een dat hij eraf is, de ander dat hij erop staat. Is hij nog **concept**, dan gaat er niets uit (R18).
- **AF-6 — Lid is inmiddels op inactief gezet.** Weigering `lid_inactief`. Volgens FO 8.1 vallen slots van een inactief gezet lid automatisch leeg.
- **AF-7 — Gelijktijdig werken.** Twee admins, of een admin en een lid dat ruilt, raken dezelfde activiteit. Dezelfde gedeelde lock op de `activiteiten`-rij als bij `ruil_dienst()` en `meld_af()` serialiseert dat.
- **AF-8 — Slot is intussen gewijzigd.** De admin stuurt mee wie hij op het slot dacht aan te treffen. Klopt dat niet meer — een lid heeft zijn dienst overgedragen, of een andere admin was sneller — dan schrijft het systeem **niet** over de nieuwe bezetting heen. Weigering `slot_gewijzigd`, met de actuele bezetting in beeld en de vraag opnieuw te kiezen. Er gaat dan niets van de opslag door, ook niet de wijzigingen op andere plekken; die staan nog klaar op het scherm, zodat de admin na het opnieuw kiezen alles in één keer opnieuw kan opslaan. Zonder deze controle zou de admin ongemerkt een ruil terugdraaien die een lid net zelf heeft geregeld.
- **AF-9 — Wisselen tussen twee plekken.** Admin zet Truus van werker op drankhaler en Loes van drankhaler op werker, en slaat één keer op. Dat mag: dubbelboeking wordt gecontroleerd op de eindtoestand, niet per tussenstap (BG 4.4).

**Postconditions**
Alle wijzigingen van de opslag zijn doorgevoerd, of geen enkele. Wat is doorgevoerd
staat in de wijzigingenlog. Bij een gepubliceerde activiteit zijn de betrokkenen op de
hoogte, met één bericht per persoon.

---

## UC-006 — Meerdere activiteiten tegelijk aanmaken (admin)

| Veld | Inhoud |
|------|--------|
| **ID** | UC-006 |
| **Naam** | Meerdere activiteiten tegelijk aanmaken |
| **Actoren** | Admin, Systeem |
| **Preconditions** | Ingelogd lid met `is_admin`. |
| **Aanleiding** | Feedback van de opdrachtgever op 02-10-2026: bij de start van een seizoen alles één voor één invoeren is veel werk. Hij vroeg om "vorig jaar kopiëren" en Excel-import. |

**Main flow — vorig seizoen kopiëren**

1. Admin kiest op het activiteitenoverzicht "Meerdere tegelijk aanmaken" en daarna "Vorig seizoen kopiëren".
2. Admin kiest het seizoen dat gekopieerd wordt (standaard het laatste), kiest een **activiteit met bekende datum** (voorbeeld: de Optocht, de carnavalszondag) en geeft de datum waarop die activiteit in het nieuwe seizoen valt.
3. Systeem berekent het verschil in dagen tussen de oude en de nieuwe datum van die activiteit en schuift alle gekopieerde activiteiten evenveel op. Valt de nieuwe datum op dezelfde weekdag als de oude, dan blijven alle weekdagen kloppen. Dat geldt voor activiteiten die met carnaval meebewegen (aan Pasen gekoppeld); **activiteiten op een vaste datum staan na het verschuiven op de verkeerde dag**. Het systeem kent één vaste datum, 11-11 (Elfde van de elfde), en laat die op 11 november staan; het controlescherm toont daar "Vaste datum: elk jaar 11 november". Andere vaste datums kent het systeem nog niet: die past de admin op het controlescherm aan.
4. Admin kiest "Controleren". Het controlescherm toont per activiteit datum, naam en verzameltijd, met eronder de datum van vorig seizoen om mee te vergelijken. De datum is per regel aan te passen (een aangepaste datum krijgt de stip voor "gewijzigd"); "Niet meenemen" laat een regel weg, "Toch meenemen" haalt hem terug.
5. Admin kiest "N concepten aanmaken". Het systeem maakt ze in één keer aan (`activiteiten_bulk_aanmaken`, één transactie: alles of niets).
6. Admin komt terug op het activiteitenoverzicht met de melding "N concepten aangemaakt". De nieuwe activiteiten staan bij elkaar in een kaart "Net klaargezet" bovenaan, met "Indelen en publiceren". Bij een volgend bezoek staan ze gewoon in de lijst op datum en onder "Vraagt aandacht".

**Wat wordt gekopieerd**

| Gaat mee | Gaat niet mee |
|----------|---------------|
| Naam, verzameltijd, starttijd, eindtijd, locatie, busvertrek, notitie "Belangrijk om te weten" | Ingedeelde mensen: alle plekken starten leeg, want leden hebben niet voor dit seizoen toegezegd |
| Plekken per rol (aantal werkers, drankhaler, enzovoort), eindverantwoordelijke als lege vaste plek | Afmeldingen en de wijzigingenlog |
| Afmeld-deadline, op dezelfde afstand van de nieuwe datum | Oud papier: dat maakt het systeem zelf aan (BG 8.1) |
| | Status: alles is een concept, dus er gaan geen meldingen uit (R18) |

**Alternative flows**

- **AF-1 — Excel-bestand importeren.** Admin kiest "Excel-bestand importeren", downloadt het sjabloon (vaste kolommen: naam, datum, verzameltijd, starttijd, eindtijd, locatie, busvertrek, notitie), vult het in en kiest het bestand. Daarna gaat het net als bij kopiëren: dezelfde controlestap, dezelfde bevestiging. Plekken staan niet in het sjabloon: een geïmporteerde activiteit krijgt de standaardplekken en één lege eindverantwoordelijke.
- **AF-2 — Regels met fouten.** Per regel gelden dezelfde verplichte velden als bij één activiteit (UC-004 AF-4): naam, datum, starttijd en locatie. Daarbij komt: de datum moet leesbaar zijn. Staat er geen jaar bij, dan neemt het systeem dat van het seizoen; dat is dus geen fout. Een regel met een fout toont wat er mist, en het ontbrekende veld staat op de regel zelf om in te vullen (een locatie, een datum met jaar): de admin hoeft er niet voor terug naar Excel. "Concepten aanmaken" blijft uitgeschakeld tot alle fouten zijn opgelost of de regel is weggelaten. Wil de admin toch een ander bestand, dan gaat dat via "Terug naar importeren".
- **AF-3 — Regel weglaten en terughalen.** "Niet meenemen" streept de regel door en vervangt de link door "Toch meenemen" (symmetrie, zoals bij een plek). Weggelaten regels tellen niet mee in "N concepten".
- **AF-4 — Weggaan van het controlescherm.** Er is nog niets opgeslagen, dus geen bevestiging. De lijst en de aangepaste datums vervallen; de admin begint opnieuw vanaf het kopieer- of importscherm. *Bewuste afwijking van de consistentieregel "weggaan met open wijzigingen → eerst bevestigen"*: er staat niets in het systeem dat verloren gaat, alleen een lijst die in twee klikken terugkomt.
- **AF-5 — Server weigert.** `geen_admin` of een verplicht veld dat intussen ontbreekt: er wordt niets aangemaakt (alles of niets). De admin blijft op het controlescherm met de melding.

**Servercontroles `activiteiten_bulk_aanmaken`**

| Controle | Foutcode |
|----------|----------|
| Aanroeper is admin | `geen_admin` |
| Elke regel heeft naam, datum, starttijd en locatie | `veld_ontbreekt` |
| Elke datum is een geldige datum | `datum_ongeldig` |

**Postconditions**
Er bestaan N nieuwe rijen in `activiteiten` met status `concept`, type `seizoen`, en bijbehorende lege `rol_slots`. Er zijn geen meldingen verstuurd.

**Open vragen voor de opdrachtgever** (ook in `UX-FLOWS.md`)

- **Besloten (de opdrachtgever, 02-10):** sommige activiteiten vallen op een vaste datum (11-11 is altijd 11-11). Eén verschuiving voor alles volstaat dus niet; zie stap 3. Open: welke activiteiten zijn dat nog meer, en wil de opdrachtgever dat het systeem dat onthoudt (een vlag "vaste datum" per activiteit)? Nu: de admin past ze handmatig aan, per regel.
- Hoe ziet zijn Excel-sheet er nu uit? Het sjabloon past zich daar liever bij aan dan andersom. Uitgangspunt: De opdrachtgever werkt nu in Excel en importeert eenmalig (de overstap); daarna gaat alles via de app en volgende seizoenen via kopiëren.
- Wil hij gewaarschuwd worden als een activiteit met dezelfde naam en datum al bestaat? (Nu niet ontworpen.)
- **Hoeveel verandert er per jaar aan naam en tijd van de activiteiten?** Op het controlescherm is nu alleen de datum aan te passen en kan een regel worden weggelaten; naam, tijd en extra activiteiten gaan na het aanmaken via het gewone activiteitscherm (UC-004 AF-1) en "Activiteit aanmaken". Verandert er veel, dan wordt naam en tijd op het controlescherm aanpasbaar, en een regel toevoegen mogelijk.

---

## UC-007 — Mijn diensten bekijken

| Veld | Inhoud |
|------|--------|
| **ID** | UC-007 |
| **Naam** | Mijn diensten bekijken |
| **Actoren** | Lid, Systeem |
| **Preconditions** | Lid is ingelogd. |
| **Aanleiding** | De opdrachtgever, 15-10-2026: "overzicht met mijn diensten, dat ik in één oogopslag kan zien wanneer ik welke diensten heb". |

**Main flow**

1. Lid kiest op het welkomscherm de knop "Al je diensten" op zijn eigen rij in de rolbezetting (of, zonder eigen dienstrij, de kaart "Mijn diensten" onder de statuskaart), of opent het programma en kiest bovenaan de tegel "Mijn diensten" (wisselaar met "Alles", zelfde patroon als de filtertellers in beheer).
2. Systeem toont de **komende** diensten op datum: de plekken waar het lid zelf op staat, met activiteit, tijd, plaats en rol (R15: alleen gepubliceerde activiteiten die nog niet zijn geweest).
3. Systeem toont in een eigen blok "Afgemeld" de activiteiten waarvoor het lid is afgemeld. De regel opent de activiteit, waar de afmelding kan worden ingetrokken (R9).
4. Onderaan, grijs, staat "Geweest dit seizoen" met de diensten die al achter de rug zijn.
5. Lid tikt op een regel → UC-001 voor die activiteit.
6. Lid kiest "Zet in je agenda" in de zijkolom → UC-008.

**Alternative flows**

- **AF-1 — Geen diensten.** Systeem toont een lege staat ("Je staat nog nergens als dienst ingedeeld"). Scherm: `mijn-diensten-leeg.html`.
- **AF-2 — Plek in de bak.** Een plek in de bak (R23) staat ook in dit overzicht, met het label "bak". Het is geen dienst in de zin van werker of drankhaler (je zit erbij, je werkt niet), dus de statuskaart zegt "Je zit in de bak". Of een raadslid de bak hier en in zijn agenda wil zien, is een aanname en een vraag aan de opdrachtgever. Scherm: `mijn-diensten-raadslid.html` (ingelogd als Ton Gubbels, lid van de Raad van Elf).

**Ontwerpkeuzes**

- *Alleen plekken waar je op staat, niet "aanwezig zonder dienst".* Iedereen staat standaard op aanwezig (R1); neem je dat mee, dan is het overzicht gelijk aan het programma en heeft het geen nut. Het aantal staat in de tegel ("Mijn diensten, 3 komende"). De tegel toont de naam vet en het aantal eronder, zodat hij als navigatie wordt gelezen en niet als statistiek (interactiecheck B3).
- *Geen vierde item in de bovenbalk maar een wisselaar bovenaan het programma.* Het is dezelfde lijst, anders gefilterd: twee schermen die elkaar bijna weerspiegelen. Een wisselaar toont dat, en houdt de bovenbalk bij drie items. Eerder was "Mijn diensten" geschrapt omdat geen bron erom vroeg (`UX-FLOWS.md`, Navigatiepatronen); nu vraagt de opdrachtgever erom en is dat besluit herzien.
- *Afmeldingen wel tonen.* Het ontwerp zegt dat intrekken overal kan waar een afmelding zichtbaar is; dat geldt hier ook.

**Postconditions**
Geen datawijziging.

---

## UC-008 — Activiteiten in je agenda zetten

| Veld | Inhoud |
|------|--------|
| **ID** | UC-008 |
| **Naam** | Activiteiten in je agenda zetten en up-to-date houden |
| **Actoren** | Lid, Systeem, agenda-app op de telefoon |
| **Preconditions** | Lid is ingelogd. |
| **Aanleiding** | De opdrachtgever, 15-10-2026: "met één klik alle activiteiten in de agenda van mijn telefoon; updates komen automatisch, of met een melding in de app". |

**Main flow**

1. Lid kiest "Zet in je agenda" (programma, Mijn diensten) → scherm `agenda.html`.
2. Lid kiest wat erin moet: alle activiteiten (standaard) of alleen de eigen diensten.
3. **iPhone:** lid tikt "Zet in je agenda"; de telefoon vraagt of de agenda mag worden toegevoegd (een `webcal://`-link naar de persoonlijke agenda-feed).
4. **Android:** de Google Agenda-app kan een abonnement niet toevoegen, de website wel. Lid tikt "Zet in je agenda"; dat opent Google Agenda in de browser met de vraag of de agenda mag worden toegevoegd (link `calendar.google.com/calendar/render?cid=webcal://…`; niet officieel gedocumenteerd, **nog te testen op een echte Android**). Lukt dat niet, dan kopieert het lid de link en plakt die op een computer bij "Andere agenda's → Via URL" (terugval onder "Lukt het niet?").
5. Systeem toont alleen wat het weet. iPhone: `agenda-gelukt.html` ("Bevestig op je telefoon"). Android: dezelfde pagina, `agenda-gelukt.html`; via de terugval (link kopiëren): `agenda-android.html` ("Link gekopieerd", plak hem in Google Agenda op een computer). Er staat nergens dat de agenda al is gekoppeld.
6. Zodra de agenda-app de feed voor het eerst ophaalt, legt het systeem dat vast (`agenda_laatst_opgehaald`). Vanaf dan toont het scherm `agenda-gekoppeld.html`: "Je agenda is gekoppeld, voor het laatst bijgewerkt: vandaag 14:05". Daarna haalt de app de feed zelf steeds opnieuw op; wijzigingen komen vanzelf mee.

**Alternative flows**

- **AF-1 — Link uitgelekt.** Lid kiest "Nieuwe link maken"; het systeem vervangt het token (R24), de oude link werkt niet meer en het lid koppelt opnieuw. *Knop wel getoond, nog geen eigen bevestigingsscherm.*
- **AF-2 — Afgemeld voor een activiteit.** De activiteit verdwijnt bij de volgende verversing uit de agenda; bij het intrekken komt hij terug (R24).
- **AF-3 — Wijziging op de dag zelf.** Een agenda ververst niet direct (iPhone hooguit een uur, Google Agenda soms een dag). Wijzigingen die snel moeten aankomen gaan daarom ook als bericht (BA-4, Resend).

**Ontwerpkeuzes**

- *Een agenda-abonnement, geen eenmalige download.* Alleen dan kunnen wijzigingen vanzelf meekomen. Een melding "er zijn updates, klik om te verwerken" (tweede van de opdrachtgever idee) werkt niet: een webapp kan niet zelf in de agenda van de telefoon schrijven, dus het lid moet elke keer handmatig een bestand openen. Het bericht blijft bestaan voor wat niet kan wachten.
- *Standaard alle activiteiten.* Dat is wat de opdrachtgever vroeg; de schakelaar "alleen mijn diensten" kost weinig.
- *Geen scherm voor de "nieuwe link maken"-bevestiging.* Hoort bij de bouw, niet bij het prototype.
- *Alleen beweren wat het systeem weet* (interactiecheck B1, 15-10-2026). Eerst stond er "Je agenda is gekoppeld" zodra het lid op de knop tikte, terwijl hij het nog moest bevestigen (iPhone) of op een computer moest plakken (Android). Nu zijn er drie toestanden: bevestigen, link gekopieerd, en pas gekoppeld als de feed is opgehaald, met "voor het laatst bijgewerkt" als bewijs dat het werkt.

**Postconditions**
Geen wijziging aan activiteiten of bezetting. Er bestaat een persoonlijk token en, na de eerste aanvraag, een tijdstip van de laatste keer ophalen (BG V8).

---

## Beslispunten beheerkant — voor te leggen

| # | Vraag | Voorstel |
|---|-------|----------|
| BA-1 | Mag de admin een lid indelen dat zich al heeft afgemeld? De bronnen zeggen er niets over; R5 verbiedt het alleen bij zelf ruilen. | **Besloten: blokkeren.** Het voorkomt de tegenstrijdige toestand "afgemeld én ingedeeld", waarin het rooster iemand toont die heeft doorgegeven er niet te zijn. Het lid kan zijn afmelding overigens gewoon zelf intrekken (R9) — de blokkade zit dus niemand klem, ze dwingt alleen af dat de volgorde klopt: eerst intrekken, dan indelen. |
| BA-2 | Wat gebeurt er als de admin een plek weghaalt terwijl er iemand op staat? | **Besloten, herzien 25-09-2026:** dat mag, maar alleen als expliciete keuze met de naam erbij. Wie op een bezette plek klikt, ziet onderaan "Truus eraf halen" met twee uitkomsten: *Plek openlaten* of *Plek weghalen*. Zo is zichtbaar dat iemand zijn dienst verliest, zonder omweg via een lege plek. Bij een gepubliceerde activiteit staat de wijziging ook in "Wie krijgt bericht". Het &times; bij een lege plek blijft voor een plek zonder bezetter. De eindverantwoordelijke kan nooit weg. *Eerder besloten: alleen lege plekken kunnen weg; dat bleek een omweg van drie stappen voor wie een rol niet nodig heeft.* |
| BA-3 | Mag een gepubliceerde activiteit terug naar concept? Het FO regelt alleen dat *geannuleerd* eenrichting is. | **Besloten: nee.** Leden hebben hem al gezien en meldingen zijn verstuurd; terugzetten laat de app iets verbergen wat mensen al in hun agenda hebben. Moet hij weg, dan is annuleren het juiste pad (fase 5). |
| BA-4 | Welke wijzigingen aan een gepubliceerde activiteit sturen een melding? BG 8.3 noemt rol, tijd en bus. | **Besloten, met drie categorieën.** *Altijd melden:* tijden, busgegevens, locatie, rolwijzigingen, én de afmeld-deadline en de ondergrens — die laatste twee zijn geen interne instellingen maar bepalen of een lid zich nog kan afmelden. *Keuze van de admin:* het notitieveld; een typefout hoeft niet bij vijftig mensen te landen, een gewijzigde verzamelinstructie wel. *Nooit melden:* het type en het seizoen. Per wijziging wordt vastgelegd wie bericht kreeg en waarover. |
| BA-5 | Vult het systeem de ondergrens automatisch op basis van het type? | **Besloten: ja**, als standaardwaarde. Bij `oud_papier` staat de ondergrens uit, bij `seizoen` aan met 13 (FO 4.1); de admin kan het per activiteit overschrijven. Het scherm maakt daarbij zichtbaar dat een ondergrens **zonder afmeld-deadline nooit wordt afgedwongen** (R8) — anders staat er een getal dat niets doet. *Aanvulling 25-09-2026:* type zit niet in het formulier. Handmatig aanmaken = `seizoen`; oud papier maakt het systeem zelf aan en toont bovenaan "Oud papier — automatisch aangemaakt". Een extra oud-papierdag buiten het schema kan later via "kopie van een eerdere activiteit". |

| BA-6 | Is de lijst roltypen vast? FO 2.2 noemt er vijf: werker, drankhaler, fotograaf, BOB, eindverantwoordelijke. Het aantal plekken is per activiteit instelbaar, de namen niet. | **Voor te leggen.** Een vaste lijst in de code is het simpelst en klopt met het FO, maar bij een nieuwe rol (kaartverkoop, EHBO, opbouw) moet er dan een ontwikkelaar aan te pas komen. Voorstel: de roltypen in een tabel zetten in plaats van als vaste waarde in de code, met per rol twee vlaggen (`ruilbaar_door_lid`, `alleen_admin`). Dan blijven de regels R4 en R7 gelden op de vlag in plaats van op de naam, en kan het bestuur later zelf een rol toevoegen zonder dat de ruil- en afmeldlogica verandert. In de MVP-pilot verandert er zichtbaar niets: dezelfde vijf rollen. *Extra argument (02-10-2026):* als later meerdere verenigingen het product gebruiken, hebben die elk eigen rollen; dat pleit voor de tabel (zie `UX-FLOWS.md`, "Na de pilot: meerdere verenigingen"). |
| BA-7 | Hoe werken groepen (Bestuur, Raad van Elf, Dames, Overige leden; de opdrachtgever schrijft RV11)? De opdrachtgever, 15-10-2026: bijvoorbeeld om bestuursvergaderingen in het systeem te kunnen zetten. | **Voorlopig besloten (de bouwer, 15-10-2026), nog door de opdrachtgever te bevestigen.** Vier vaste groepen, opgeslagen in een tabel (zelfde redenering als BA-6: uitbreidbaar zonder dat een ontwikkelaar eraan te pas komt) maar zonder beheerscherm in de pilot. Een lid kan in meer groepen zitten. Een activiteit krijgt het veld *Voor wie* (standaard *Iedereen*), een keuzelijst met Iedereen, Bestuur, Raad van Elf, Dames en Overige leden; wie niet in de groep zit ziet de activiteit helemaal niet (R22: de veiligste standaard bij een bestuursvergadering). De leden worden één keer bij de start in groepen gezet (ledenbeheer is buiten scope). Bij een groepsactiviteit telt "aanwezig" alleen de leden van de groep; het minimum blijft een optioneel veld (BA-5). *Open:* hebben gastwerkers (Overige leden) een eigen inlog, of zijn ze externe helpers zonder account (R12)? *Aangepast 16-10-2026 (de opdrachtgever):* de doelgroep van een activiteit kan **meer dan één groep** zijn (Bestuur en Raad van Elf samen); de keuzelijst heeft aankruisvakjes en een knop Klaar, "Iedereen" sluit de andere keuzes uit. Voor een concept is er een eigen keuzelijst zonder de waarschuwing voor gepubliceerde activiteiten. |
| BA-8 | Hoe komt het bakschema bij de Bonte Avond in het systeem? De opdrachtgever: "de beheerder moet kunnen aangeven wie in de bak zit". | **Voorlopig besloten (de bouwer, 15-10-2026), nog door de opdrachtgever te bevestigen.** Een kaart *Bak* op het activiteitscherm, onder Rolbezetting, alleen bij de Bonte Avond. De Raad van Elf is altijd dezelfde elf (de opdrachtgever), dus de bak wordt vooraf gevuld uit de groep Raad van Elf plus prins, adjudant en vorst; de admin corrigeert. Alleen de admin wijzigt de bak (R23). De keuzelijst bij een plek in de bak toont leden zonder label: wie al een plek heeft staat er niet in (R6), dus iedereen die je ziet is geen raadslid. Zoek je op de naam van een raadslid, dan staat hij er grijs in met het label "Raad van Elf" en "al in de bak" (`admin-activiteit-kiezen-bak-zoeken.html`). Bij BOB en eindverantwoordelijke krijgt alleen de uitzondering een hint (FO 10). Voor de tweede avond staat op het scherm van die avond "Bak overnemen van vr 22 januari" (`admin-activiteit-bewerken-za.html`): de actie vult de plekken op het scherm en gaat, zoals elke wijziging, pas bij Opslaan door (met "Wie krijgt bericht"). Hangt af van BA-7 (groep Raad van Elf) en sluit aan op BA-6 (rol met vlag `alleen_admin`). *Open:* wat staat er precies in het huidige bakschema: alleen wie erin zit, of ook waar (op of langs het podium) en wanneer? Zijn prins, adjudant en vorst leden in het systeem? Het huidige schema (foto of Excel) is nodig voordat het scherm af is. *Aangepast 16-10-2026 (de opdrachtgever):* de bak hoort niet bij elke activiteit, alleen bij de Bonte Avond en één of twee andere. Een schakelaar "Bak bijhouden bij deze activiteit" bovenaan de kaart Bak zet hem per activiteit aan; uit = alleen de schakelaar. De Bonte Avond heeft hem aan. *Open:* welke andere activiteit(en)? (De opdrachtgever noemde "jeugd van …bal"; welke activiteit dat is, is nog niet vastgesteld.) |
| BA-9 | Hoe komen activiteiten in de agenda van de telefoon, en hoe blijven ze up-to-date? | **Voorlopig besloten (de bouwer, 15-10-2026).** Een agenda-abonnement (iCal-feed) per lid, met een geheim token in de link (UC-008, R24). Standaard alle activiteiten, schakelaar "alleen mijn diensten". Een activiteit waarvoor je bent afgemeld verdwijnt uit de agenda, bij intrekken komt hij terug. Een agenda ververst met vertraging (iPhone hooguit een uur, Google Agenda soms een dag): wijzigingen op de dag zelf gaan daarom ook als bericht (BA-4). Een melding "klik om te verwerken" is geen alternatief: een webapp kan niet in de agenda schrijven. Het scherm beweert alleen wat het systeem weet: pas als de feed voor het eerst is opgehaald staat er "gekoppeld", met "voor het laatst bijgewerkt" (interactiecheck B1). |
## Schermen die hieruit volgen

| # | Scherm | Bestand | Use case | Type |
|---|--------|---------|----------|------|
| 1 | Welkomscherm — activiteit vandaag/eerstvolgend | `welkom.html` | UC-001 | Happy path |
| 2 | Welkomscherm — geen geplande activiteit | `welkom-leeg.html` | UC-001 AF-1 | Lege staat |
| 3 | Welkomscherm — afgemeld (met intrekken) | `welkom-afgemeld.html` | UC-001 AF-3 / UC-003 AF-6 | Statusvariant |
| 3a | Welkomscherm — twee activiteiten op één dag | `welkom-twee.html` | UC-001 AF-8 | Variant |
| 4 | Ruilen — vervanger kiezen | `ruilen-kies-vervanger.html` | UC-002 | Happy path |
| 5 | Ruilen — bevestigen | `ruilen-bevestigen.html` | UC-002 | Happy path |
| 6 | Ruilen — gelukt | `ruilen-gelukt.html` | UC-002 | Happy path |
| 7 | Ruilen geweigerd — vervanger is al afgemeld | `ruilen-fout-afgemeld.html` | UC-002 AF-1 | **Foutpad** |
| 8 | Ruilen geweigerd — vervanger staat al op andere rol | `ruilen-fout-dubbel.html` | UC-002 AF-2 / AF-7 | **Foutpad** |
| 9 | Afmelden — bevestigen (met toelichtingsveld) | `afmelden-bevestigen.html` | UC-003 | Happy path |
| 10 | Afmelden — gelukt | `afmelden-gelukt.html` | UC-003 | Happy path |
| 11 | Afmelden geblokkeerd — ondergrens | `afmelden-fout-ondergrens.html` | UC-003 AF-3 | **Foutpad** |
| 12 | Welkomscherm — BOB (geen knop Afmelden, nummer van de eindverantwoordelijke) | `welkom-bob.html` | UC-003 AF-2 | **Foutpad** |
| 13 | Afmelden — twee stappen aangekondigd | `afmelden-eerst-ruilen.html` | UC-003 AF-1 | **Foutpad** |
| 13a | Afmelden stap 1 — vervanger kiezen | `afmelden-stap1-vervanger.html` | UC-003 AF-1 → UC-002 | Happy path |
| 13b | Afmelden stap 1 — overdracht bevestigen | `afmelden-stap1-bevestigen.html` | UC-003 AF-1 → UC-002 | Happy path |
| 13c | Afmelden stap 2 — afmelding bevestigen | `afmelden-stap2-bevestigen.html` | UC-003 | Happy path |
| 14 | Afmelding ingetrokken — bevestiging | `afmelding-ingetrokken.html` | UC-003 AF-6 | Happy path |
| 15 | Activiteit verderop in het seizoen, nog niet ingedeeld | `activiteit-optocht.html` | UC-001 AF-7 | Partial state |
| 35 | Mijn diensten | `mijn-diensten.html` | UC-007 | Happy path |
| 36 | Agenda koppelen | `agenda.html` | UC-008 | Happy path |
| 37 | Agenda gekoppeld | `agenda-gelukt.html` | UC-008 | Happy path |
| 38 | Mijn diensten — geen diensten | `mijn-diensten-leeg.html` | UC-007 AF-1 | Lege staat |
| 39 | Mijn diensten — raadslid met een plek in de bak | `mijn-diensten-raadslid.html` | UC-007 AF-2 | Variant |

### Beheerkant

| # | Scherm | Bestand | Use case | Type |
|---|--------|---------|----------|------|
| 16 | Activiteitenoverzicht | `admin-activiteiten.html` | UC-004 | Ingang |
| 16c | Eindverantwoordelijke kiezen — keuzelijst met geschiktheid | `admin-activiteit-kiezen-eindverantwoordelijke.html` | UC-005 (FO 10) | Alternatief pad |
| 16b | Wijzigingen opslaan — bevestigen | `admin-wijzigingen-opslaan.html` | UC-004 AF-2 | Bevestiging |
| 16a | Activiteitenoverzicht — net gepubliceerd | `admin-activiteiten-gepubliceerd.html` | UC-004 stap 11 | Terugkoppeling |
| 17 | Nieuwe activiteit (concept) | `admin-activiteit-nieuw.html` | UC-004 | Happy path |
| 18 | Activiteit bewerken (gepubliceerd) | `admin-activiteit-bewerken.html` | UC-004 AF-2 | Happy path |
| 19 | Publiceren bevestigen | `admin-publiceren.html` | UC-004 | Happy path |
| 20 | **Publiceren geblokkeerd** | `admin-activiteit-onvolledig.html` | UC-004 AF-6 | **Foutpad** |
| 22 | Lege plek vullen — keuzelijst open | `admin-activiteit-kiezen-leeg.html` | UC-005 | Happy path |
| 22a | Iemand vervangen of eraf halen — keuzelijst open | `admin-activiteit-kiezen.html` | UC-005 AF-4 | Alternatief pad |
| 40 | Iemand in de bak vervangen — keuzelijst open | `admin-activiteit-kiezen-bak.html` | UC-004 / BA-8 | Alternatief pad |
| 41 | Welkomscherm — raadslid met een plek in de bak | `welkom-raadslid.html` | UC-001 / UC-007 AF-2 | Variant |
| 42 | Programma — lid buiten het bestuur | `programma-raadslid.html` | R22 | Variant |
| 44 | Voor wie kiezen — keuzelijst open | `admin-activiteit-voor-wie.html` | UC-004 / BA-7 | Alternatief pad |
| 45 | Iemand in de bak zoeken — zoekresultaat | `admin-activiteit-kiezen-bak-zoeken.html` | BA-8 | Alternatief pad |
| 46 | Activiteit bewerken — tweede Bonte Avond (za 23 januari) | `admin-activiteit-bewerken-za.html` | UC-004 / BA-8 | Variant |
| 47 | Agenda — link gekopieerd (Android) | `agenda-android.html` | UC-008 | Happy path |
| 48 | Agenda — gekoppeld, voor het laatst bijgewerkt | `agenda-gekoppeld.html` | UC-008 | Toestand |
| 49 | Wijzigingen opslaan — Voor wie gewijzigd | `admin-wijzigingen-opslaan-groep.html` | UC-004 / R22 | Bevestiging |
| 50 | Voor wie kiezen bij een concept — keuzelijst open | `admin-activiteit-voor-wie-concept.html` | UC-004 / BA-7 | Alternatief pad |
| 25 | **Plek intussen gewijzigd** | `admin-fout-slot-gewijzigd.html` | UC-005 AF-8 | **Foutpad** |
| 25a | Actuele stand na plek gewijzigd | `admin-activiteit-actueel.html` | UC-005 AF-8 | Terugkoppeling |
| 26 | Wijzigingen weggooien — bevestigen | `admin-wijzigingen-weggooien.html` | UC-004 AF-2 | Bevestiging |
| 16d | Activiteitenoverzicht — wijzigingen opgeslagen | `admin-activiteiten-opgeslagen.html` | UC-004 AF-2 | Terugkoppeling |
| 16e | Activiteitenoverzicht — opgeslagen als concept | `admin-activiteiten-concept.html` | UC-004 stap 8 | Terugkoppeling |
| 16f | Overzicht gefilterd — diensten nog in te delen | `admin-activiteiten-diensten.html` | UC-004 stap 1 | Filter |
| 16g | Overzicht gefilterd — concepten | `admin-activiteiten-concepten.html` | UC-004 stap 1 | Filter |
| 33 | Concept verwijderen — bevestigen | `admin-concept-verwijderen.html` | UC-004 AF-10 | Bevestiging |
| 34 | Activiteitenoverzicht — concept verwijderd | `admin-activiteiten-verwijderd.html` | UC-004 AF-10 | Terugkoppeling |
| 27 | Meerdere activiteiten aanmaken — kiezen | `admin-bulk-start.html` | UC-006 | Ingang |
| 28 | Vorig seizoen kopiëren | `admin-bulk-kopieren.html` | UC-006 | Happy path |
| 29 | Excel-bestand importeren | `admin-bulk-importeren.html` | UC-006 AF-1 | Alternatief pad |
| 30 | Activiteiten controleren | `admin-bulk-controleren.html` | UC-006 | Bevestiging |
| 31 | Import controleren — regels met fouten | `admin-bulk-controleren-fouten.html` | UC-006 AF-2/AF-3 | **Foutpad** |
| 32 | Activiteitenoverzicht — concepten aangemaakt | `admin-activiteiten-bulk.html` | UC-006 stap 6 | Terugkoppeling |

**Nog niet als scherm uitgewerkt** (wel als foutcode belegd): `activiteit_niet_open`,
`vervanger_ongeldig`, `al_afgemeld`, `niet_afgemeld`, en de laad-/netwerkfout uit
UC-001 AF-6 (sinds 29-10-2026 beantwoord door `storing.html` en `fout.html`). Zie de UI Stack-bevinding in `UX-FLOWS.md`.

**Schermen buiten de use cases (29-10-2026):** inloggen (`inloggen`, `inloggen-fout-adres`, `inloggen-verstuurd`, `inloggen-mail`, `inloggen-bevestigen`, `inloggen-link-ongeldig`, `uitgelogd`), `mijn-account` (tijdelijk), MFA voor het bestuur (`mfa-instellen`, `mfa-wacht-op-bevestiging`, `mfa-code`, `mfa-code-fout`, `mfa-opnieuw`, `mfa-toestel-kwijt`), `alleen-bestuur`, `niet-gevonden`, `fout` en `storing`. Ze zijn uit de bouw voortgekomen en horen bij geen UC; ze staan met kernelementen in `wireframes/INDEX.md` en in `UX-FLOWS.md` ("Ontwerpgaten uit de bouw").

## Besloten punten (11-09-2026)

1. **Twee activiteiten op één dag** — eerst geschrapt uit de MVP-pilot. *Teruggedraaid op 02-10-2026:* De opdrachtgever noemt een echt voorbeeld (Jeugdmiddag en receptie op dezelfde zondag), dus ze staan in de MVP (R11, UC-001 AF-8).
2. **"Geen vervanger gevonden"** — eindigt in de MVP met annuleren; de dienst blijft staan. *MVP-afwijking van FO 3.1:* de "wil ruilen"-vlag en het admin-overzicht openstaande ruilverzoeken zijn uitgesteld.
3. **Toelichtingsveld bij afmelden** — wordt wel getoond (optioneel, vrij tekstveld). Staat niet in het FO; opnemen als aanvullende eis. Opslag: zie besluit 10.
4. **Lege rol-slots** — niet tonen aan leden (R13). *Aanvullend ontwerpbesluit, niet uit de bronnen.* Aanwezigheid en rolbezetting zijn twee losse begrippen: iedereen staat standaard op aanwezig, maar de meeste leden hebben geen rol. Een open plek betekent "het bestuur heeft dit nog niet ingevuld", niet "hier kan iemand zich aanmelden".
5. **Blokkadetekst** (18-09-2026) — verwijst naar de **eindverantwoordelijke**, niet naar de vorst: dat is het enige nummer dat de app mag tonen (R10). **Wijkt af van de letterlijke tekst in FO 4.1 en BG 5.2; het FO moet hierop worden bijgewerkt.**
6. **Reden bij een niet-beschikbare vervanger** (18-09-2026) — blijft zichtbaar. Dat iemand al een rol heeft staat toch al in de rolbezetting, dus het onthult niets nieuws.
7. **Geen deadline ingesteld** (18-09-2026) — dan geldt fase 1 permanent: vrij afmelden, de ondergrens blokkeert nooit (R8). Wil het bestuur dat de ondergrens altijd geldt, dan moet de deadline verplicht worden gemaakt bij het aanmaken van een activiteit.
8. **Het deadline-moment zelf** (18-09-2026) — telt als *vóór*: vrij afmelden zolang `nu <= afmeld_deadline`. Sluit aan op "tot wanneer vrij afmelden mag" (BG 3.2).
9. **Wanneer een activiteit "geweest" is** (18-09-2026) — zie R16: `datum + eindtijd`, met een dag erbij als de eindtijd vóór de starttijd ligt. Het alternatief (de starttijd aanhouden) zou betekenen dat je je tijdens de activiteit niet meer kunt bedenken.
10. **Opslag van de afmeldtoelichting** (18-09-2026) — een kolom `toelichting` op `afmeldingen`, niet alleen in de wijzigingenlog. Zo hoort de toelichting bij de afmelding zelf en verdwijnt hij mee als die wordt ingetrokken. **Vereist een wijziging in het datamodel van de bouwgids.**
11. **Externe helper als vervanger** (18-09-2026) — niet toegestaan, zie R17.
12. **Aantal aanwezigen** — alleen tonen op het blokkadescherm, waar het een weigering verantwoordt. Het systeem kán het getal wel degelijk afleiden (actieve leden minus afmeldingen) en doet dat ook in `meld_af()`; het punt is dat een lid de onderliggende lijst nergens te zien krijgt en het getal dus niet kan narekenen. Daarnaast zet het tonen van de marge boven de ondergrens aan tot racen.

## Nog door te voeren in de bronnen

| Wat | Bouwgids | FO |
|-----|----------|----|
| Blokkadetekst verwijst naar de eindverantwoordelijke | ✅ V4 (5.2) | ✅ V4 (4.1) |
| Kolom `toelichting` op `afmeldingen` | ✅ V4 (3.4) | ✅ V4 (4.2) |
| Kolom `naam` op `activiteiten` | ✅ V5 (3.2) | ⏳ nog niet |
| Beheerkant: indelen, publicatievoorwaarden (R21), gelijktijdig indelen, meldingen per wijziging | ✅ V5 (4.4, 5.5, 7.1, 8.3) | ⏳ nog niet |
| Beslispunt BA-6: vaste rollijst of tabel met vlaggen | ✅ V5 als open punt (3.3) | ⏳ nog niet |
| Opslaan in één transactie: alles of niets, `verwachte_bezetter` per plek, publiceren in dezelfde stap | ✅ V6 (3.3, 4.4, 5.5) | ⏳ nog niet |
| Groepen, doelgroep per activiteit en RLS (BA-7, R22); agenda-feed met token (BA-9, R24); de bak (BA-8, R23) | ⏳ V8 (`Bouwgids-V8-voorbereiding.md` 2.8 t/m 2.10) | ⏳ nog niet |

Het FO staat nog op V4. De bouwgids is wat de bouwer volgt en is daarom eerst bijgewerkt;
het FO moet dezelfde punten krijgen zodat beide documenten hetzelfde zeggen.
