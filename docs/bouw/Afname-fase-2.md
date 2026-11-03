# Afname fase 2

Stand 03-11-2026. Wat fase 2 heeft opgeleverd, wat er bewust niet in zit, de review van fase 2 als geheel met wat ermee
is gedaan, de pilotcheck, en de lijst "Van fase 2 naar fase 3 en de pilot". Wie fase 3 begint of het beslismoment van
vrijdag 6 november voorbereidt, leest dit bestand eerst.

**Stand (03-11-2026): de stappen A tot en met D van `Fase-2-plan.md` staan in `main` (PR 39 tot en met 50), de migratie staat
online, en de review van fase 2 als geheel is verwerkt (punt 3). Een gepubliceerde activiteit wijzigen (F2-01) is daarna
gebouwd. Niet af, en nodig voor pilot A ("het programma en de indeling zijn te zien, zonder afmelden en ruilen", bouwgids
13.3): een manier om telefoonnummers en groepen van de pilotleden te zetten (F2-02). Met de hand nog te doen door de bouwer: de
doorloop (punt 2.1), de vergelijking met het visuele ontwerp (punt 2.2) en de Supabase-adviseur (punt 2.3).** Het advies
voor het beslismoment van vrijdag 6 november staat in punt 6.

## 1. Wat fase 2 heeft opgeleverd

| Onderdeel | Bewijs | Stand |
|---|---|---|
| Datamodel van indelen en publiceren, eerst op papier en gereviewd | `Datamodel-fase-2.md`; review door een schone chat vóór de migratie (PR 39, 17 bevindingen) | Gehaald |
| Migratie en rechten: `activiteit_opslaan` met indelen, publiceren, `versie` en `verwachte_bezetter`; `huidig_seizoen()`; `contact_eindverantwoordelijke()` | PR 40; pgTAP `fase2_opslaan.test.sql` (97 tests), de rechtentests aangepast; review van de migratie door een schone chat met aanvallen en mutatietests (11 bevindingen, niets blokkerends); online via de job `migraties` | Gehaald |
| Gelijktijdigheid: twee beheerders tegelijk, publiceren tegen wijzigen | `e2e/gelijktijdig.spec.ts` (echte tweede sessie, rij-lock en `versie_verouderd`) | Gehaald |
| Beheeroverzicht met tellers die ook filter zijn, en een taak per regel (V8 5.6) | PR 45; `e2e/beheeroverzicht.spec.ts`, `src/lib/beheeroverzicht.ts` met tests | Gehaald |
| Activiteit aanmaken en bewerken als concept, één scherm met de rolbezetting; invoer met een vast schema (Zod 4.6.7, nagekeken en goedgekeurd 03-11-2026) | PR 46; `e2e/activiteit-formulier.spec.ts`, `src/lib/activiteitformulier.ts` met tests | Gehaald |
| Mensen indelen: een keuzelijst per plek, "eraf halen" met twee uitkomsten, de eindverantwoordelijke, wie je niet kunt kiezen, `verwachte_bezetter` per plek | PR 47; `e2e/indelen.spec.ts`; foutcodes van het indelen in woorden | Gehaald |
| Publiceren met een eigen bevestigingspagina, en R21 als blokkade met de reden | PR 48; `e2e/publiceren.spec.ts` | Gehaald |
| Concept verwijderen met een eigen bevestigingspagina | PR 49; `e2e/verwijderen.spec.ts` | Gehaald |
| Ledenschermen: welkomscherm (vandaag of de eerstvolgende, twee op één dag, lege staat), de activiteit uit het programma, tijdlijnkaartje, rolbezetting zoals een lid die ziet, Jouw status | PR 50; `e2e/welkom.spec.ts`, `src/lib/ledenactiviteit.ts` met 18 tests | Gehaald |
| Componenten: Tijdlijnkaartje, Statuspaneel, Keuzelijst met aankruisvakjes, Rolbezetting, Jouwstatus | `src/components/`, `src/components/onderdelen.test.tsx` | Gehaald; de Stappenbalk en de Schakelaar horen bij afmelden en ruilen (fase 3) |
| Browsertests voor wat in fase 1 alleen met pgTAP was bewezen | Punt 5 | Gehaald, op een paar regels na |
| Alle controles groen in GitHub | Workflow `check` groen op elke pull request en op `main` na PR 50 (squash-commit `b44f96d`) | Gehaald |
| Review van fase 2 als geheel | Punt 3 | Zie punt 3 |
| Doorloop met toetsenbord, telefoon en schermlezer | Punt 2.1 | **Open, door de bouwer** |
| Vergelijking met het visuele ontwerp per scherm (1200 en 375 px) | Punt 2.2 | **Deels** (het welkomscherm is naast het ontwerp gelegd); de rest is open, door de bouwer |

