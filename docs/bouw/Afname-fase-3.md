# Afname fase 3

Stand 05-11-2026. Wat fase 3 (afmelden, afmelding intrekken, dienst overdragen, Mijn diensten) heeft opgeleverd, wat er bewust niet in zit, de review van
fase 3 als geheel met wat ermee is gedaan, de dekking en de lijst "Van fase 3 naar pilot B". Wie de afname van een volgende fase of het beslismoment van
vrijdag 6 november voorbereidt, leest dit bestand en `Afname-fase-2.md` eerst.

**Stand (05-11-2026): de stappen A tot en met E van `Fase-3-plan.md` staan in `main` (PR 55, 56, 58, 59 en 60, met PR 57 ernaast), de migratie staat online
(`uitrol` van 04-11-2026 geslaagd) en de review van fase 3 als geheel is verwerkt (punt 3). Alleen stap G (de bak) en de afname zelf staan nog open.** Wat met de
hand moet door de bouwer staat in punt 2: de functies zijn online nog niet door een echt lid aangeroepen, want de leden staan nog niet online.

## 1. Wat fase 3 heeft opgeleverd

| Onderdeel | Bewijs | Stand |
|---|---|---|
| Datamodel van afmelden en ruilen, eerst op papier en gereviewd | `Datamodel-fase-3.md`; review door een schone chat vóór de migratie (PR 55): twee blokkerende bevindingen verwerkt (`ruil_dienst` verhoogde de versie, wat een eerder besluit tegensprak; `mijn_diensten` lekte voor een beheerder) | Gehaald |
| Migratie en rechten: `meld_af`, `trek_afmelding_in`, `ruil_dienst`, `beschikbare_vervangers`, de view `mijn_diensten` | PR 56; pgTAP `fase3_afmelden_ruilen.test.sql` (122 tests), de rechtentest en de bewaker aangepast; **acht bewust ingebouwde fouten in de functies maakten de tests allemaal rood**; review van de migratie door een schone chat: geen blokkerende bevinding, de opmerkingen verwerkt of vastgelegd | Gehaald, online sinds 04-11-2026 |
| Gelijktijdigheid: twee afmeldingen bij het minimum, dezelfde afmelding twee keer, een vervanger die zich afmeldt, twee overdrachten naar dezelfde vervanger, twee overdrachten van dezelfde plek, een overdracht tegen `activiteit_opslaan` in beide richtingen, afmelden tegen indelen in beide richtingen, een concept dat wordt verwijderd | `e2e/ledenacties-gelijktijdig.spec.ts` (10 scenario's met twee echte databasesessies); **zonder de locks zijn ze rood** (apart gecontroleerd, per scenario) | Gehaald |
| Afmelden en afmelding intrekken: bevestiging met toelichting, resultaat, de blokkade onder de ondergrens met het nummer van de eindverantwoordelijke, intrekken vanaf Start en uit het programma, een wachtstand op de knoppen | PR 58; `e2e/afmelden.spec.ts` (7 tests), `src/lib/afmelden.ts` met 22 unit tests | Gehaald |
| Je dienst overdragen en afmelden met een dienst: een lijst met zoekveld en redenen, de bevestiging, het resultaat, de twee stappen met de Stappenbalk, een vervanger die zich net afmeldt of ergens anders wordt ingedeeld | PR 59; `e2e/ruilen.spec.ts` (6 tests), `src/lib/ruilen.ts` met unit tests | Gehaald |
| Mijn diensten: komende diensten, Afgemeld, Geweest, de lege staat, de wisselaar in het programma, de ingangen op Start | PR 60; `e2e/mijn-diensten.spec.ts` (4 tests), `src/lib/mijndiensten.ts` met 8 unit tests | Gehaald |
| Alle controles groen in GitHub | De workflow `check` groen op elke pull request van deze fase en op `main` | Gehaald |

Aantallen op 05-11-2026 (de poort, na de bevindingen van de review): 259 unit tests (Vitest), 222 tests voor de scripts, 469 databasetests (pgTAP, 7 bestanden) en 279 browsertests
(Playwright, desktop en telefoon, plus de databasespecs).

## 2. Met de hand

Deze punten kan Claude niet voor de bouwer doen. Ze staan open.

### 2.1 Doorloop met toetsenbord, telefoon en schermlezer

De browsertests controleren op elke pagina axe (WCAG) en dat er op 375 px niets opzij schuift. Dat vervangt de doorloop niet:

- **Toetsenbord:** afmelden, intrekken en overdragen zonder muis (Tab, Spatie bij de keuzerondjes, Enter); waar komt de focus na een melding of een gewijzigde knop (de
  wachtstand zet de knoptekst om terwijl de knop uit staat)?
- **Telefoon:** de Vervangerkeuze met een lange lijst, het zoekveld en het toetsenbord dat over de knoppen valt, de Stappenbalk onder elkaar, de kaart "Mijn diensten" bovenaan.
- **Schermlezer:** de Stappenbalk ("Stap 1 — vervanger aangewezen (klaar)"), de redenen onder de uitgeschakelde keuzerondjes, "Afmelden voor <naam>" op Start met meer dan één activiteit.

### 2.2 Vergelijking met het visuele ontwerp

De schermen zijn gebouwd met de bestaande componenten (`Design-overdracht.md` 4). Per scherm naast het ontwerp leggen op 1200 en 375 px: `afmelden-bevestigen`, `afmelden-gelukt`,
`afmelden-fout-ondergrens`, `afmelding-ingetrokken`, `afmelden-eerst-ruilen`, `afmelden-stap1-*`, `afmelden-stap2-bevestigen`, `ruilen-kies-vervanger`, `ruilen-bevestigen`,
`ruilen-gelukt`, `ruilen-fout-afgemeld`, `ruilen-fout-dubbel`, `mijn-diensten`, `mijn-diensten-leeg`. Zeker kijken: de Stappenbalk (nieuw, zonder pijltje tussen de stappen) en de keuze
tussen "Afmelden" en "Dienst overdragen" in het paneel (beide `secundair`; het ontwerp heeft Afmelden primair).

### 2.3 Online proberen

De migratie draait online en de pagina's staan er, maar geen echt lid heeft ze online gebruikt. Zet de leden online (`Pilotleden.md`, eerst als proef), meld je af en trek in, draag een
dienst over en kijk of Mijn diensten klopt, met een tweede lid in een tweede browser.

## 3. De review van fase 3 als geheel: bevindingen en afhandeling

Een schone chat las fase 3 als geheel (de app-kant, de flows, de lekken, de regels, de toegankelijkheid en de tests), zonder iets te draaien of te wijzigen, en
verifieerde elke bevinding in de code. **Geen blokkerende bevinding.** Zes punten waren belangrijk, tien klein; wat hieronder "opgelost" staat, zit in deze afname.
De review probeerde ook te breken en lukte niet: een `redirect()` binnen een `try`, verzonnen adressen en queryparameters (ids worden gecontroleerd, `taak` kent alleen
`afmelden`, `min` en `nu` zijn beperkt tot cijfers), een concept of verborgen activiteit (404, gelijk aan onbekend), een vervanger buiten de doelgroep of een externe helper
(de database weigert), een lek via `beschikbare_vervangers` of `mijn_diensten` voor een beheerder, en de randen van deadline, minimum en eindmoment.

| # | Ernst | Bevinding | Afhandeling |
|---|---|---|---|
| B1 | belangrijk | De overdracht zoekt de dienst opnieuw op: wisselt het bestuur het lid intussen van werker naar fotograaf, dan geeft een klik op de bevestiging de fotograafplek weg, onomkeerbaar | **Opgelost**: de bevestiging geeft de rol mee en de actie vergelijkt; is de dienst een andere geworden, dan gaat er niets weg en volgt Start met de actuele stand (UC-002 AF-6). Browsertest |
| B2 | belangrijk | De resultaatpagina's beweren wat het adres zegt (`?v=`, `?reden=`, `?min=&nu=`), terwijl het plan zegt dat ze het adres niet vertrouwen | **Opgelost**: `gelukt` eist dat het lid zelf geen plek meer heeft en de vervanger er een heeft; `niet-gelukt` eist dat de vervanger met die reden in de vervangerlijst staat (of er niet in, bij "ongeldig"); `kan-niet` eist een verstreken deadline. Anders terug naar de lijst. Browsertest. **Bewust zo gelaten:** de aantallen op `kan-niet` en de naam bij stap 2 komen uit het adres (alleen cijfers en een naam die het lid al mag lezen) |
| B3 | belangrijk | Het lid hoort pas ná het onomkeerbare moment dat de vervanger geen bericht krijgt | **Opgelost**: één zin vóór de knop: "<naam> krijgt hier geen bericht van: zorg dat die het weet" |
| B4 | belangrijk | De uitleg bij een beheerrol noemt geen naam of nummer (UC-003 AF-2 en `welkom-bob` wel); de eindverantwoordelijke verwijst naar zichzelf; "als bob" staat kleingeschreven; BOB en eindverantwoordelijke staan in Mijn diensten terwijl het project zegt dat BOB geen Mijn diensten heeft | **Deels opgelost**: de uitleg noemt nu de eindverantwoordelijke met naam en nummer, en de eindverantwoordelijke zelf verwijst naar het bestuur (unit tests). **Open:** de kleine letter bij BOB, en het **besluit** of BOB en eindverantwoordelijke in Mijn diensten horen (O-8; nu: ja, de view laat alleen de bak weg) |
| B5 | belangrijk | Typt een lid een naam en kiest hij niets, dan blokkeert de browser stil: het eerste verplichte keuzerondje is verborgen door het zoekfilter | **Opgelost**: alleen zichtbare rondjes zijn verplicht. Browsertest (de focus gaat naar het zichtbare rondje) |
| B6 | belangrijk | Geen browsertest voor "de overdracht slaagt en het afmelden strandt op de ondergrens", en voor een dienst die er tijdens het afmelden bijkomt | **Opgelost**: beide browsertests, plus de toelichting die blijft staan (K1). Niet in de browser: `rol_niet_ruilbaar` en `geen_lid` in de acties (unit tests op de vertaling) |
| K1 | klein | Een foutmelding bij het afmelden maakt het toelichtingsveld leeg (React maakt een formulier leeg na een actie) | **Opgelost**: de toelichting komt met de fout terug en blijft staan. Browsertest |
| K2 | klein | De wachtstand zet de knop uit: de focus gaat verloren en een schermlezer hoort niets | **Open**, voor de doorloop met de schermlezer (punt 2.1) |
| K3 | klein | Een overdracht uit een oude pagina of een tweede tabblad (het lid heeft zijn dienst al niet meer) geeft een stille doorverwijzing naar Start, ook midden in het afmelden | **Open** |
| K4 | klein | "Er is niets vastgelegd: je staat nog steeds op aanwezig" klopt half voor wie net zijn dienst overdroeg | **Open** |
| K5 | klein | Het blok "je eerder overgedragen dienst komt niet terug" en de regels "Ingetrokken op" en "Vastgelegd" ontbreken en stonden niet onder "bewust niet"; twee commentaren waren verouderd | De commentaren zijn bijgewerkt en de ontbrekende onderdelen staan in punt 4 en 7 |
| K6 | klein | De kaart op Start telt de komende diensten zonder seizoen; Mijn diensten telt dit seizoen | **Open**; verschilt alleen in de weken vóór 1 september |
| K7 | klein | `leesAfmeldingen` bouwt een lijst van alle afmeldingen ooit; die groeit per seizoen | **Open**; geen probleem voor de pilot |
| K8 | klein | Het foutlog noemt bij een bedoelde fout alleen `BK001`, niet de foutcode | **Opgelost** (de code uit het bericht; geen persoonsgegevens) |
| K9 | klein | `RUILBARE_ROLLEN` en `roltypen` zijn gespiegeld zonder koppeltest; een lid met een plek in de bak krijgt "Afmelden" aangeboden (de database weigert met `heeft_adminrol`) | **Open**; het laatste past bij stap G |
| K10 | klein | Een lid dat net inactief is, ziet op `/mijn` dat zijn adres nog niet bij de leden staat | **Open** (bestond al) |
| T | test | Een zwakke assertie (de naam van de activiteit bevat het woord "afgemeld"); de wachtstand is niet bewezen (de dubbelklik slaagt ook door `al_afgemeld`); twee tests rekenen met +10 en -3 dagen en kunnen op de seizoensgrens (1 september) of om middernacht afwijken | De assertie is gerepareerd; de rest is **open** |

Een correctie op `Datamodel-fase-3.md` punt 6: de volgorde "adminrol vóór ruilbaar" is niet te testen, want een lid heeft hooguit één plek per activiteit (`geen_dubbelboeking`); de test bestaat niet en de eis hoort niet in de matrix.

## 4. Wat anders is dan het ontwerp, en wat niet is gebouwd

| Wat | Wat er nu is | Waarom |
|---|---|---|
| Berichten (aan de vervanger bij een overdracht, aan het bestuur onder de ondergrens, UC-002 stap 9, R18) | Er gaat niets uit; de pagina na een overdracht zegt dat het platform nog geen bericht stuurt | O-1, `Bouwbesluiten` 5.3; **besluit vóór 1 december** |
| Het blok "Let op: je eerder overgedragen dienst komt niet terug" na het intrekken | Niet gebouwd | Een lid kan zijn eigen overdracht niet lezen (het log is voor het bestuur); dat vraagt een leesroute |
| De bak in Mijn diensten en de Schakelaar | Niet gebouwd; `mijn_diensten` laat de bak weg | Stap G, vóór de eerste Bonte Avond (15 januari); een aanname uit UC-007 AF-2 |
| "Zet in je agenda" (UC-008) | Niet gebouwd | Fase 7 |
| De kaart "Mijn diensten" direct na het kaartje op een telefoon | Staat direct onder de statuskaart bovenaan | Eenvoud; ter beoordeling bij de doorloop |
| Wachtstand op Publiceren en Opslaan (F2-05) | Alleen op de nieuwe knoppen (afmelden, intrekken, overdragen) | Die knoppen staan buiten hun formulier en vragen een kleine ombouw |
| Een afmelding op een geannuleerde activiteit is niet meer in te trekken (besluit 3.5) | Zo gebouwd; wijkt af van R9 en UC-003 | `use-cases.md` in de ontwerpmap bijwerken (O-6) |
| `ruilen-gelukt` zegt dat de vervanger bericht heeft gekregen | Zegt dat het platform nog geen bericht stuurt | Eerlijk blijven tot O-1 is besloten |
| De rollen die een lid kan overdragen staan twee keer: in `roltypen` en als `RUILBARE_ROLLEN` in `src/lib/ruilen.ts` | Gespiegeld; de database blijft leidend (`rol_niet_ruilbaar`) | Een nieuw roltype vraagt een regel in beide (BA-6) |
| Een slothouder ziet via de vervangerlijst wie van de doelgroep zich heeft afgemeld of al is ingedeeld | Zo gebouwd (UC-002 stap 3 en 4) | Leg het aan de opdrachtgever voor als bewust gekozen (O-5) |
| "Ingetrokken op" (`afmelding-ingetrokken`) en "Vastgelegd" (`ruilen-gelukt`) | Niet gebouwd; de pagina's zeggen wat er is gebeurd, niet wanneer | De afmelding heeft een moment, de overdracht heeft er voor een lid geen leesbaar |
| BOB en eindverantwoordelijke in Mijn diensten | Staan erin (de view laat alleen de bak weg); op hun eigen rij staat ook "Al je diensten" | Het project zegt dat BOB geen Mijn diensten heeft: een **besluit** voor de ontwerper (O-8) |
| Het statuspaneel op Start en in het programma heeft Afmelden en Dienst overdragen allebei als `secundair` | Zo gebouwd | Het ontwerp heeft Afmelden primair; "de primaire knop duwt niet" pleit voor rustig; ter beoordeling bij de doorloop |

## 5. Dekking

De dekkingsmatrix van fase 3 staat in `Datamodel-fase-3.md` (punt 6). Stand van de tests die de matrix belooft:

| Regel of foutcode | Servertest | Browsertest | Stand |
|---|---|---|---|
| R1, R12, R22 (wie telt mee) | `meld_af` telt alleen de doelgroep; `intern.aantal_aanwezigen` | `afmelden.spec.ts` (de ondergrens in een eigen groep) | Gehaald |
| R2, R6, R20 (geen lege plek, geen dubbelboeking) | `ruil_dienst`, `dubbelboeking`; de gelijktijdigheidstests | `ruilen.spec.ts` (niet-gelukt, reden dubbel) | Gehaald |
| R4, R23 (beheerrollen) | `heeft_adminrol`, `rol_niet_ruilbaar` | `afmelden.spec.ts`, `ruilen.spec.ts` (geen knop, een uitleg) | Gehaald |
| R5, R14, R17 (vervanger) | `vervanger_afgemeld`, `vervanger_ongeldig`, de pariteit met `beschikbare_vervangers` | `ruilen.spec.ts` (grijs met reden, niet-gelukt) | Gehaald |
| R7 (afmelden met een dienst = eerst ruilen) | `heeft_ruilbare_rol` | `ruilen.spec.ts` (twee stappen) | Gehaald |
| R8 (de ondergrens) | `onder_ondergrens` (grens, deadline, geen minimum) | `afmelden.spec.ts` (de blokkade met nummer en cijfers) | Gehaald |
| R9 (intrekken) | `trek_afmelding_in` | `afmelden.spec.ts`, `mijn-diensten.spec.ts` (ook vanuit Mijn diensten) | Gehaald |
| R15, R16 (niet open, geweest) | `activiteit_niet_open`, `activiteit_voorbij`, verborgen = onbekend | `afmelden.spec.ts` (404 en een uitleg) | Gehaald |
| R22 voor een beheerder | `mijn_diensten` op `aal2` | — | Alleen servertest |
| V8 5.7 (Mijn diensten) | `mijn_diensten` | `mijn-diensten.spec.ts` | Gehaald |
| Gelijktijdigheid | — | `ledenacties-gelijktijdig.spec.ts` (10 scenario's, rood zonder lock) | Gehaald |
| R9 met een eerder overgedragen dienst (de pagina zegt dat die niet terugkomt) | `trek_afmelding_in` raakt `rol_slots` niet | — | Alleen servertest; het blok op de pagina is niet gebouwd |

## 6. Gevolgen voor de pilot en het beslismoment van vrijdag 6 november

Fase 3 is **niet nodig voor pilot A** (14 tot 22 november, `Fase-2-plan.md`) maar staat er nu wel online: de leden van pilot A kunnen zich ook afmelden, intrekken, hun dienst
overdragen en hun diensten zien. Dat verandert twee dingen:

- **F2-14 ("de pilotleden uitleggen dat afmelden en ruilen nog niet kan") vervalt.** Wat ontbreekt is een ander ding: er gaan geen berichten uit (O-1). Bij een overdracht merkt de
  vervanger het alleen als hij de app opent of als het lid het zegt; onder de ondergrens belt het lid de eindverantwoordelijke. Met een klein testgroepje is dat te dragen, mits de
  pilotleden het weten.
- **Het advies uit `Afname-fase-2.md` 6.3 verandert niet:** wat het beslismoment bepaalt, is niet de code maar de lijst van punt 6.1 en 6.2 daar (het Pro-project met een teruggezette back-up, het
  afzenderdomein, de tweede beheerder, het akkoord op de kosten en de eerste echte lijst online). Zijn die op 11 november niet rond, dan is pilot B (3 januari 2027) de nette keuze.

Nieuw sinds fase 2: **de opdrachtgever vindt dat een lid zijn telefoonnummer zelf bij het inloggen moet invullen**, in ieder geval het bestuur (05-11-2026). Dat haalt de bouwer uit de keten van de eerste lijst en het
maakt de eindverantwoordelijke zonder nummer oplosbaar door het lid zelf. Voorstel en rechten: een veld in Mijn account met een databasefunctie voor het eigen nummer, met een review. Zie punt 7.

## 7. Van fase 3 naar pilot B en fase 4

**Vóór pilot A (echte leden, 14 november)**

| Wat | Bron |
|---|---|
| De doorloop met toetsenbord, telefoon en schermlezer, de vergelijking met het visuele ontwerp en online proberen (punt 2) | Punt 2 |
| Het telefoonnummer zelf invullen (de opdrachtgever, 05-11-2026): een veld in Mijn account, een melding voor wie eindverantwoordelijke kan zijn, en de melding bij het publiceren verwijst ernaar | Punt 6 |
| De overige punten "Vóór de pilot" uit `Afname-fase-2.md` 7 (afzenderdomein, tweede beheerder, de rem op foute codes meten, kosten, Pro-project, een teruggezette back-up) | `Afname-fase-2.md` 7 |

**Vóór pilot B (3 januari)**

| Wat | Bron |
|---|---|
| Het besluit over berichten: komen ze vóór pilot B, of draait pilot B zonder en licht het bestuur de vervanger in? **Uiterlijk 1 december** | O-1 |
| De bak: de plek, het beheerscherm, de lijst voor leden en de tekst bij afmelden; vóór de eerste Bonte Avond (15 januari) | Stap G |
| Het blok "je eerder overgedragen dienst komt niet terug" na het intrekken (vraagt een leesroute voor de eigen overdracht) | UC-003 AF-6 |
| De wachtstand op Publiceren en Opslaan | F2-05 |
| **Besluit:** horen BOB en eindverantwoordelijke in Mijn diensten (nu ja; het project zegt dat BOB geen Mijn diensten heeft)? Bij "nee": de app laat ze weg en haalt "Al je diensten" van hun rij | O-8 |
| De open punten uit de review van fase 3 (K2 tot en met K4, K6, K7, K9 en K10) en de tests die op de seizoensgrens of om middernacht kunnen afwijken | Punt 3 |

**Voor fase 4 (ledenbeheer) en later**

| Wat | Bron |
|---|---|
| Ledenbeheer neemt eerst de locks op de activiteiten waar het lid in de doelgroep zit, in vaste volgorde, en wijzigt daarna pas de `leden`-rijen (en de telling van aanwezigen heeft een eigen regel) | O-4, O-4a |
| `use-cases.md` in de ontwerpmap bijwerken: besluit 3.5 (een afmelding op een geannuleerde activiteit blijft staan) en de vervanger die de activiteit moet kunnen zien | O-6 |
| Leg aan de opdrachtgever voor dat een slothouder in de vervangerlijst ziet wie zich heeft afgemeld | O-5 |
| `beschikbare_vervangers.reden` is `null` bij een beschikbaar lid; de gegenereerde types zeggen `string` | O-7 |
| De functie die leden inactief zet (fase 4) neemt de lock of herhaalt de toets op de eindverantwoordelijke | F2-12 |