Aantallen op 03-11-2026 (volledige poort, `npm run check`, lokaal): 347 pgTAP-tests, 197 unittests, 196 browsertests
(desktop en telefoon, 0 onverwacht, 0 wisselend), de controles op overgeslagen tests, omwegen, databasetypen en repo op 0
problemen.

## 2. Met de hand

### 2.1 Doorloop met toetsenbord, telefoon en schermlezer

Door de bouwer, op de site online, met het eigen account van de bouwer. Per scherm: met Tab door alle links, velden en
knoppen; de focus is steeds zichtbaar en de volgorde klopt; Enter (en Spatie op een knop) doet wat je verwacht; op een
telefoon (375 px of smaller) schuift niets opzij. Eén keer met een schermlezer (VoiceOver of NVDA): worden de meldingen
voorgelezen, en klopt de volgorde van het welkomscherm (bovenaan "Jouw status" op een telefoon)?

| Scherm | Toetsenbord | Focus zichtbaar | Telefoon | Schermlezer | Gevonden |
|---|---|---|---|---|---|
| `/` (welkom), als lid en als beheerder | ☐ | ☐ | ☐ | ☐ | |
| `/programma` en `/programma/<id>` | ☐ | ☐ | ☐ | ☐ | |
| `/beheer` (overzicht, tellers als filter) | ☐ | ☐ | ☐ | ☐ | |
| `/beheer/activiteiten/nieuw` en `/beheer/activiteiten/<id>`: de keuzelijsten per plek, "eraf halen", het statuspaneel | ☐ | ☐ | ☐ | ☐ | |
| `/beheer/activiteiten/<id>/publiceren` (ook als het niet kan) | ☐ | ☐ | ☐ | ☐ | |
| `/beheer/activiteiten/<id>/verwijderen` | ☐ | ☐ | ☐ | ☐ | |
| De schermen uit fase 1 die zijn veranderd: `/inloggen`, `/mijn` | ☐ | ☐ | ☐ | — | |

Datum: … · Apparaat: … · Door: … · Uitkomst: …

### 2.2 Vergelijking met het visuele ontwerp

Per scherm naast `docs/visueel` (1200 en 375 px), volgens `Design-overdracht.md` 4. Het welkomscherm is op 03-11-2026
vergeleken (tijdlijn, kaartje, rolbezetting, Jouw status: gelijk, op de afwijkingen van punt 4 na). De overige schermen
nog niet.

| Scherm | 1200 px | 375 px | Verschillen |
|---|---|---|---|
| `welkom` | ☑ | ☑ | Zie punt 4 |
| `welkom-twee` | ☐ | ☐ | |
| `welkom-leeg` | ☐ | ☐ | |
| `activiteit-optocht` | ☐ | ☐ | |
| `admin-activiteiten` (en de varianten met melding) | ☐ | ☐ | |
| `admin-activiteit-nieuw`, `-bewerken`, `-kiezen` en de varianten | ☐ | ☐ | |
| `admin-publiceren`, `admin-concept-verwijderen` | ☐ | ☐ | |

### 2.3 Supabase-adviseur (bouwgids 14.4)

Nog niet opnieuw gedraaid na de migratie van fase 2 (online sinds 02-11-2026). Door de bouwer: project
`ledenplatform-ontwikkel`, Advisors, *Rerun linter*. Verwacht: dezelfde meldingen als in `Afname-fase-1.md` punt 2.2,
plus *Signed-In Users Can Execute SECURITY DEFINER Function* voor `huidig_seizoen` en `contact_eindverantwoordelijke`
(bedoeld: elke functie controleert zelf wie belt, en de rechtentest bewaakt de lijst).

Datum: … · Uitkomst: …

## 3. De review van fase 2: bevindingen en afhandeling

Een schone Claude-subagent zonder het bouwgesprek reviewde `main` op `b44f96d` (03-11-2026): code, rechten, de server actions,
de ledenschermen en de tests. Hij draaide typecheck, lint, de unittests en de 347 pgTAP-tests (zonder de database te
resetten) en probeerde in transacties met terugdraaien zelf aanvallen op de lokale database, als lid, als beheerder zonder
code en als `anon`. De Playwright-suite draaide hij niet (die deelt de database met ander werk) en hij keek niet in een
echte browser. Oordeel: **bijna af. Geen blokkerende fout en geen gegevenslek; pilot A zoals bedoeld is haalbaar, maar niet
zonder F2-01 en F2-02.** Ernst volgens de reviewer.

| ID | Ernst | Bevinding | Afhandeling |
|---|---|---|---|
| F2-01 | belangrijk | Een gepubliceerde activiteit is in beheer alleen leesbaar: geen formulier en geen indeling. Het overzicht telt de lege plekken van gepubliceerde activiteiten wel mee als "diensten nog in te delen", en de link leidt naar een scherm waar je niets kunt doen. Ook een verkeerde tijd, locatie of eindverantwoordelijke is niet meer recht te zetten. In SQL werkt het wijzigen wel | **Opgelost na de afname** (03-11-2026): het formulier staat nu ook bij een gepubliceerde activiteit, met "Wijzigingen opslaan", de tekst dat leden de wijziging direct zien en er geen bericht uitgaat (O-1), en de melding "… is bijgewerkt" in het overzicht. De eindverantwoordelijke is vast (alleen vervangen, niet openlaten, R21) en `versie` en `verwachte_bezetter` beschermen. Een geweest zijnde activiteit weigert de database (O-2); een geannuleerde toont alleen wat er staat. Browsertests in `e2e/gepubliceerd-wijzigen.spec.ts`. De bevestigingsstap met "Wie krijgt bericht" volgt met de berichten |
| F2-02 | belangrijk | Niets schrijft `leden_prive.telefoon`, `lid_groep`, `mag_bob` of `mag_eindverantw`; het "script voor pilotleden" bestaat niet (`scripts/` heeft `maak-lid-lokaal`, alleen lokaal, en `maak-inloglink`). Elke publicatie vraagt een eindverantwoordelijke met nummer (R21). Is een nummer later weg, dan weigert de database elke wijziging aan die activiteit en is dat niet te herstellen | **Gedeeltelijk, voorwaarde voor pilot A.** De waarschuwing in het formulier is gebouwd (een eindverantwoordelijke zonder nummer geeft een melding vóór het opslaan, en een duidelijke foutmelding als de database het weigert). **Open:** een beschreven procedure of script voor leden, telefoon, groepen en aanmerkingen (online, met een geheim dat niet in de repo komt) |
| F2-03 | belangrijk | De Start koos alleen activiteiten met `datum >= vandaag`: een activiteit die gisteren begon en na middernacht nog loopt (de Bonte Avond tot 01:11) verdween om 00:30 | **Opgelost** in deze afname: de Start toont wat loopt of vandaag nog komt, met een unittest voor de Bonte Avond om 00:30 |
| F2-04 | klein (vermoeden) | De knoppen Publiceren en Opslaan als concept staan buiten het formulier en Publiceren komt eerst: Enter in een veld zou naar de bevestiging van het publiceren gaan | **Opgelost:** een onzichtbare standaardknop "opslaan" vooraan in het formulier (geen tabstop, niet voorgelezen), met een browsertest voor Enter |
| F2-05 | klein (vermoeden) | Geen wachtstand op de knoppen: dubbel klikken op een traag netwerk kan twee concepten met dezelfde naam maken | **Open, bewust.** Een dubbel concept is met "Concept verwijderen" op te ruimen. De knoppen staan buiten het formulier, dus een wachtstand vraagt een kleine ombouw; mee in fase 3 |
| F2-06 | klein | De browsertests rekenen "vandaag" met de UTC-datum van de database: tussen middernacht en 01:00 of 02:00 faalden de welkomtests | **Opgelost** in `e2e/welkom.spec.ts` (de dag in Nederland). De andere tests rekenen met dagen vooruit en worden daar niet door geraakt |
| F2-07 | klein | De dekking is op drie plekken lichter dan beloofd: R16 niet in de browser, "teller = lijst" alleen als `≥ 4`, een label "Vandaag" zonder koppeling aan de activiteit | R16 en de tellers: punt 5 zegt nu wat er is; het label "Vandaag" is geaccepteerd (de unittest dekt de keuze) |
| F2-08 | klein | De notitie "Belangrijk om te weten" toont geen regeleinden; opsommingen lopen in elkaar | **Opgelost** (`white-space: pre-line`) |
| F2-09 | klein | Elke nieuwe activiteit krijgt minimum 13; het overzicht meldt dan "Te weinig" ook voor een groepsactiviteit, terwijl zonder afmeld-deadline het minimum niet geldt (BA-5) | **Opgelost:** het overzicht negeert het minimum zonder deadline |
| F2-10 | klein (vermoeden) | De balk onderaan op een telefoon kan een gefocust veld bedekken (WCAG 2.4.11) | **Opgelost** met `scroll-padding-bottom`; op 375 px nog te kijken in de doorloop (punt 2.1) |
| F2-11 | klein | "Precies één eindverantwoordelijke-plek" is niet afgedwongen: een activiteit zonder die plek is een doodlopende weg (niet te publiceren, niet te herstellen) | **Open, voor fase 5 en 9** (oud papier maken en kopiëren): de controle hoort bij de migratie die dat toevoegt. Via de app is de plek er altijd |
| F2-12 | klein | Een lid dat achteraf inactief wordt, blijft eindverantwoordelijke zonder nummer in beeld | **Open, voor fase 4** (gelijk aan R2-17): de functie die leden inactief zet, neemt de lock of herhaalt de toets |
| F2-13 | klein | Het overzicht toont alleen wat nog niet voorbij is: een concept met een verstreken datum is niet meer te verwijderen (in het programma staat het uitgegrijsd zonder link) | **Open.** Voorstel: een filter "verlopen concepten" in het overzicht; kijken in de pilot |
| F2-14 | klein | Plan en matrix wijken af van de code; "Iedereen staat standaard op aanwezig" op de Start belooft meer dan de pilot kan | Plan en matrix zijn bijgewerkt. De pilotleden krijgen uitgelegd dat afmelden nog niet kan; of de zin tot fase 3 verandert, beslist de ontwerper |

**Wat de reviewer niet kon breken** (geprobeerd, geen bevinding): als lid, als beheerder zonder code (of met een code van 13
uur oud) en als `anon` kon hij via PostgREST en de functies niets lezen of schrijven wat niet mag;
`contact_eindverantwoordelijke` geeft voor een concept, een afgelopen activiteit en een onbekend id dezelfde lege uitkomst;
een plek van een andere activiteit, een extra veld in `p_velden`, een minimum van 0 en een naam van 201 tekens geven netjes
een foutcode; op een gepubliceerde activiteit worden eindtijd, locatie of de eindverantwoordelijke leegmaken geweigerd;
dubbelboeking en een verouderde bezetter worden herkend. De drie server actions beginnen met `eisBeheer()`, hebben een
Zod-schema, en de redirects gebruiken alleen uuid's. Geen `dangerouslySetInnerHTML`; `tel:` wordt gezuiverd; een `<script>`
in de notitie komt als tekst op het scherm. Geen `eslint-disable`, `@ts-ignore`, `.skip` of `.only`. Geen namen, adressen,
nummers of sleutels in de repo.

**Wat de reviewer niet kon controleren:** de Playwright-suite en de Worker-build (die draaien in de poort), gedrag in een
echte browser (Enter, dubbel klikken, de balk op 375 px, een schermlezer, contrast), de gehoste Supabase-instellingen, en de
AVG-grondslag voor het nummer van de eindverantwoordelijke aan alle leden (R10, een ontwerpkeuze van de opdrachtgever).

## 4. Wat anders is dan het ontwerp, en wat niet is gebouwd

| Onderdeel | Wat er staat | Reden |
|---|---|---|
| **De bevestigingsstap ("Wie krijgt bericht") bij het wijzigen van een gepubliceerde activiteit** | **Niet gebouwd.** Het wijzigen zelf kan wel (F2-01): het formulier slaat direct op en zegt dat leden de wijziging meteen zien en dat er geen bericht uitgaat. De database kan beide (`activiteit_opslaan`, pgTAP en `e2e/gelijktijdig.spec.ts`) | O-1: de bevestigingsstap hoort per wijziging te laten zien wie bericht krijgt, en er gaat nog niets uit. Het bestuur laat het zelf weten als een wijziging ertoe doet. Komt met de berichten |
| Berichten naar leden (bij publiceren, bij wijzigen van een gepubliceerde activiteit) | Er gaat niets uit; de bevestigingspagina zegt dat | Open punt O-1 in `Datamodel-fase-2.md` |
| De bak en "Mijn diensten" ("Al je diensten") | Niet gebouwd | Besluit 2.4 van `Fase-2-plan.md`; fase 3 |
| Afmelden en Dienst overdragen | Niet gebouwd; Jouw status toont alleen wat jij bent | Fase 3 |
| De knop Publiceren is niet uitgeschakeld als er iets ontbreekt | De knop blijft aan; de bevestigingspagina noemt wat er nog nodig is (naast de lijst "Nog nodig om te publiceren" in het statuspaneel) | Een uitgeschakelde knop legt niet uit waarom |
| Een gewone keuzelijst (`<select>`) per plek in plaats van een lijst met zoekveld | Zoeken door te typen in de lijst; werkt zonder JavaScript, met toetsenbord en schermlezer | Een eigen zoekveld kan later |
| "Nieuwe helper toevoegen" ontbreekt in de keuzelijst | Een externe helper maak je nog niet in dit scherm | Ledenbeheer is fase 4; tot dan het script voor pilotleden |
| Geen "Je zag / Jij koos / Staat er nu" bij een plek die een ander net wijzigde | De melding bovenaan met de invoer behouden | Eerste versie |
| De locatie op het kaartje is één regel | Naam en adres samen, zoals ze in de database staan | Het ontwerp splitst ze; de database heeft één veld |
| Het scherm "niets gepland" heeft geen browsertest | Wel een unittest voor de keuze "geen activiteit" | De lokale database heeft altijd activiteiten van parallelle tests |
| "Concept verwijderen" staat op een telefoon onder het formulier in plaats van in de balk | Het statuspaneel is daar een balk met alleen de hoofdknoppen | Ontwerpregel `.wf-mobiel-onderaan` |
| De naam in de melding "… is verwijderd" komt uit het wijzigingenlog | Het adres bevat alleen het id | Geen vrije tekst in de adresbalk |

## 5. Dekking

De dekkingsmatrix van fase 2 staat in `Datamodel-fase-2.md` (punt 12). Stand van de browsertests die de matrix belooft:

| Regel of foutcode | Browsertest | Stand |
|---|---|---|
| R10 (telefoon eindverantwoordelijke) | `welkom.spec.ts`: alleen het nummer van de eindverantwoordelijke | Gehaald |
| R13 (lege plekken verborgen voor leden) | `welkom.spec.ts`: lege werker- en fotograaf-plek niet zichtbaar | Gehaald |
| R16 (geweest op het eindmoment) | Unittests in `programma.test.ts` en `ledenactiviteit.test.ts` (rond middernacht, de dag zelf, de Bonte Avond om 00:30) | **Niet in de browser** (de matrix beloofde "Programma na middernacht") |
| V8 5.6 (teller = lijst) | `beheeroverzicht.spec.ts` toetst de tellers als "minstens 4"; de gelijkheid van teller en lijst rust op de unittests in `beheeroverzicht.test.ts` | Gedeeltelijk |
| R19 (vlaggen zijn een waarschuwing) | `indelen.spec.ts`: de hint bij BOB en eindverantwoordelijke | Gehaald |
| R21 (publiceren) | `publiceren.spec.ts`: geblokkeerd met reden, daarna publiceren | Gehaald |
| R22 (doelgroep) | `programma.spec.ts`, `welkom.spec.ts` (een activiteit voor een andere groep is een 404) | Gehaald |
| V8 4.4 (`slot_gewijzigd`) | `indelen.spec.ts` | Gehaald |
| Beslissing 2.1 (`versie_verouderd`) | `activiteit-formulier.spec.ts`, `publiceren.spec.ts`, `gelijktijdig.spec.ts` | Gehaald |
| V8 4.6 (concept verwijderen) | `verwijderen.spec.ts` | Gehaald |
| V8 5.6 (teller = lijst, taak per regel) | `beheeroverzicht.spec.ts` | Gehaald |
| R2, R4 ("leden hebben geen knop") | — | Nog niets te testen: de ledenschermen hebben in fase 2 geen acties (fase 3) |
| R14, R17, R20, BA-1 (alleen servertests) | — | Zoals in de matrix |

## 6. De pilotcheck en het beslismoment van vrijdag 6 november

### 6.1 De pilotcheck uit `Bouwbesluiten` 5.2

Stand op 03-11-2026. Wat hieronder "open" staat, ligt grotendeels bij de bouwer en het bestuur en niet in de code.

| # | Eis | Stand |
|---|---|---|
| 1 | Echte deelnemers kunnen veilig inloggen; de inloglink kan opnieuw worden aangevraagd | Code gebouwd en getest (inloggen met een code per mail, `Inloggen.md`). **Open:** een eigen afzenderdomein voor de mail (de bouwer legt de vraag voor aan de begeleider; mail aan de opdrachtgever verstuurd); de rem op foute codes online meten (F1-19) |
| 2 | Beheer vereist MFA, met een herstelroute bij een verloren toestel | Gebouwd en online geprobeerd op 30-10-2026 (`Beheerders.md`). **Open:** de herstelroute werkt pas echt met een tweede beheerder (punt 5); de app van de opdrachtgever is aangemeld, de bevestiging door de bouwer volgt na de controle (`Beheerders.md`) |
| 3 | De noodzakelijke berichten komen aan, binnen de mailgrens; mislukte verzending is zichtbaar | **Alleen de inlogmail bestaat.** Berichten bij publiceren en wijzigen gaan niet uit (O-1); dat is met een klein testgroepje te dragen, mits de pilotleden het weten. Gaat het bestuur toch mails verwachten, dan komt `Bouwbesluiten` 5.3 (tabel `meldingen`, verzendtaak) vóór de pilot en schuift de planning |
| 4 | Een back-up is teruggezet | **Open.** Hoort bij het nieuwe Supabase-project op Pro (de bouwer); daarna één keer terugzetten en vastleggen |
| 5 | Twee beheerders hebben toegang tot GitHub, Supabase, Cloudflare, domein en betaling; iemand anders dan de bouwer heeft de runbookstappen uitgevoerd | **Open** (F1-09): tweede beheerder, repository naar een organisatie, licentie van de code |

### 6.2 Wat pilot A naast de code vraagt (`Fase-1-plan.md` 2.7)

| Wat | Stand |
|---|---|
| Akkoord van de opdrachtgever op de kosten (±€25 tot 30 per maand) | Open; meenemen in de vrijdag-update |
| Een nieuw Supabase-project op Pro in Frankfurt; Workers betaald plan | Open, de bouwer |
| Een eigen domein met mail via Resend | Open, zie punt 6.1 onder 1 |
| De leden van het testgroepje in het systeem, met toestemming (AVG) | Open, **en niet te doen zonder F2-02** |
| Fase 2 af: indelen en tonen wie waar staat | Gebouwd, op F2-01 en F2-02 na |

### 6.3 Advies voor vrijdag 6 november

**Pilot A (14 tot 22 november) is haalbaar, onder voorwaarden.** Wat de code betreft is er nog één onderdeel dat moet: de
bouwer moet de pilotleden met telefoonnummer en groep in het systeem kunnen zetten (F2-02, een script of beschreven
procedure). Het andere blokkerende punt, na het publiceren kunnen blijven indelen en corrigeren (F2-01), is gebouwd en
getest. De bevestigingsstap "Wie krijgt bericht" blijft buiten de pilot zolang er geen berichten uitgaan; het bestuur laat
wijzigingen die ertoe doen zelf weten.

Wat het beslismoment bepaalt, is daarom niet de code maar de lijst van punt 6.1 en 6.2: het Pro-project met een teruggezette back-up, het
afzenderdomein, de tweede beheerder en het akkoord op de kosten. Zijn die op 11 november niet rond, dan is pilot B (3 januari
2027, mét afmelden en ruilen) de nette keuze en laat de bouwer de opdrachtgever dat weten. Het besluit is aan de bouwer;
dit is het advies.

## 7. Van fase 2 naar fase 3 en de pilot

**Vóór de pilot (echte leden, 14 november) die uit fase 2 komen**

| Wat | Bron |
|---|---|
| ~~Een gepubliceerde activiteit wijzigen in beheer~~ Gebouwd (formulier met "Wijzigingen opslaan", zonder bericht) | F2-01 |
| Telefoon, groepen en aanmerkingen van de pilotleden zetten (script of beschreven procedure). De waarschuwing in het formulier bij een eindverantwoordelijke zonder nummer is gebouwd | F2-02 |
| De doorloop met toetsenbord, telefoon en schermlezer en de vergelijking met het visuele ontwerp (punt 2.1 en 2.2); de Supabase-adviseur opnieuw (2.3) | Punt 2 |
| De pilotleden uitleggen dat afmelden en ruilen nog niet kan (de Start zegt "Iedereen staat standaard op aanwezig") | F2-14 |
| De overige punten "Vóór de pilot" uit `Afname-fase-1.md` punt 4: afzenderdomein, het echte e-mailadres in de ontwikkeldatabase (F1-06), tweede beheerder en organisatie (F1-09), de rem op foute codes meten (F1-19), de lege taken-Worker, `/ontwerp` en het tijdelijke inlogscript weghalen of afschermen (F1-20), de pilotcheck | `Afname-fase-1.md` |
| Kosten, Pro-project, Workers betaald, een teruggezette back-up | `Fase-1-plan.md` 2.7 |

**In fase 3 (afmelden en ruilen)**

| Wat | Bron |
|---|---|
| Afmelden, afmelding intrekken, dienst overdragen, de Stappenbalk en de Schakelaar; "Mijn diensten" ("Al je diensten") | `Fase-2-plan.md` 1 |
| Een wachtstand op de knoppen, zodat dubbel klikken geen tweede concept maakt | F2-05 |
| Het filter "verlopen concepten" in het beheeroverzicht, als de pilot laat zien dat het nodig is | F2-13 |
| De bevestigingsstap "Wie krijgt bericht" bij wijzigen van een gepubliceerde activiteit, samen met de berichten (`Bouwbesluiten` 5.3) | O-1 |
| Een gepubliceerde activiteit die al geweest is nog corrigeren (alleen velden zonder gevolgen) | O-2 |

**Later**

| Wat | Bron |
|---|---|
| Een controle op "precies één eindverantwoordelijke-plek" bij oud papier maken (fase 5) en kopiëren (fase 9) | F2-11 |
| De functie die leden inactief zet (fase 4) neemt de lock of herhaalt de toets op de eindverantwoordelijke | F2-12, R2-17 |
| De bak (`bak_actief`): de plek en het scherm, vóór de eerste bak in januari | Besluit 2.4 |
| Een eigen zoekveld in de keuzelijst van een plek; "Nieuwe helper toevoegen" in het scherm | Punt 4, fase 4 |
