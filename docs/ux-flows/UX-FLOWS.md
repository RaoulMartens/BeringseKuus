# UX Flows — Ledenplatform C.V. De Beringse Kuus

MVP-pilot, leden en beheer. Desktop-first (1200px canvas, navigatie bovenin). Alle schermen
hebben ook een mobiele weergave (zie Navigatiepatronen).

**Bron:** `FO_Beringse_Kuus_V4.docx` (het wat) en `Bouwgids_Beringse_Kuus_V7.docx` (het hoe).
Er is geen PRD; het FO en de bouwgids vervullen die rol. Het FO loopt achter op de
bouwgids, zie "Nog door te voeren in de bronnen".

**Scope:** welkomscherm, ruilen en afmelden (leden), en activiteit aanmaken, publiceren
en indelen (beheer). Buiten scope: Excel-import van leden, activiteit annuleren,
eerlijke-verdelingsoverzicht, ledenbeheer, meldingeninstellingen en het overzicht van
openstaande ruilverzoeken.

Deze flows dekken **fase 1 tot en met 3** van de bouwvolgorde uit de bouwgids
(hoofdstuk 10): activiteiten aanmaken, indelen en publiceren, en daarna afmelden,
ruilen en de bijbehorende rechtenregels. Dat is het onderdeel dat vóór 10 januari
af moet zijn (bouwgids 13.3).

---

## Master screen map

[diagrams/screen-map.md](diagrams/screen-map.md) — alle 79 schermen en hun navigatiepaden.

## Scherminventaris

| Scherm | Doel | Wireframe | Use case |
|--------|------|-----------|----------|
| Welkom | Bron van waarheid: welke activiteit, welke tijden, wie doet wat | [welkom.html](wireframes/welkom.html) | UC-001 |
| Welkom — niets gepland | Lege staat | [welkom-leeg.html](wireframes/welkom-leeg.html) | UC-001 AF-1 |
| Welkom — twee activiteiten | Alle activiteiten van vandaag tonen, op tijd; wat voorbij is verdwijnt (FO 7.1, R11, R16) | [welkom-twee.html](wireframes/welkom-twee.html) | UC-001 AF-8 |
| Welkom — afgemeld | Status tonen + intrekken aanbieden | [welkom-afgemeld.html](wireframes/welkom-afgemeld.html) | UC-001 AF-3 |
| Ruilen — vervanger kiezen | Uitkomst van onderlinge afstemming vastleggen | [ruilen-kies-vervanger.html](wireframes/ruilen-kies-vervanger.html) | UC-002 |
| Ruilen — bevestigen | Onomkeerbare stap expliciet maken | [ruilen-bevestigen.html](wireframes/ruilen-bevestigen.html) | UC-002 |
| Ruilen — gelukt | Bevestigen + doorstap naar afmelden | [ruilen-gelukt.html](wireframes/ruilen-gelukt.html) | UC-002 |
| Ruilen geweigerd — vervanger net afgemeld | Alleen bij gelijktijdigheid (R5) | [ruilen-fout-afgemeld.html](wireframes/ruilen-fout-afgemeld.html) | UC-002 AF-1 |
| Ruilen geweigerd — vervanger net ingedeeld | Alleen bij gelijktijdigheid (R6) | [ruilen-fout-dubbel.html](wireframes/ruilen-fout-dubbel.html) | UC-002 AF-2/AF-7 |
| Afmelden — twee stappen aangekondigd | Doorverwijzing R7 | [afmelden-eerst-ruilen.html](wireframes/afmelden-eerst-ruilen.html) | UC-003 AF-1 |
| Afmelden stap 1 — vervanger kiezen | Overdracht met stapaanduiding | [afmelden-stap1-vervanger.html](wireframes/afmelden-stap1-vervanger.html) | UC-003 AF-1 → UC-002 |
| Afmelden stap 1 — overdracht bevestigen | Onomkeerbare stap, stap 2 aangekondigd | [afmelden-stap1-bevestigen.html](wireframes/afmelden-stap1-bevestigen.html) | UC-003 AF-1 → UC-002 |
| Afmelden stap 2 — afmelding bevestigen | Afronden waar het lid aan begon | [afmelden-stap2-bevestigen.html](wireframes/afmelden-stap2-bevestigen.html) | UC-003 |
| Afmelden — bevestigen | Afmelding + optionele toelichting | [afmelden-bevestigen.html](wireframes/afmelden-bevestigen.html) | UC-003 |
| Afmelden — gelukt | Bevestigen + intrekken aanbieden | [afmelden-gelukt.html](wireframes/afmelden-gelukt.html) | UC-003 |
| Afmelden geblokkeerd — ondergrens | Foutpad R8 | [afmelden-fout-ondergrens.html](wireframes/afmelden-fout-ondergrens.html) | UC-003 AF-3 |
| Welkom — BOB | Geen knop Afmelden: het nummer van de eindverantwoordelijke (R4, interactiecheck B4) | [welkom-bob.html](wireframes/welkom-bob.html) | UC-003 AF-2 |
| Activiteit waarvoor je afgemeld bent | Afmelding intrekken voor een activiteit verderop in het seizoen | [activiteit-bonte-avond-afgemeld.html](wireframes/activiteit-bonte-avond-afgemeld.html) | UC-003 AF-6 |
| Afmelding ingetrokken | Terug naar aanwezig | [afmelding-ingetrokken.html](wireframes/afmelding-ingetrokken.html) | UC-003 AF-6 |
| Mijn diensten | Al je diensten op één plek, in één oogopslag (de opdrachtgever, 15-10) | [mijn-diensten.html](wireframes/mijn-diensten.html) | UC-007 |
| Mijn diensten — geen diensten | Lege staat | [mijn-diensten-leeg.html](wireframes/mijn-diensten-leeg.html) | UC-007 AF-1 |
| Mijn diensten — raadslid | Een plek in de bak staat erbij met het label bak | [mijn-diensten-raadslid.html](wireframes/mijn-diensten-raadslid.html) | UC-007 AF-2 |
| Welkom — raadslid | Je zit in de bak; afmelden leidt naar de blokkade | [welkom-raadslid.html](wireframes/welkom-raadslid.html) | UC-001, UC-007 AF-2 |
| Programma — raadslid | Wat een lid buiten het bestuur ziet: geen Bestuursvergadering (R22) | [programma-raadslid.html](wireframes/programma-raadslid.html) | R22 |
| Agenda koppelen | Alles of alleen diensten; iPhone met een tik, Android via Google Agenda | [agenda.html](wireframes/agenda.html) | UC-008 |
| Agenda gekoppeld | Wat er nu gebeurt en hoe wijzigingen binnenkomen | [agenda-gelukt.html](wireframes/agenda-gelukt.html) | UC-008 |

### Aanmelden, account en foutschermen (29-10-2026)

Ontwerpgaten uit de bouw (zie "Ontwerpgaten uit de bouw" hieronder), geen onderdeel van een use case.

| Scherm | Doel | Wireframe |
|--------|------|-----------|
| Inloggen | E-mailadres invullen; geen wachtwoord | [inloggen.html](wireframes/inloggen.html) |
| Inloggen — fout e-mailadres | Foutmelding bij het veld | [inloggen-fout-adres.html](wireframes/inloggen-fout-adres.html) |
| Inloggen — link verstuurd | Zelfde antwoord voor bekend en onbekend adres | [inloggen-verstuurd.html](wireframes/inloggen-verstuurd.html) |
| Inloggen — de mail | Voorstel voor onderwerp en tekst van de mail (geen scherm) | [inloggen-mail.html](wireframes/inloggen-mail.html) |
| Inloggen — bevestigen | Pagina achter de link in de mail; de klik op Inloggen logt in | [inloggen-bevestigen.html](wireframes/inloggen-bevestigen.html) |
| Inloggen — link werkt niet meer | Verlopen of gebruikte link, meteen een nieuwe aanvragen | [inloggen-link-ongeldig.html](wireframes/inloggen-link-ongeldig.html) |
| Uitgelogd | Terugkoppeling na uitloggen, op het inlogscherm | [uitgelogd.html](wireframes/uitgelogd.html) |
| Mijn account | Wie is ingelogd, uitloggen (tijdelijk) | [mijn-account.html](wireframes/mijn-account.html) |
| Beheer — app instellen | MFA instellen met een authenticator-app (bestuur) | [mfa-instellen.html](wireframes/mfa-instellen.html) |
| Beheer — wacht op bevestiging | App ingesteld; een andere beheerder bevestigt nog | [mfa-wacht-op-bevestiging.html](wireframes/mfa-wacht-op-bevestiging.html) |
| Beheer — code invoeren | 6 cijfers bij elke beheersessie | [mfa-code.html](wireframes/mfa-code.html) |
| Beheer — foute code | Foutmelding bij het veld, zonder tellers | [mfa-code-fout.html](wireframes/mfa-code-fout.html) |
| Beheer — code opnieuw | Na 12 uur, met de reden | [mfa-opnieuw.html](wireframes/mfa-opnieuw.html) |
| Beheer — telefoon kwijt | Hulpscherm: wie je vraagt en wat die doet; geen zelfbediening | [mfa-toestel-kwijt.html](wireframes/mfa-toestel-kwijt.html) |
| Pagina niet gevonden | 404; ook voor een voor jou verborgen activiteit (R22) | [niet-gevonden.html](wireframes/niet-gevonden.html) |
| Er ging iets mis | Algemene fout aan onze kant | [fout.html](wireframes/fout.html) |
| Storing | De gegevens zijn niet bereikbaar; niet doorsturen naar Inloggen | [storing.html](wireframes/storing.html) |
| Alleen voor het bestuur | Lid zonder bestuursrol opent een beheerpagina | [alleen-bestuur.html](wireframes/alleen-bestuur.html) |

### Buiten de MVP-scope, voor de walkthrough

Twee schermen die niet bij UC-001 t/m UC-003 horen. Ze staan er om het gesprek met de
opdrachtgever te kunnen voeren, niet om in fase 1 t/m 3 gebouwd te worden.

| Scherm | Waarom | Wireframe |
|--------|--------|-----------|
| Programma | Het FO opent met "alle leden zien het volledige seizoensprogramma" (FO, doel). Dat ontbrak. Toont per rij je eigen rol én of je bent afgemeld — dat laatste was nergens over het hele seizoen te zien, terwijl R9 zegt dat je een afmelding altijd mag intrekken. | [programma.html](wireframes/programma.html) |

Volledige inventaris met kernelementen en uitgaande links:
[wireframes/INDEX.md](wireframes/INDEX.md).

## Use case-diagrammen

| Use case | Flowchart | States | Sequence |
|----------|-----------|--------|----------|
| UC-001 Welkomscherm | [flow](diagrams/uc-001-welkomscherm/flow.md) | [states](diagrams/uc-001-welkomscherm/states.md) | [sequence](diagrams/uc-001-welkomscherm/sequence.md) |
| UC-002 Dienst ruilen | [flow](diagrams/uc-002-ruilen/flow.md) | [states](diagrams/uc-002-ruilen/states.md) | [sequence](diagrams/uc-002-ruilen/sequence.md) |
| UC-003 Afmelden | [flow](diagrams/uc-003-afmelden/flow.md) | [states](diagrams/uc-003-afmelden/states.md) | [sequence](diagrams/uc-003-afmelden/sequence.md) |
| UC-004 Activiteit beheren | [flow](diagrams/uc-004-activiteit-beheren/flow.md) | [states](diagrams/uc-004-activiteit-beheren/states.md) | [sequence](diagrams/uc-004-activiteit-beheren/sequence.md) |
| UC-005 Indelen | [flow](diagrams/uc-005-indelen/flow.md) | [states](diagrams/uc-005-indelen/states.md) | [sequence](diagrams/uc-005-indelen/sequence.md) |
| UC-006 Meerdere activiteiten aanmaken | [flow](diagrams/uc-006-bulk-aanmaken/flow.md) | [states](diagrams/uc-006-bulk-aanmaken/states.md) | [sequence](diagrams/uc-006-bulk-aanmaken/sequence.md) |
| UC-007 Mijn diensten bekijken | [flow](diagrams/uc-007-mijn-diensten/flow.md) | [states](diagrams/uc-007-mijn-diensten/states.md) | [sequence](diagrams/uc-007-mijn-diensten/sequence.md) |
| UC-008 Activiteiten in je agenda zetten | [flow](diagrams/uc-008-agenda/flow.md) | [states](diagrams/uc-008-agenda/states.md) | [sequence](diagrams/uc-008-agenda/sequence.md) |

Volledige beschrijving met preconditions, stappen en alternative flows:
[use-cases.md](use-cases.md). Diagram-index: [diagrams/INDEX.md](diagrams/INDEX.md).

---

## Klikbaar prototype — navigatiekaart

| Vanaf | Element | Naar |
|-------|---------|------|
| welkom.html | Knop "Dienst overdragen" | ruilen-kies-vervanger.html |
| welkom.html | Knop "Afmelden" (lid heeft ruilbare rol) | afmelden-eerst-ruilen.html |
| welkom.html | Variantenblok (prototype-navigatie) | welkom-leeg · welkom-afgemeld · welkom-bob · afmelden-fout-ondergrens · ruilen-fout-afgemeld · ruilen-fout-dubbel |
| ruilen-kies-vervanger.html | Lid "Wil Coenen" / "Karin Peeters" / "Hub Simons" | ruilen-bevestigen.html |
| ruilen-bevestigen.html | Knop "Ja, dienst overdragen" | ruilen-gelukt.html |
| ruilen-gelukt.html | Knop "Ook afmelden" (secundair) | afmelden-bevestigen.html |
| ruilen-fout-afgemeld.html | Knop "Iemand anders kiezen" | ruilen-kies-vervanger.html |
| ruilen-fout-dubbel.html | Knop "Iemand anders kiezen" | ruilen-kies-vervanger.html |
| afmelden-eerst-ruilen.html | Knop "Beginnen met stap 1" | afmelden-stap1-vervanger.html |
| afmelden-stap1-vervanger.html | Lid "Wil Coenen" / "Karin Peeters" / "Hub Simons" | afmelden-stap1-bevestigen.html |
| afmelden-stap1-bevestigen.html | Knop "Ja, dienst overdragen" | afmelden-stap2-bevestigen.html |
| afmelden-stap2-bevestigen.html | Knop "Afmelden bevestigen" | afmelden-gelukt.html |
| afmelden-bevestigen.html | Knop "Afmelden bevestigen" | afmelden-gelukt.html |
| afmelden-gelukt.html | Knop "Afmelding intrekken" | afmelding-ingetrokken.html |
| welkom-afgemeld.html | Knop "Afmelding intrekken" | afmelding-ingetrokken.html |
| programma.html | Gemarkeerde regel "za 23 januari &mdash; afgemeld" | activiteit-bonte-avond-afgemeld.html |
| activiteit-bonte-avond-afgemeld.html | Knop "Afmelding intrekken" | afmelding-ingetrokken.html |
| afmelding-ingetrokken.html | Knop "Naar het programma" (secundair) | programma.html |
| welkom.html &middot; welkom-afgemeld.html &middot; activiteit-optocht.html &middot; activiteit-bonte-avond-afgemeld.html | Link "Deze activiteit beheren" (alleen bestuur) | admin-activiteit-bewerken.html |
| activiteitscherm | Klik op een plek (keuzeveld) | admin-activiteit-kiezen.html (keuzelijst open) |
| admin-activiteit-kiezen.html | Een beschikbare naam | activiteitscherm |
| admin-activiteit-bewerken.html | "Wijzigingen opslaan" in het statuspaneel | admin-wijzigingen-opslaan.html |
| admin-wijzigingen-opslaan.html | Opslaan | admin-activiteiten-opgeslagen.html |
| admin-activiteit-bewerken.html | "← Terug naar activiteiten" of "Alles ongedaan maken" met open wijzigingen | admin-wijzigingen-weggooien.html |
| admin-wijzigingen-weggooien.html | Weggooien | admin-activiteiten.html |
| admin-activiteit-onvolledig.html (en de andere conceptschermen) | "Concept verwijderen" onderaan het statuspaneel | admin-concept-verwijderen.html |
| admin-concept-verwijderen.html | "Concept verwijderen" / "Annuleren" | admin-activiteiten-verwijderd.html / admin-activiteit-onvolledig.html |
| admin-activiteit-nieuw.html &middot; admin-activiteit-onvolledig.html | Opslaan als concept | admin-activiteiten-concept.html |
| admin-activiteiten.html (en de terugkoppelvarianten) | Tegel "diensten nog in te delen" / "concept" | admin-activiteiten-diensten / -concepten |
| admin-activiteiten-diensten / -concepten | De gekozen tegel of "Alles tonen" | admin-activiteiten.html |
| admin-activiteiten.html (en de drie terugkoppelvarianten) | "Meerdere tegelijk aanmaken" (desktop: zijkaart; mobiel: onder "Activiteit aanmaken") | admin-bulk-start.html |
| admin-bulk-start.html | "Vorig seizoen kopiëren" / "Excel-bestand importeren" | admin-bulk-kopieren.html / admin-bulk-importeren.html |
| admin-bulk-kopieren.html | Knop "Controleren" | admin-bulk-controleren.html |
| admin-bulk-importeren.html | Knop "Controleren" | admin-bulk-controleren-fouten.html |
| admin-bulk-controleren.html | Knop "8 concepten aanmaken" | admin-activiteiten-bulk.html |
| admin-bulk-controleren-fouten.html | "← Terug naar importeren" (ander bestand kiezen) | admin-bulk-importeren.html |
| admin-activiteiten-bulk.html | Een concept | admin-activiteit-onvolledig.html |
| admin-fout-slot-gewijzigd.html | Terug naar de activiteit | admin-activiteit-actueel.html |
| admin-activiteit-onvolledig.html | "Eindverantwoordelijke" onder Nog nodig om te publiceren | admin-activiteit-kiezen-eindverantwoordelijke.html |
| welkom.html | Variantenblok: Twee activiteiten op één dag | welkom-twee.html |
| mijn-diensten.html | Variantenblok: Geen diensten, Raadslid met een plek in de bak | mijn-diensten-leeg.html, mijn-diensten-raadslid.html |
| admin-activiteit-bewerken.html | Naam in de kaart Bak | admin-activiteit-kiezen-bak.html |
| admin-activiteit-kiezen-bak.html | Zoekveld "Typ een naam…" | admin-activiteit-kiezen-bak-zoeken.html |
| admin-activiteit-bewerken.html | Veld Voor wie | admin-activiteit-voor-wie.html |
| admin-activiteit-nieuw.html · admin-activiteit-onvolledig.html (en de keuzelijstvarianten) | Veld Voor wie | admin-activiteit-voor-wie-concept.html |
| admin-activiteit-voor-wie-concept.html | Een groep | admin-activiteit-onvolledig.html |
| admin-activiteit-voor-wie.html | Bestuur, Raad van Elf, Dames of Overige leden | admin-wijzigingen-opslaan-groep.html |
| welkom.html | Knop Al je diensten (eigen rij in de rolbezetting) | mijn-diensten.html |
| welkom-afgemeld.html | Kaart Mijn diensten · 3 komende (zijkolom) | mijn-diensten.html |
| agenda.html | Link kopiëren (Android) | agenda-android.html |
| admin-activiteiten.html | Rij za 23 januari Bonte Avond (Op orde) | admin-activiteit-bewerken-za.html |
| mijn-diensten-raadslid.html | Tegel activiteiten, rij Bonte Avond | programma-raadslid.html, welkom-raadslid.html |
| welkom.html | Naam rechtsboven (in het prototype alleen hier) | mijn-account.html |
| welkom.html | Variantenblok "inloggen en foutschermen" | inloggen · mfa-code · niet-gevonden · fout · storing |
| inloggen.html | "Stuur mij een inloglink" | inloggen-verstuurd.html |
| inloggen.html | Variantenblok | inloggen-fout-adres · inloggen-link-ongeldig · uitgelogd |
| inloggen-verstuurd.html | Variantenblok (de mail openen) / "Nieuwe link aanvragen" | inloggen-mail.html / inloggen.html |
| inloggen-mail.html | Knop "Inloggen" in de mail | inloggen-bevestigen.html |
| inloggen-bevestigen.html | Knop "Inloggen" | welkom.html |
| inloggen-link-ongeldig.html · inloggen-fout-adres.html · uitgelogd.html | Knop met een nieuwe aanvraag | inloggen-verstuurd.html |
| mijn-account.html | "Uitloggen" / "Nieuwe telefoon of telefoon kwijt?" | uitgelogd.html / mfa-toestel-kwijt.html |
| mfa-instellen.html | "Bevestigen" | mfa-wacht-op-bevestiging.html |
| mfa-wacht-op-bevestiging.html | "Naar Start" | welkom.html |
| mfa-code.html · mfa-opnieuw.html · mfa-code-fout.html | "Verder naar beheer" | admin-activiteiten.html |
| mfa-code.html | Variantenblok | mfa-code-fout · mfa-opnieuw · mfa-instellen · mfa-wacht-op-bevestiging |
| mfa-code.html · mfa-code-fout.html · mfa-opnieuw.html | "Nieuwe telefoon of telefoon kwijt?" | mfa-toestel-kwijt.html |
| mfa-toestel-kwijt.html | Variantenblok "Stap 2" / "Terug naar de code" | mfa-instellen.html / mfa-code.html |
| welkom-raadslid.html · programma-raadslid.html · mijn-diensten-raadslid.html | Beheer in de bovenbalk (lid zonder bestuursrol) | alleen-bestuur.html |
| niet-gevonden.html · fout.html · storing.html · alleen-bestuur.html | Naar start / Probeer opnieuw | welkom.html (welkom-raadslid.html bij alleen-bestuur) |
| elk vervolgscherm | Terug-link linksboven | vorig scherm |

## Navigatiepatronen

| Patroon | Toepassing |
|---------|------------|
| **Topnav** | Drie items: Start, Programma en Beheer (alleen bestuursleden), het actieve gemarkeerd. "Mijn diensten" stond eerst in het template maar kwam in geen enkele bron voor en is toen geschrapt. Op 15-10-2026 vraagt de opdrachtgever er wel om; het wordt **geen vierde item** maar een wisselaar bovenaan het programma ("Alles" / "Mijn diensten", zelfde patroon als de filtertellers in beheer), met een kaart "Mijn diensten" op het welkomscherm (eerst een link in de kop, zie de twaalfde ronde). Het is dezelfde lijst, anders gefilterd, en zo blijft de bovenbalk kort. Zie UC-007. |
| **Terug-link** | Elk vervolgscherm heeft `← Terug` in de subnavigatie, naar het logisch voorgaande scherm. De subnavigatie bevat verder niets: een schermnaam daar herhaalt alleen de kop eronder. |
| **Eén plek per boodschap** | Waar je in een taak zit, staat op één plek: de stapbadges. Niet ook nog in de subnavigatie, de paginakop en een kaartlabel — vier formuleringen van hetzelfde maken het niet duidelijker, alleen drukker. De kop zegt wat dit scherm doet ("Overdracht bevestigen"), de badges waar dat in het geheel zit. |
| **Geen cijfers zonder onderbouwing** | Het aantal aanwezigen staat alleen op het blokkadescherm, waar het een weigering verantwoordt. Op de gewone afmeldschermen is het weggelaten: het systeem kan het getal wel afleiden (actieve leden minus afmeldingen) maar een lid krijgt de onderliggende lijst nergens te zien en kan het dus niet narekenen, en zichtbaar maken hoeveel ruimte er nog boven de ondergrens is, zet aan tot racen — terwijl "wie het eerst komt" juist een bewuste keuze van het FO is, geen wedstrijd om te promoten. |
| **De primaire knop duwt niet** | Op een afrondscherm is de primaire knop het rustige vervolg — terug naar start — en niet de volgende handeling. "Nu ook afmelden" of "Afmelding intrekken" vooraan zetten moedigt gedrag aan dat de vereniging niet wil aanmoedigen, en spreekt bovendien tegen wat het lid net koos: wie zijn dienst overdraagt heeft juist gezegd dat hij komt. |
| **Bevestiging vóór schrijfactie** | Ruilen en afmelden hebben allebei een apart bevestigingsscherm. Ruilen is onomkeerbaar, dus dat scherm benoemt dat expliciet. Een bevestigingsscherm krijgt precies twee knoppen — doen of niet doen. Een derde uitweg (de hele taak afbreken) hoort bij de vraag van een scherm eerder en staat daar ook. |
| **Foutpad met uitweg** | Elk geweigerd-scherm biedt minstens twee routes: het opnieuw proberen én terug naar het welkomscherm. Nergens een dood einde. |
| **Blokkade wijst naar een mens** | Bij de ondergrens en bij BOB/eindverantwoordelijke stopt de app bewust en toont het telefoonnummer van de eindverantwoordelijke. |
| **"Er is niets gewijzigd"** | Elk foutscherm zegt letterlijk dat de dienst of aanwezigheid onveranderd is. Voorkomt de twijfel "is het nu half gelukt?". |
| **Tweekolomsindeling** | Hoofdkolom = de inhoud, zijkolom (320px) = status, contactgegevens en uitleg bij de regel. |
| **Eén plek per actie** | Acties staan uitsluitend in de zijkolom "Jouw status", niet óók in de rolbezetting. De rolbezetting is een leeslijst (FO 7.1): wie doet wat. Dezelfde knop op twee plekken leest als twee verschillende acties. Je eigen rij is herkenbaar aan "(jij)" en de naam in vet (het label "jouw dienst" zei hetzelfde en is op 16-10-2026 vervangen). *Uitzondering:* op je eigen rij staat de knop "Al je diensten" (dertiende ronde): het is navigatie, geen actie op de dienst zelf. |
| **Eén taak, zichtbaar in stappen** | Afmelden met een dienst is technisch twee schrijfacties, maar voor het lid één voornemen. Beide stappen tonen waar je bent en na stap 1 loop je door naar stap 2 — niet terug naar het welkomscherm met een los aanbod. Zonder die aanduiding leiden "Afmelden" en "Dienst overdragen" naar hetzelfde scherm en lijken ze hetzelfde ding. Wie alleen zijn dienst kwijt wil, doorloopt dezelfde schermen zonder stapaanduiding. |
| **Regel tonen op het moment van klikken** | De ruil-verplichting staat niet permanent in de zijkolom maar verschijnt op een eigen pagina zodra je op Afmelden klikt. Deze blokkade is vooraf bekend bij de client (de app weet welke rol je hebt), dus er is geen serveraanroep nodig en je verlaat het scherm niet. De ondergrens en de BOB-blokkade blijven wél losse schermen: die komen pas terug uit de database nadat je het probeert. |
| **Alleen bezette rollen tonen** | Lege rol-slots blijven voor leden verborgen (R13). Aanwezigheid en rolbezetting zijn losse begrippen: iedereen is standaard aanwezig, maar de meeste leden hebben geen rol. Een lege plek is een adminsignaal (FO 9.2), geen uitnodiging. |
| **Geen adminbegrippen op ledenschermen** | De activiteitstatus (concept / gepubliceerd / geannuleerd) staat niet op het welkomscherm. Een lid ziet nooit een concept, dus het label zou altijd hetzelfde zijn en niets toevoegen. Status hoort op de beheerschermen. Dezelfde redenering als bij R13. |

---

**Intrekken kan overal waar de afmelding zichtbaar is.** R9 zegt dat een afmelding
mag worden ingetrokken zolang de activiteit nog niet is geweest. Dat betekent dat de
intrekactie niet alleen op het vandaag-scherm mag staan: een afmelding voor over vier
weken zie je alleen in het programma. Elke gemarkeerde regel daar opent het
activiteitdetail met dezelfde intrekknop.


**Het bestuur ziet de ledenschermen ongewijzigd.** Een bestuurslid is ook lid: op
Start en Programma staat het er als deelnemer, met dezelfde dienst, dezelfde
afmeldknop en dezelfde informatie. Twee versies van die schermen zou betekenen dat
het bestuur niet meer ziet wat de leden zien &mdash; juist na het publiceren is dat de
controle. De enige toevoeging is een link rechtsboven naar het beheerscherm van die
activiteit, zodat een bestuurslid dat iets ziet kloppen niet terug hoeft te zoeken.

Concepten blijven wél apart: die staan alleen in Beheer, ook voor het bestuur zelf.
Anders zou een bestuurslid in het programma activiteiten zien die de leden niet zien,
en niet meer weten wat er gecommuniceerd is (R15).


**Plekken aanmaken en mensen aanwijzen zijn niet gescheiden.** Eerst stond op het
formulier alleen het a&aacute;ntal plekken per rol en moest je naar een apart indeelscherm
om er mensen op te zetten. Dat maakte van &eacute;&eacute;n handeling twee schermen, terwijl het
bestuur bij het plannen meestal al weet wie het wil vragen. Nu staat elke plek als
regel onder zijn rol, met de naam erop of een knop om iemand te kiezen; "+ plek
toevoegen" maakt er een bij. Het aantal is het aantal regels.

Er is daarom ook g&eacute;&eacute;n apart indeelscherm meer. Dat toonde exact dezelfde lijst als
het activiteitscherm, en twee plekken met dezelfde gegevens lopen uit elkaar &mdash; in dit
prototype gebeurde dat ook: de aantallen verschilden tussen de twee schermen. Indelen doe
je nu op de activiteit zelf.


**Twee tellers bovenaan, geen bezettingsbalk.** De opdrachtgever vroeg (02-10) om een overzicht van wat er nog te doen is. De lijst "Vraagt aandacht" deed dat al per activiteit. Een eerste versie had drie tegels (5 vragen aandacht, 13 diensten, 1 concept) en een bezettingsbalk in elke regel, en dat was te veel: de tegel "5 vragen aandacht" herhaalde het aantal regels eronder, "1 concept" het label in de regel, en een balk bij elke regel (ook onder "Op orde") toonde acht keer dat er niets aan de hand was. Daarna bleef de balk alleen bij de Pulverkesbal staan, maar ook dat was dubbel: "Bijna te weinig (minimaal 13)", het streepje en "14 van 42" zeiden hetzelfde, en de balk schaalde op 42 leden terwijl het om 14 tegenover het minimum van 13 gaat. Wat blijft: twee tegels, "13 diensten nog in te delen" (de som van de taken in de lijst, het enige getal dat nergens anders staat) en "1 concept", die de lijst eronder filteren, en bij de Pulverkesbal één zin met beide getallen: "Bijna te weinig: 14 aanwezig, minimaal 13". De bezettingsbalk is geprobeerd en vervallen; de zin was al duidelijk. Een gekozen tegel krijgt een rand en is zelf de weg terug naar alles (plus "Alles tonen" in de kaart); een tegel op 0 is grijs. Het aantal actieve leden is weggelaten: het is geen taak.

**Het beheeroverzicht beantwoordt: waar moet ik nog iets voor regelen?** Het overzicht
was eerst een lijst op datum met een statusbadge per regel. Maar gepubliceerd of concept
is niet de vraag die een bestuurslid heeft; de vraag is waar het nog achteraan moet. De
lijst is nu gesplitst in "Vraagt aandacht" — concepten en activiteiten met lege plekken —
en "Op orde". Per regel staat één kort zinnetje op een vaste plek, en dat zinnetje is een taak: "1 werker indelen", "8 plekken indelen", "Eindtijd en eindverantwoordelijke invullen". "N plekken open" is vervangen omdat de opdrachtgever niet wist wat het telde (feedback 02-10-2026): een taak met een werkwoord zegt wat je moet doen. Een
versie met stipjes (één per plek) was compacter, maar de doelgroep — vrijwilligers die de computer
vooral voor e-mail gebruiken — leest woorden sneller dan symbolen. "Morgen" staat op de plek van
de datum, zoals in een mailprogramma; "concept" is het enige label, omdat het over de status gaat.
Achter de naam staat de verzameltijd, zoals in het ledenprogramma: op één dag kunnen meerdere activiteiten staan.
Per regel staat ook hoeveel mensen er aanwezig zijn: plekken bezet is de helft van \"op orde\", genoeg
mensen de andere helft. Zit een activiteit dicht bij het minimum, dan staat er \"14 aanwezig (minimaal 13)\"
en komt hij onder \"Vraagt aandacht\" — daarna kunnen leden zich niet meer afmelden. Het minimum staat
er alleen bij als het krap wordt. De aantallen staan onder de naam, zodat het
overzicht in de vaste lay-out met zijkolom past. Een activiteit van morgen met een open plek
staat daardoor bovenaan in plaats van tussen negen volle.


**Iemand kiezen gebeurt in de plek zelf: de naam is het veld.** Klik op een plek en de
keuzelijst klapt eronder open. Vervangen is gewoon een andere naam kiezen. "Eraf halen"
zonder vervanger staat klein onderaan, als uitzondering: het is voor de situatie uit FO 3.1,
waarin iemand niet kan en er nog niemand is. De plek komt dan open te staan en de activiteit
verschijnt onder "Vraagt aandacht" — dat is juist het signaal dat het bestuur nodig heeft.

Er staan geen getallen in de kop van een rol. Een eerdere versie had "2 bezet" naast een
teller "&minus; 3 plekken +", maar die twee getallen tellen iets anders en je moest ze met
elkaar vergelijken om te zien dat er één plek open was — terwijl de lege regel dat al laat
zien. Nu zijn de regels de telling: "+ werker-plek" onderaan voegt er een toe, en een lege
plek heeft een &times; om hem weg te halen. Een bezette plek weghalen gaat via de keuzelijst:
onder "Truus eraf halen" staan twee kaarten naast elkaar, "Plek openlaten" en "Plek weghalen",
elk met een mini-voorbeeld van die ene plek erna: open, of doorgestreept. De kaartvorm onderscheidt ze van de
namen erboven, en het voorbeeld maakt een uitlegzin overbodig. Zo gaat het in één
handeling en staat de naam erbij, zodat zichtbaar is dat iemand zijn dienst verliest (BA-2).
Eerder moest dat in drie stappen: eraf halen, dan de lege plek zoeken, dan het kruisje. De eindverantwoordelijke heeft geen
kruisje en geen plus, en bij een gepubliceerde activiteit geen "eraf halen" (R21).
Wijzigingen gaan door bij opslaan, allemaal tegelijk of geen enkele (BG 4.4); bij een gepubliceerde activiteit staat vooraf in "Wie
krijgt bericht" wie ervan hoort.

Eerder waren daar drie keuzeschermen voor plus twee foutschermen. Alleen "plek intussen
gewijzigd" blijft een apart scherm, omdat dat een echte gelijktijdigheidsfout is.

**Meerdere activiteiten aanmaken loopt langs één controlescherm.** Kopiëren en Excel-importeren zijn twee manieren om een lijst te krijgen; beide eindigen op dezelfde lijst "Controleer de activiteiten" met een regel per activiteit. De admin leert één scherm, en alles komt als concept binnen. Een regel weglaten kan met "Niet meenemen", en terughalen met "Toch meenemen" (symmetrie). Fouten staan bij de regel zelf; het paneel rechts telt ze alleen ("2 regels kloppen niet") en somt ze niet nog eens op, dat zou dubbel zijn en maakt de balk op mobiel onnodig hoog. "Concepten aanmaken" blijft dan uitgeschakeld. De ingang staat naast "Activiteit aanmaken": eenmalig invoeren blijft de snelste weg voor één activiteit. Weggaan van het controlescherm vraagt geen bevestiging: er is nog niets opgeslagen, dus er gaat niets verloren dat het systeem kent.

**Een concept kun je verwijderen, een gepubliceerde activiteit niet.** Na de interactiecheck (B6, 02-10) bleek dat een foute bulk-aanmaak of een per ongeluk aangemaakte activiteit niet te verwijderen was. Annuleren valt buiten de MVP, maar dat is de grote variant: leden en ingedeelden moeten bericht krijgen. Een concept kent niemand, dus verwijderen is klein en veilig. De link "Concept verwijderen" staat onderaan het statuspaneel, als tekstlink onder de knoppen en niet als knop: een onomkeerbare actie hoort niet naast Opslaan. Het volgt het bevestigingspatroon: een eigen pagina met de vraag als titel, één kaart, een werkwoord op de knop en Annuleren; de kaart noemt wat er verdwijnt (de ingedeelde leden). Na het verwijderen komt het overzicht met een melding in de woorden van de knop ("Jeugdmiddag is verwijderd"), en de tellers kloppen weer. Gekozen boven "Alles terugdraaien" na een bulk-aanmaak: dat werkt maar kort en is een nieuwe soort actie. Een foute bulk-aanmaak ruim je nu per concept op; is dat bij toetsing te veel werk, dan is "Alles terugdraaien" een aanvulling.

**Twee activiteiten op één dag: tijdvolgorde, eigen dienst in "Jouw status".** De opdrachtgever (02-10) noemde een echte situatie: op een zondag eerst de Jeugdmiddag (12-15u) en daarna de receptie in Panningen (15:30-21:00), met per activiteit andere werkers en drankhalers. Dat schrapten we in september uit de MVP; dat is teruggedraaid. Twee keuzes, door de bouwer: (1) een activiteit waarvan de eindtijd voorbij is, verdwijnt van "Vandaag" (R16), zodat het scherm gericht blijft op wat nog komt en er toch niets meer aan te doen valt; (2) de activiteiten blijven op tijd, en wat jij bij elke activiteit doet staat in "Jouw status" met de bijpassende knoppen. Zo blijft de volgorde van de dag en staan alle acties op één plek. Afgewezen: de activiteit met jouw dienst bovenaan (de volgorde wisselt van de dag zelf) en de activiteit zonder dienst opgeklapt (extra tik, en leden zien niet standaard alles).

**Geen breadcrumbs.** Besloten op 02-10-2026. Breadcrumbs laten zien waar een pagina in een diepe boom hangt; deze app is ondiep (drie tabs in de bovenbalk, daaronder korte taken) en de bovenbalk, de kop en de regel "← Terug naar …" zeggen al waar je bent en waarheen je gaat. Een pad zou dat herhalen (dubbele informatie), past niet op 375px en zegt bij een taak met stappen niet hoeveel er nog komt. Als de oriëntatie in de bulkflow (UC-006) bij toetsing een probleem blijkt, is het bestaande patroon van de stap-aanduiding bij afmelden in twee stappen ("Stap 2 van 3") het eerste wat te proberen is.

**Het type activiteit is geen veld in het formulier.** Het bepaalde alleen of het minimum
aantal aanwezigen standaard aan of uit staat, maar stond tussen de afmeldinstellingen zonder
dat je dat zag, met een zin eronder om het uit te leggen. Oud papier maakt het systeem zelf
aan (BG 8.1), dus wat een bestuurslid met de hand aanmaakt is altijd een seizoensactiviteit.
Het minimum heet nu "Minimaal aanwezig" en toont de standaard in het veld ("13 (standaard)").
Alleen de zin "Zonder afmeld-deadline geldt dit minimum niet" blijft, omdat je anders een getal
invult dat nooit wordt afgedwongen (BA-5).

**Opslaan en publiceren staan samen in één vast paneel rechts.** Eerder stond "Opslaan"
onder het formulier en "Publiceren" in de zijkolom, elk met een eigen uitleg; ze leken twee
losse handelingen, en het was niet duidelijk of Publiceren je laatste wijzigingen meenam. Nu
staan status en knoppen samen in een paneel dat blijft staan als je scrolt: "Publiceren" en
"Opslaan als concept" naast elkaar maken zichtbaar dat je kiest tussen klaar en nog niet klaar.
Publiceren slaat altijd eerst op. Wat nog ontbreekt staat onder de uitgeschakelde knop, met de
velden klikbaar. Bij een gepubliceerde activiteit toont het paneel vóór de knop "Wie krijgt
bericht" — dat is de bevestiging. Op een telefoon wordt dit paneel een balk onderaan die
blijft staan (zie hieronder).

**Alle schermen werken ook op een telefoon.** Een lid kijkt op de telefoon wanneer hij moet
verzamelen of ruilt even snel een dienst. Een bestuurslid deelt meestal in achter een laptop,
maar wil ook onderweg een plek kunnen vullen of zien wat er aandacht vraagt. Eerst hadden
alleen de ledenschermen een mobiele weergave. Een beheerscherm bleef dan 1000px breed en
viel op een telefoon half buiten beeld, met het statuspaneel en de knoppen helemaal rechts.

- *Dezelfde schermen, geen aparte versie.* Onder 700px vallen de kolommen onder elkaar.
  Met aparte mobiele bestanden zou elke wijziging twee keer moeten, en lopen namen en
  getallen uit elkaar.
- *Volgorde: eerst wat er is, dan wat jij doet.* Onder elkaar zou "Jouw status" met de knop
  Afmelden onder acht regels rolbezetting belanden. Daarom komt het eerste blok van de
  zijkolom direct na het eerste blok van de hoofdkolom: eerst de activiteit, dan je status,
  dan de rest. Bij overdragen komt "Dienst die je overdraagt" boven de lijst met namen. Het
  seizoensblok van het programma gaat helemaal naar onderaan (`.wf-mobiel-onderaan`); het
  staat anders tussen de kop en de lijst.
- *Dezelfde bovenbalk, compacter.* Start, Programma en Beheer passen op 375px. Het merk en
  de naam vallen weg; de avatar blijft. Geen tabbalk onderaan: dat zou een tweede
  navigatiepatroon zijn naast dat van desktop.
- *Knoppen over de volle breedte*, in dezelfde volgorde als op desktop. Een groot doel voor de
  duim, en de knop met het werkwoord blijft bovenaan.
- *Rol boven de naam.* In de rolbezetting staat de rol als kleine kop boven de naam, en in het
  programma en het beheeroverzicht de datum boven de activiteit. Naast elkaar blijft er voor
  de naam te weinig ruimte over.
- *Het statuspaneel wordt een balk onderaan.* Status, wat er nog ontbreekt en de knoppen
  blijven onderaan in beeld terwijl je door het formulier scrolt. Zo blijft de afspraak van
  desktop gelden: de reden staat vóór de knop, en onder het formulier staan geen knoppen.
  Bij een concept dat nog niet compleet is, neemt de balk ruim een derde van het scherm in.
  Voor de visuele fase: "Nog nodig om te publiceren" inklapbaar maken.
- *Velden naast elkaar lopen door naar een volgende regel* (datum en tijden), minimaal 130px per veld.
- *Beheeroverzicht:* "Activiteit aanmaken" staat op desktop in een kaart in de zijkolom en op mobiel als twee knoppen naast elkaar direct onder de kop (`.wf-knoppenrij`; de zijkaart is `.wf-niet-op-mobiel`). Naast elkaar past op 360 en 375px alleen met het korte label "Meerdere aanmaken" (met "Meerdere tegelijk aanmaken" breekt de knop af) en bespaart zo'n 90px. Daardoor stonden knoppen en tellers in hetzelfde raster van twee kolommen en las je ze als twee paren (de linkerknop met de linkertegel); daarom zijn de tellers op mobiel kleine afgeronde filterlabels die links uitgelijnd staan en hun eigen breedte houden. Op desktop blijven het tegels, want de knoppen staan dan ver weg in de zijkaart. Op mobiel viel de zijkaart helemaal onderaan (de opdrachtgever, 02-10-2026). Een knop in de kop zelf maakte die kop hoger dan op alle andere schermen, vandaar een knop eronder.

**Activiteitgegevens als kaartje, niet als tabel (08-10-2026).** De tabel met zes rijen (Wanneer, Verzameltijd, Starttijd, Eindtijd, Locatie, Busvertrek) gaf elke regel hetzelfde gewicht en mengde tijden en plaats. Een lid wil vooral weten *wanneer moet ik er zijn* en *waar*. Het kaartje (`.wf-kaartje`) lijkt op een toegangskaartje en groepeert wat bij elkaar hoort: **wanneer** bovenaan, **waar** onderaan. Wanneer is één tijdlijn in volgorde van de avond: **Verzamelen** (groot, het eerste wat je moet doen), **Bus vertrekt** (met de vertrekplaats eronder, want tijd en plaats van de bus horen bij elkaar), **[naam] begint** en **[naam] is afgelopen**. Waar is het afgescheurde stuk eronder, met een kaartpictogram en de locatie. Zo is er één leesrichting (van boven naar beneden, van eerder naar later) en één plek per soort gegeven. Het ging in drie rondes (de bouwer, 08-10-2026): eerst stond het afscheurstuk met verzamelen rechts (te veel op één plek, de bus in drie regels), daarna alles links met vijf dingen van gelijk gewicht ("te veel, er moet betere hiërarchie in"), nu gegroepeerd en visueler. Keuzes: (1) alleen wat is ingevuld wordt getoond: oud papier heeft geen start en geen bus, dan verdwijnen die stops (op `activiteit-optocht` staat daarom een korte zin onder het kaartje over wat nog niet is ingevuld); (2) op mobiel wordt de tijdlijn verticaal; (3) op `welkom-twee` staat per activiteit een kaartje met daaronder een eigen kaart "Rolbezetting", zoals op `welkom`. Gekozen uit vier alternatieven (tijdlijn, tegels, groepen, kaartje) en vier creatievere (kaartje, vlaggetjes, programmabalk, scheurkalender). **Nog te toetsen** met de opdrachtgever en een paar leden: begrijpen ze de tijdlijn, en is het kaartpictogram genoeg om de locatie te herkennen? De bevestigingsschermen van afmelden (andere gegevens: dienst, deadline) en de beheerschermen (formulier) zijn bewust niet veranderd.

## Taal en toon: de woorden van de vereniging

De app is van een carnavalsvereniging, en dat mag je horen. Maar niet overal. De regel:
**namen en sfeer in de taal van de vereniging, handelingen en meldingen in gewoon Nederlands.**
Een knop, een rol of een foutmelding moet iedereen in één keer begrijpen, ook een lid dat
geen Limburgs leest. De vereniging schrijft zelf ook niet eenduidig ("Bonte Avond" en
"Bonkte Aovende", "Boerenbruiloft" en "Boorrebroelof"), en dialect in een knop leest trager.

Onderzocht op 25-09-2026. Bronnen: de site van de vereniging (beringsekuus.nl: homepage,
Kontakt, Historie en berichten uit 2017, 2018 en 2022), Omroep Peel en Maas, en
Wikipedia over carnaval in Nederlands-Limburg. Facebook was niet leesbaar. "Alaaf" stond niet op de site, maar
De opdrachtgever gebruikt het in een eigen ontwerp voor het welkomscherm; de opdrachtgever gaat voor.

**Wat nu in het prototype staat**

| Waar | Tekst | Waarom |
|---|---|---|
| Kop van het programma | "Vastelaovend 2026/2027" (het tabblad heet al Programma) | Zo noemt de vereniging carnaval zelf, zonder de "-dj" van Midden-Limburg |
| Zijkaart "Dit seizoen" op het programma (alleen desktop) | Het motto "Merge kumt later" als kop, de foto van prins en adjudant, hun namen eronder als bijschrift. Geen label. Op een telefoon weg (`.wf-niet-op-mobiel`): sfeer, geen taak | Het gezicht van het seizoen, dat elk jaar verandert. Het motto staat op de site van de vereniging; de namen Prins Bram I en Adjudant Koen zijn verzonnen tot de opdrachtgever de echte geeft. Seizoensdata en de oud-papierregel zijn eruit: die staan al in de lijst. In de echte app komt dit uit de seizoensinstellingen |
| Kop van het welkomscherm | "Alaaf, Mark" (sinds 16-10-2026 zonder link in de kop, zie de twaalfde ronde) | Zo begroet het ontwerp van de opdrachtgever (opdrachtgever, 25-09-2026) de gebruiker. "Morgen" of "Vandaag" staat als label boven de naam op het activiteitkaartje (zie "Activiteitgegevens als kaartje"), niet als losse regel onder de titel (die stond daar met vet-in-grijs en een streep eronder onrustig). De link in de kop staat daar, niet in een eigen balk: zo staan er twee balken boven de inhoud, net als op elk ander scherm. "Deze activiteit beheren →" (bestuur) staat sinds 15-10-2026 als tekstlink onderaan de statuskaart: hij hoort bij de activiteit en bij de rol van het bestuur, niet bij de begroeting, en een kop heeft maar één link |
| Lege staat welkomscherm | "Zodra er weer iets op het programma staat, zie je het hier. Merge kumt later." | Een knipoog op de enige plek waar niets te doen is; vervangt ook de systeemtaal "Conceptactiviteiten" (interactiecheck, bril 5) |
| Namen en tijden van activiteiten | "Prins Onthulling — 20:11", "Aftreden prins — 22:11", "H. Mis opening seizoen" | Zoals ze in het programma van de vereniging staan; de elf is het gekkengetal |

**Bewust niet gebruikt**

| Woord | Waarom niet |
|---|---|
| Dialect in knoppen en menu's ("Neijs", "Laes miër") | De vereniging doet dat op haar site, maar in een app met handelingen kost het leestijd, en de spelling is niet vast |
| "Zaot/zaat" (dronken) | Niet bevestigd, en het past niet in een app met een BOB-rol |
| "Vastelaovendj", "zaate hermeniekes" | Andere regio (Midden- en Zuid-Limburg) |

**Mogelijk later, na overleg met de opdrachtgever**

- "Kuuskes" als aanspreekvorm in de dag-melding of de mail ("Hoi Kuuske, morgen Bonte Avond"). De
  vereniging spreekt leden zo aan, maar dat is een toon die het bestuur moet willen.
- De residentie "Kuuzetempel De Wieksjlaag, Kanaalstraat 94" als locatie. Het prototype gebruikt nu
  een verzonnen "Gemeenschapshuis De Kuus, Kerkstraat 12"; welke activiteit waar is, weet de opdrachtgever.

**Wat het onderzoek opleverde over de voorbeelddata (na te vragen bij de opdrachtgever)**

- Het **Pulverkesbal** is volgens de site het kinderbal op vastelaovesdinsdag. In het prototype staat
  het op maandag 8 februari; in 2027 is vastelaovesdinsdag 9 februari.
- In het echte programma staan ook de **Boerenbruiloft (Boorrebroelof)**, het **Verlovingsbal** en de
  **Aafsloeting**. Die ontbreken in het prototype.
- De **vorst** is een vaste figuur die jaren blijft, en niet de prins. Dat bevestigt de keuze om de
  blokkadetekst naar de eindverantwoordelijke te laten verwijzen: die is per activiteit bekend.
- Wat **"Kuus"** betekent, legt de site niet uit.

## Consistentieregels

Getoetst op 25-09-2026 over alle schermen (`tools/inventaris.py` zet per scherm de knoppen,
terug-links en zijkaarten op een rij). Houd deze regels aan bij elk nieuw scherm.

| Handeling | Zo werkt het overal |
|---|---|
| **Iemand kiezen** | Eén zoekveld met daaronder alleen wie je kunt kiezen. Wie niet beschikbaar is, staat er niet; zoek je op die naam, dan verschijnt hij grijs en niet klikbaar, met de reden. Geldt voor leden (vervanger) en bestuur (plek vullen). |
| **Foutscherm** | Alleen voor wat de lijst niet kon voorzien: iets veranderde terwijl je koos. Titel zegt wat er aan de hand is, kaart "Er is niets gewijzigd", knoppen "Iemand anders kiezen" + "Terug naar …". Geen uitlegkaart "waarom deze regel". Bij het bestuur alleen "Terug naar de activiteit": de plek is al gevuld, dus eerst zie je de actuele stand; wie toch iemand anders wil, klikt daar op de naam. |
| **Fout buiten het lid om** | Pagina niet gevonden, algemene fout en storing: titel zegt wat er aan de hand is, de zin "Dat ligt niet aan jou" (bij een fout of storing), één uitweg naar Start. Een storing stuurt nooit naar Inloggen. |
| **Wanneer bevestigen** | Bevestig als het anderen raakt of niet terug te draaien is (dienst overdragen, publiceren, opslaan met berichten). Niet als alleen jij het merkt en je het zo weer ongedaan maakt (afmelding intrekken, opslaan als concept). |
| **Bevestigen** | Altijd een eigen pagina, nooit een venster eroverheen. Titel is de vraag ("Dienst overdragen aan Wil Coenen?"), één kaart met wat er gebeurt, eventueel één waarschuwing, dan de hoofdknop met het werkwoord en "Annuleren". |
| **Terugkoppeling** | Na elke handeling zie je dat het gelukt is. Leden krijgen een gelukt-scherm met de volgende stap; het bestuur een melding bovenaan het overzicht, in dezelfde woorden als de knop (gepubliceerd, opgeslagen als concept, wijzigingen opgeslagen). |
| **Weggaan met open wijzigingen** | Eerst een bevestigingspagina "N wijzigingen weggooien?" met welke wijzigingen het zijn; Weggooien · Annuleren. Geldt voor terug, de bovenbalk en "Alles ongedaan maken". |
| **Woorden** | *Dienst* is wat jij doet bij een activiteit ("Jouw dienst: drankhaler"); *rol* is het soort taak (werker, drankhaler …); *plek* is één regel in de rolbezetting. *Minimaal aanwezig* heet overal zo, ook op het blokkadescherm, en het aantal heet "N aanwezig" (niet "komen"). Het welkomscherm begroet met "Alaaf, [voornaam]"; in de tabel van de activiteit staat als eerste rij "Wanneer": Vandaag, Morgen of de datum. Namen en sfeer in de taal van de vereniging (Vastelaovend, het motto, de eigen activiteitnamen en tijden op x:11); handelingen en meldingen in gewoon Nederlands. Zie "Taal en toon". |
| **Lay-out** | Twee vormen, niet meer. Bekijken, bewerken en overzichten: hoofdkolom met zijkolom (acties en status rechts). Bevestigen en resultaat: één smalle kolom. Past iets niet, dan wordt de inhoud compacter, niet de lay-out anders. |
| **Terug** | Elk vervolgscherm heeft linksboven "← Terug naar …" met de naam van waar je heen gaat. |
| **Kop** | Elk scherm: bovenbalk, dan een kop met de titel. Een extra balk alleen voor "← Terug naar …". Een losse link naast de titel kan rechts in de kop staan, maar liever niet: in de visuele fase ligt daar het confettipatroon en een link leest er niet (zie de twaalfde ronde). |
| **Verplicht** | Een * bij het veld of de rol, met één uitleg bovenaan het formulier. |

**Bewust verschillend:** een lid bevestigt elke handeling apart, want het doet er één en die
is niet terug te draaien. Het bestuur wijzigt meerdere plekken en slaat alles in één keer op
via het statuspaneel. En een lid kiest een vervanger op een eigen pagina, omdat daar context bij
hoort (je spreekt het buiten de app af, en je ziet welke dienst je overdraagt); het bestuur kiest
in de plek zelf.

**Tijdens het bewerken toont het paneel alleen status en opslaan; de details komen bij het
bevestigen.** Eerder stond in het paneel per wijziging wat er veranderde, wie er bericht kreeg,
"toch melden" en "ongedaan maken" — terwijl je nog aan het werk was. Dat was te veel om steeds
naast je te hebben. Nu staat er "3 wijzigingen nog niet opgeslagen" met "Wijzigingen opslaan";
welk veld veranderde zie je aan de stip bij het veld. Pas als je opslaat, toont een
bevestigingsstap per wijziging wie bericht krijgt. Dat volgt de consistentieregel voor
bevestigen, net als publiceren.

## Dekkingsmatrix — testgevallen uit bouwgids hoofdstuk 12

Per testgeval: waar de regel wordt afgedwongen, welk foutpad het lid ziet, en of
er een wireframe voor bestaat.

| # | Testgeval (BG 12) | Afgedwongen in | Foutcode | Scherm | Gedekt |
|---|-------------------|----------------|----------|--------|--------|
| 1 | Niet verwijderen zonder vervanger | `meld_af()` controle 3 (R2, R7) | `heeft_ruilbare_rol` | `afmelden-eerst-ruilen.html` → tweestapsroute | ✅ |
| 2 | BOB/eindverantwoordelijke niet zelf ruilen | `ruil_dienst()` controle 2 en `meld_af()` controle 4 (R4) | `rol_niet_ruilbaar`, `heeft_adminrol` | `welkom-bob.html` (geen knop; de servercontrole blijft) | ✅ |
| 3 | Geen dubbelboeking | `ruil_dienst()` controle 6 + unieke constraint + gedeelde lock (R6) | `dubbelboeking` | `ruilen-fout-dubbel.html` | ✅ |
| 4 | Vervanger niet al afgemeld | `ruil_dienst()` controle 5 + `beschikbare_vervangers()` (R5) | `vervanger_afgemeld` | `ruilen-fout-afgemeld.html` | ✅ |
| 5 | Afmelden geblokkeerd onder de ondergrens | `meld_af()` controle 5, achter de lock (R8) | `onder_ondergrens` | `afmelden-fout-ondergrens.html` | ✅ |
| 6 | Annulering bereikt iedereen | — | — | — | ❌ **niet gedekt** |

**Testgeval 6 heeft geen pad.** Activiteit annuleren is een adminfunctie en valt
buiten de MVP-pilot (FO 5, bouwgids fase 5). Er is dus geen flow, geen scherm en
geen melding voor. De flows houden er wel rekening mee dat de status kan bestaan:
`ruil_dienst()` en `meld_af()` weigeren met `activiteit_niet_open` als de
activiteit geannuleerd is, en het welkomscherm filtert hem weg. Wie er wanneer een
annuleringsmelding krijgt, is nog niet ontworpen.

### Aanvullende controles die niet in bouwgids 12 staan

Uit de onafhankelijke review kwamen vier weigeringen die de bouwgids niet als
testgeval noemt maar die wel getest moeten worden:

| Controle | Foutcode | Regel | Scherm |
|----------|----------|-------|--------|
| Vervanger is geen actief verenigingslid | `vervanger_ongeldig` | R14 | nog geen wireframe |
| Activiteit geannuleerd of gepasseerd | `activiteit_niet_open` | R15 | nog geen wireframe |
| Al afgemeld (dubbelklik, tweede tabblad) | `al_afgemeld` | — | nog geen wireframe |
| Intrekken zonder bestaande afmelding | `niet_afgemeld` | — | nog geen wireframe |

En twee gelijktijdigheidsgevallen die alleen met twee sessies tegelijk te testen zijn:

| Geval | Verwacht gedrag |
|-------|-----------------|
| Twee leden melden zich tegelijk af bij 14 aanwezigen, ondergrens 13 | De tweede wordt geweigerd met `onder_ondergrens`; eindstand 13, niet 12 |
| Lid X wordt vervanger terwijl X zich afmeldt | Wie tweede is wordt geweigerd; X is nooit tegelijk bezetter én afgemeld |

Alle regels worden in de **database** afgedwongen, niet in het scherm — binnen één
transactie en achter een gedeelde rij-lock op `activiteiten`. De wireframes tonen
de foutmelding; de weigering zelf komt uit `ruil_dienst()`, `meld_af()`,
`trek_afmelding_in()` en `activiteit_opslaan()` — zie de sequence-diagrammen.

Voor de beheerkant komt er één geval bij: twee bestuursleden werken tegelijk aan
dezelfde activiteit. Wie als tweede opslaat en een plek raakt die de ander net heeft
gewijzigd, krijgt `slot_gewijzigd`, en dan gaat **niets** van zijn opslag door, ook
niet de wijzigingen op andere plekken (BG 4.4).

---

## Openstaande punten

### Besloten op 18-09-2026

**De blokkadetekst verwijst naar de eindverantwoordelijke, niet naar de vorst.**
De app toont het nummer van de eindverantwoordelijke (FO 7.1), dus verwijzen naar
iemand anders levert een instructie op die je niet kunt opvolgen. De nieuwe tekst is:

> "Meld je bij de eindverantwoordelijke, afmelden gaat nu niet i.v.m. laag aantal aanwezigen."

⚠️ **Dit wijkt af van de letterlijke tekst in FO 4.1 en bouwgids 5.2.** Die zeggen
"meld je bij de vorst". Het FO moet hierop worden bijgewerkt, anders staat er in de
app iets anders dan in het document waar de bouwer op vaart.

**De reden bij een niet-beschikbare vervanger blijft zichtbaar** ("heeft zich
afgemeld", "staat al ingedeeld als werker"). Dit is geen privacyprobleem: dat iemand
al een rol heeft, staat toch al in de rolbezetting.

### Besloten waar de bronnen niets zeggen (18-09-2026)

Vijf punten waarop het FO en de bouwgids geen antwoord gaven, zijn ingevuld. Ze
staan met onderbouwing in [use-cases.md](use-cases.md) onder "Besloten punten".

| Onderwerp | Besluit |
|-----------|---------|
| Geen afmeld-deadline ingesteld | Fase 1 permanent: vrij afmelden, de ondergrens blokkeert nooit |
| Het deadline-moment zelf | Telt als vóór: vrij zolang `nu <= afmeld_deadline` |
| Wanneer een activiteit "geweest" is | `datum + eindtijd`, plus een dag als de eindtijd vóór de starttijd ligt (R16) |
| Opslag afmeldtoelichting | Kolom `toelichting` op `afmeldingen` |
| Externe helper als vervanger | Niet toegestaan in de MVP (R17) |

### Nog door te voeren in de bronnen

| Wat | Bouwgids | FO |
|-----|----------|----|
| Blokkadetekst verwijst naar de eindverantwoordelijke | ✅ V4 (5.2) | ✅ V4 (4.1) |
| Kolom `toelichting` op `afmeldingen` | ✅ V4 (3.4) | ✅ V4 (4.2) |
| Kolom `naam` op `activiteiten` | ✅ V5 (3.2) | ⏳ nog niet |
| Beheerkant: indelen, publicatievoorwaarden (R21), gelijktijdig indelen, meldingen per wijziging | ✅ V5 (4.4, 5.5, 7.1, 8.3) | ⏳ nog niet |
| Beslispunt BA-6: vaste rollijst of tabel met vlaggen | ✅ V5 als open punt (3.3) | ⏳ nog niet |
| Opslaan in één transactie: alles of niets, `verwachte_bezetter` per plek, publiceren in dezelfde stap | ✅ V6 (3.3, 4.4, 5.5) | ⏳ nog niet |
| Databasefunctie `activiteiten_bulk_aanmaken` (UC-006): één transactie, drie controles | ⏳ nog niet | ⏳ nog niet |
| Databasefunctie `concept_verwijderen` (UC-004 AF-10): alleen admin, alleen een concept, geen meldingen | ⏳ nog niet | ⏳ nog niet |

Het FO staat nog op V4. De bouwgids is wat de bouwer volgt en is daarom eerst bijgewerkt;
het FO moet dezelfde punten krijgen zodat beide documenten hetzelfde zeggen.

### Ontwerpgaten uit de bouw (fase 0, 28-10-2026; gedicht 29-10-2026)

De bouw van fase 0 had schermen nodig die niet in de wireframes of use cases staan. De code gebruikt nu zelf
bedachte teksten; bouwgids 14.3 zegt dat teksten uit het ontwerp komen. Vóór de schermen van fase 1 hier
ontwerpen, daarna neemt de code de tekst over (review F0-15 en F0-18, `Afname-fase-0.md` in de repository).

| Gat | Nu in de code | Ontworpen op 29-10-2026 |
|-----|---------------|-------------------------|
| Inloggen: e-mailadres invullen, "link verstuurd", fout adres, verlopen of gebruikte link, uitgelogd | `/inloggen` met vier meldingen | **Gedicht:** `inloggen`, `inloggen-fout-adres`, `inloggen-verstuurd`, `inloggen-link-ongeldig`, `uitgelogd` |
| Bevestigen: de pagina achter de link in de mail, met de knop "Inloggen" (tegen linkscanners) | `/auth/bevestigen` | **Gedicht:** `inloggen-bevestigen` |
| De inlogmail zelf (onderwerp en tekst) | Mailsjabloon in Supabase | **Voorstel:** `inloggen-mail` (geen scherm; de tekst voor het sjabloon) |
| "Mijn account": wie is ingelogd, uitloggen | `/mijn` (tijdelijk; vervalt waarschijnlijk in Start of Mijn diensten) | **Gedicht:** `mijn-account`, nog steeds tijdelijk |
| Pagina niet gevonden (404) en een foutpagina | De Engelse standaard van Next.js | **Gedicht:** `niet-gevonden`, `fout` |
| Storing: Supabase antwoordt niet | Het lid belandt op `/inloggen`, alsof het is uitgelogd | **Gedicht:** `storing` (geen doorverwijzing naar Inloggen) |
| MFA voor het bestuur (stap D van fase 1) en een lid zonder bestuursrol bij een beheerpagina | Nog niet gebouwd | **Ontworpen:** `mfa-instellen`, `mfa-wacht-op-bevestiging`, `mfa-code`, `mfa-code-fout`, `mfa-opnieuw`, `mfa-toestel-kwijt`, `alleen-bestuur` |

Het scherm voor de beheerder die een collega helpt is niet ontworpen (zie hieronder).

**Wat hier is besloten (29-10-2026, eerste versie, de bouwer beoordeelt)**

- *Inloggen verklapt niets.* "Als dit e-mailadres bij ons bekend is, hebben we een link gestuurd" staat voor een bekend en een onbekend adres. Het adres staat niet in de link en wordt niet herhaald (zou het in de URL zetten). Prijs: wie zijn adres verkeerd typt, merkt het pas als er niets komt; daarom staat er op het scherm "Het bestuur kan kijken welk adres bij jou staat".
- *Uitgelogd is het inlogscherm met een melding*, geen apart scherm met een dode eind: wie uitlogt wil meestal niets meer, en wie wil inloggen heeft het formulier meteen. Dezelfde afspraak als bij het bestuur na opslaan: de melding in de woorden van de knop.
- *Bovenbalk zonder items* voor wie niet is ingelogd, en bij een storing: het platform weet dan niet wie je bent en of Beheer erbij hoort.
- *Beheer en MFA.* Een bestuurslid stelt eenmalig een authenticator-app in; daarna bevestigt een andere beheerder de toegang (`mfa-wacht-op-bevestiging`). Elke beheersessie vraagt een code, geen "onthoud mij", na 12 uur opnieuw. Ledenschermen werken zonder code. Een foute code houdt je op het scherm, zonder tellers die dreigen.
- *Geen zelfbediening bij een kwijte telefoon.* Als jij dat zelf kon regelen met alleen je mailbox, kon iemand met jouw mailbox dat ook. Daarom: een andere beheerder koppelt de oude app los, jij stelt een nieuwe in, die beheerder bevestigt. In de tussentijd kun je gewoon als lid inloggen. Zonder technische woorden.
- *404 voor een verborgen activiteit.* Een lid dat een activiteit opent die voor zijn groep verborgen is, ziet hetzelfde scherm als bij een bestaande pagina die niet bestaat (R22, `Bouwbesluiten` 4.3): anders verraadt het scherm dat de activiteit er is.
- *Fout.* "Er ging iets mis aan onze kant" waarschuwt om eerst te controleren of je laatste handeling is gelukt (afmelden, overdragen), omdat het platform niet weet of die is doorgegaan. Het foutnummer is voor het bestuur om door te geven.

**Nog open uit deze ronde**

- De beheerder die een collega helpt (oude app loskoppelen, toegang bevestigen) heeft nog geen scherm. Het kan geen ledenbeheer worden (buiten scope); denk aan een korte lijst "Wacht op bevestiging" in Beheer met per persoon één bevestigingspagina. Zonder scherm kan het alleen via de database. Pilotcheck: er zijn minstens twee beheerders, anders is er geen herstelroute (`Bouwbesluiten` 5.2).
- Wat gebeurt er met niet-opgeslagen wijzigingen als de toegang tot beheer na 12 uur verloopt tijdens het bewerken van een activiteit? Voorstel: de code opnieuw vragen vóór Opslaan lukt, en de wijzigingen op het scherm laten staan. Nog niet ontworpen.
- De geldigheid van de inloglink (een uur) en de tekst van de mail zijn een voorstel; de mail komt via een sjabloon in Supabase.
- De opdrachtgever moet bevestigen hoe de andere beheerders heten of dat het platform ze mag noemen ("Wie kan je helpen?"). In de eerste versie staan geen namen.

### Open vraag uit de ontwerpronde

**Activiteiten in bulk aanmaken: ontworpen, nog te bevestigen (de opdrachtgever, 02-10-2026).** De opdrachtgever vroeg om gemak bij de start van een seizoen: "vorig jaar kopiëren" en Excel-importeren. Beide staan nu in het prototype (UC-006). Vier ontwerpkeuzes, door de bouwer gemaakt en na te vragen bij de opdrachtgever:
- *Kopiëren zonder mensen.* Naam, tijden, locatie, notitie en plekken gaan mee; niemand is ingedeeld, want leden hebben niet voor het nieuwe seizoen toegezegd. Alles komt als concept binnen, dus er gaan geen meldingen uit.
- *Eén activiteit met bekende datum, de rest schuift mee.* Je kiest een activiteit en geeft zijn nieuwe datum; alle andere schuiven evenveel op. Voorbeeld: de Optocht zo 7 februari 2027 wordt zo 27 februari 2028, dus Bonte Avond vr 22 januari 2027 wordt vr 11 februari 2028 (55 weken, de weekdagen kloppen). Dat past bij alles wat met carnaval, en dus Pasen, meebeweegt. **Niet bij activiteiten op een vaste datum**: De opdrachtgever bevestigde dat 11-11 altijd 11-11 is, en met het verschuiven zou die op 1 december 2027 uitkomen. Daarom kent het systeem 11-11 zelf en laat die activiteit op 11 november staan, met op het controlescherm "Vaste datum: elk jaar 11 november" in plaats van "Vorig seizoen: …" (interactiecheck B7, 02-10). De activiteit met bekende datum is daarom geen "eerste activiteit" (dat zou 11-11 zijn). Op het controlescherm staat bij elke regel de datum van vorig seizoen, zodat een verkeerde datum opvalt, en elke datum is aan te passen. Andere vaste datums dan 11-11 kent het systeem nog niet; die moet de admin zelf opmerken. Een aangepaste datum krijgt de stip voor "gewijzigd".
- *Eigen Excel-sjabloon* met vaste kolommen, in plaats van eigen van de opdrachtgever sheet. Voorspelbaar, en de opdrachtgever zet zijn sheet maar één keer over (de overstap), dus de drempel is eenmalig.
- *Eén gedeeld controlescherm* voor kopiëren en importeren. Wat misgaat, gaat mis op de lijst; pas bij "N concepten aanmaken" staat er iets in de database.
- *Het controlescherm blijft klein: alleen de datum aanpasbaar en regels weglaten.* Naam, tijd, locatie en plekken pas je aan op het gewone activiteitscherm, na het aanmaken: de concepten zijn gewone activiteiten en leden zien ze niet. Het controlescherm toetst alleen wat het systeem zelf uitrekent, de datum. Een bewerkscherm voor naam en tijd zou een tweede versie van het activiteitscherm worden, wat de bouwgids afraadt. Bekende zwakte: wel weglaten, niet toevoegen (asymmetrisch), en een tijd die voor alle activiteiten verandert moet acht keer apart. Gekozen voor de pilot (02-10); zie de vraag aan de opdrachtgever hieronder.

*Onderzocht op 02-10:* in het FO (V4), de bouwgids (V7) en op het web staat geen seizoenskalender van De Beringse Kuus, dus er is niets af te lezen over vaste datums. Zeker is alleen 11-11 (de opdrachtgever). Waarschijnlijk, maar niet bevestigd, valt de prinsonthulling ook op 11-11 (de avond), zoals bij veel verenigingen. Alles rond de carnavalsdagen (Bonte Avond, Jeugdmiddag, Optocht, Pulverkesbal, Aftreden prins, Opruimen) hangt aan Pasen. Het gaat dus waarschijnlijk om één of twee activiteiten, en dat pleit voor handmatig corrigeren in de pilot. Het FO 8.2 (Excel-import) gaat over *leden*, niet over activiteiten; de import van activiteiten in UC-006 is dus nieuw.

Vragen voor de opdrachtgever: welke activiteiten vallen, naast 11-11, op een vaste datum, en moet het systeem dat onthouden (een vlag "vaste datum" per activiteit, zodat het controlescherm ze niet meer verkeerd voorstelt)? Hoe ziet zijn Excel-sheet er nu uit? Wil hij een waarschuwing als een activiteit met dezelfde naam en datum al bestaat (nu niet ontworpen)? **Hoeveel verandert er per jaar aan naam en tijd van de activiteiten?** Is het bijna alles, dan moeten naam en tijd op het controlescherm aanpasbaar worden (klikken op de naam of tijd, zoals bij de datum), en misschien een regel toevoegen. Zijn het één of twee, dan is bewerken na het aanmaken genoeg.

**Oud papier dat het systeem zelf aanmaakt (FO 6, 9.1).** Het FO zegt dat het systeem de oud-papierdagen automatisch aanmaakt en dat het bestuur de mensen indeelt. Niet geregeld: komen die activiteiten binnen als **concept** (bestuur deelt in en publiceert zelf) of **direct gepubliceerd** (leden zien ze meteen, lege plekken vult het bestuur later aan)? Het eerste past bij hoe de rest werkt; het tweede zorgt dat leden het hele seizoen vooraf zien. Voorleggen aan de opdrachtgever.




**Roltypen: vaste lijst of beheerbaar?** FO 2.2 noemt vijf rollen (werker, drankhaler,
fotograaf, BOB, eindverantwoordelijke). Het aantal plekken per rol is per activiteit
instelbaar, de namen niet. Zodra het bestuur er een wil bijmaken &mdash; kaartverkoop,
EHBO, opbouwploeg &mdash; is daar met een vaste lijst een ontwikkelaar voor nodig.
Zie beslispunt BA-6 in [use-cases.md](use-cases.md).

### Punten voor de visuele ontwerpfase

- **Het kaartje in de visuele fase.** In de wireframe is het afscheurstuk grijs. In het ontwerp: geel (`thema/kop`), met de verzameltijd groot. Let op dat het welkomscherm dan twee gele vlakken heeft (kopvlak en afscheurstuk); beoordeel in Figma of dat te veel is, anders wordt het afscheurstuk wit met een gekleurde rand. Prototypes en varianten: `docs/design/activiteit-gegevens-*.html`.

- **De kaart "Dit seizoen" is de feestelijke kaart.** In de wireframe is hij net zo grijs als de rest. In het visuele ontwerp: de foto van prins en adjudant groot, de kleuren van de vereniging of de Kuuze-vlag, het motto als blikvanger in een eigen letter, en een ander gewicht dan de gewone informatiekaarten. Foto, namen en motto stelt het bestuur per seizoen in; de opdrachtgever levert de foto van dit seizoen aan.

- **Klikbaarheid moet zichtbaar zijn in het ontwerp.** In het programma opent een gemarkeerde regel de activiteit waarvoor je bent afgemeld, met de intrekactie erin. In de wireframes stond dat als uitleg in de zijkolom; die is eruit. Het ontwerp moet het zelf tonen &mdash; een chevron, een hoverstaat, een cursor &mdash; in plaats van het in een tekstje te vertellen.

1. **Waarschuwing bij intrekken.** `afmelding-ingetrokken.html` benadrukt dat een
   overgedragen dienst niet terugkomt. Controleren of die formulering klopt met
   hoe het bestuur dit wil uitleggen.
2. **Lege staat na het seizoen.** `welkom-leeg.html` toont nu een neutrale tekst.
   In het laagseizoen (eind november – 10 januari, bouwgids 13.2) staat dit scherm
   zeven weken lang. Misschien verdient dat een andere tekst dan "niets gepland".
3. **Niet-ontworpen states (UI Stack).** Getoetst aan de UI Stack van Scott Hurff
   (ideal / empty / error / partial / loading) ontbreken er vier: een laadtoestand,
   een lege zoekstaat in de vervangerslijst, een technische fout (netwerk of server,
   los van de regel-fouten), en een activiteit zonder bus of zonder notitie. De
   state-diagrammen kennen `Laden` en `Netwerkfout` al, maar er is geen wireframe
   voor. Daar komen nu de vier weigeringen uit de dekkingsmatrix bij die ook nog
   geen scherm hebben.
4. **Foutmelding bij race conditions.** Een gelijktijdige ruil landt op hetzelfde
   scherm als een gewone dubbelboeking. Functioneel klopt dat; taalkundig dekt
   "staat al ingedeeld" het geval niet helemaal. Alternatieve tekst overwegen.

## update van de opdrachtgever van 15-10-2026

De opdrachtgever had een vergadering met het bestuur. Er kwamen vier wensen uit. Wat is ontworpen, waarom, en wat nog bij de opdrachtgever ligt:

| Wens | Wat er nu in het prototype zit | Onderbouwing |
|------|-------------------------------|--------------|
| **Mijn diensten** ("in één oogopslag wanneer ik welke diensten heb") | `mijn-diensten.html`, bereikbaar via de wisselaar boven het programma. Komende diensten, afgemeld, geweest. | Alleen plekken waar je op staat, want iedereen is standaard aanwezig (R1): anders is het overzicht gelijk aan het programma. Wisselaar in plaats van topnav-item: dezelfde lijst, anders gefilterd. UC-007. |
| **Alles met één klik in de agenda** | `agenda.html` en `agenda-gelukt.html`, vanuit het programma en Mijn diensten. | Een agenda-abonnement is het enige dat wijzigingen vanzelf laat meekomen. tweede van de opdrachtgever idee (melding "klik om te verwerken") kan niet: een webapp kan niet in de agenda van de telefoon schrijven. iPhone: één tik. Android: via de website van Google Agenda, dus een korte uitleg. Vertraging van een uur tot een dag is een eigenschap van agenda-apps, daarom gaan wijzigingen op de dag zelf ook als bericht. UC-008, BA-9. |
| **Gebruikersgroepen** (Bestuur, Raad van Elf, Dames, Overige leden) | Veld *Voor wie* (standaard *Iedereen*) op `admin-activiteit-nieuw` en `admin-activiteit-bewerken`. | Een groep bepaalt wat je **ziet**, niet wat je **mag**: Bestuur is geen beheerrecht. Wie er niet in zit ziet de activiteit niet (RLS). Dit raakt de basis (zichtbaarheid, aanwezig, minimum, meldingen, agenda) en is daarom het zwaarst. BA-7, R22. |
| **Bakschema Bonte Avond** (14 mensen in de bak) | Kaart *Bak* op `admin-activiteit-bewerken` (Bonte Avond), onder Rolbezetting: prins en adjudant, vorst, Raad van Elf, vooraf gevuld, per naam te vervangen. | De Raad van Elf is altijd dezelfde elf (de opdrachtgever), dus vooraf vullen uit de groep Raad van Elf is minder werk dan 14 keer kiezen. Alleen de admin wijzigt (R23). BA-8. |

**Tweede ronde (15-10-2026, dezelfde dag).** De eerste stand is bewaard als `docs/versies/prototype-2026-10-15`. Daarna erbij:

- *Een voorbeeld van een groepsactiviteit:* de Bestuursvergadering (ma 25 januari, "Alleen bestuur") staat in het programma en in het beheeroverzicht ("9 aanwezig · alleen bestuur": bij een groepsactiviteit telt aanwezig alleen de groep, R22). Daarmee zijn ook de getallen in het kopiëren (9 activiteiten) en in "9 concepten aangemaakt" bijgewerkt.
- *Voor wie gaat mee bij het aanmaken van meerdere:* een zin bij vorig seizoen kopiëren, de regel in de controle ("alleen bestuur") en een extra kolom `voor_wie` in het Excel-sjabloon (leeg is iedereen).
- *De bak:* een vervanging telt als vierde niet-opgeslagen wijziging (Jan Weijers → Karin Peeters), ook in "Wijzigingen opslaan" (wie bericht krijgt: beiden) en "Weggooien". Een eigen keuzelijst (`admin-activiteit-kiezen-bak`, met `admin-activiteit-kiezen-bak-zoeken` voor het zoeken). Voor de tweede avond een eigen scherm (`admin-activiteit-bewerken-za`, 30 aanwezig, Mark afgemeld) met "Bak overnemen van vr 22 januari". *Eerlijk over de keuzelijst:* de Raad van Elf zit altijd al volledig in de bak, dus er valt binnen de groep niets te kiezen; een vervanger is per definitie iemand buiten de groep. Daarom geen filter op Raad van Elf en geen hint op elke rij (die zei overal hetzelfde, de bouwer 15-10): de lijst toont namen; alleen als je zoekt op een raadslid staat hij er grijs in met het label "Raad van Elf" en "al in de bak". Bij BOB en eindverantwoordelijke blijft het zoals het was: alleen de uitzondering krijgt een hint.
- *Mijn diensten:* een lege staat (`mijn-diensten-leeg`) en een raadslid met de bak erin (`mijn-diensten-raadslid`, ingelogd als Ton Gubbels), bereikbaar via een variantenblok zoals op het welkomscherm.

**Derde ronde (zelfde dag): wat de mail aan de opdrachtgever zegt, zichtbaar gemaakt.** Vier dingen uit de concept-mail waren in het prototype niet te zien:

- *Afmelden haalt de activiteit uit je agenda:* een korte zin op `agenda-gelukt`.
- *Wie niet in de groep zit, ziet de activiteit niet:* `programma-raadslid`, het programma zoals Ton Gubbels (Raad van Elf, geen bestuur) het ziet: "8 activiteiten" in plaats van 9, geen Bestuursvergadering. Zo staat de tegel ook in `mijn-diensten-raadslid` op 8.
- *Een lid kan zijn plek in de bak niet zelf afmelden:* `welkom-raadslid` toont "Je zit in de bak" met het nummer van de eindverantwoordelijke en geen knop Afmelden (interactiecheck B4; eerst was er een knop die altijd naar een blokkade leidde). De rolbezetting toont de bak niet: een lid ziet alleen zijn eigen plek.
- *De groepen van de opdrachtgever:* *Voor wie* is nu een keuzelijst met Iedereen, Bestuur, Raad van Elf, Dames en Overige leden (`admin-activiteit-voor-wie`). *Niet* gemaakt: het zetten van leden in groepen (een lid in meer groepen). Dat is ledenbeheer, buiten de MVP; het wordt één keer bij de start gevuld en komt alleen in de mail aan de opdrachtgever terug.

**Zesde ronde: interactiecheck B1 en B2** (`interactie-check-2026-10-15.md`, 15-10-2026).

- *B1, de agenda zegt niet meer "gekoppeld" voordat het zo is:* `agenda-gelukt` heet nu "Bevestig op je telefoon" (iPhone), de Android-knop leidt naar `agenda-android` ("Link gekopieerd"), en pas `agenda-gekoppeld` zegt "Je agenda is gekoppeld" met "Voor het laatst bijgewerkt: vandaag 14:05". Dat tijdstip weet het systeem (het ziet de aanvraag van de agenda-app). Het scherm is in het prototype bereikbaar via het variantenblok onderaan `agenda`.
- *B2, een wijziging van Voor wie toont wat ze doet:* de keuzelijst toont per groep hoeveel leden ("Bestuur 9 leden") met een waarschuwing dat een gepubliceerde activiteit voor wie buiten de groep valt verdwijnt. Kies je een groep, dan toont `admin-wijzigingen-opslaan-groep` het gevolg: "Voor wie: Iedereen → Bestuur, 33 leden die de activiteit niet meer zien", met de waarschuwing dat ze hem ook in programma, Mijn diensten en agenda niet meer zien. Het opslaan loopt in het prototype direct van keuzelijst naar dit scherm; in het product staat de keuze eerst op het bewerkscherm als niet-opgeslagen wijziging, naast de andere.

**Zevende ronde: interactiecheck B3, B4 en B5** (15-10-2026).

- *B3, Mijn diensten is één klik van het beginscherm:* elk welkomscherm heeft een kaart "Mijn diensten · N komende" (eerst een link "Al je diensten →" in de kop; verplaatst op 16-10-2026, twaalfde ronde). De tegels bovenaan het programma tonen de naam vet en het aantal eronder (**Alles** 9 activiteiten, **Mijn diensten** 3 komende), zoals de tegels op de agenda-pagina. Zo lezen ze als navigatie en niet als statistiek. *Tekst aangescherpt 16-10-2026:* **Alle activiteiten** 9 komende en **Mijn diensten** 3 komende (leeg: "nog geen diensten"). "Alles" zei niet waarvan en stond naast een eigen term (*dienst*); dezelfde regel "N komende" op beide tegels laat zien dat de 3 een deel van de 9 is. Dezelfde woorden staan op de agenda-pagina (daar twee keuzes in plaats van twee filters).
- *B4, geen knop die alleen kan weigeren:* de statuskaart van het raadslid noemt wat hij wel kan: "Kun je niet komen? Bel Ger Hermans, 06 12 34 56 78." Het scherm `afmelden-fout-bak` is vervallen (er was geen weg meer naartoe). Bij BOB is dezelfde aanpak gevolgd (`welkom-bob`, ingelogd als Wim Coumans) en het scherm `afmelden-fout-adminrol` is vervallen. De eindverantwoordelijke volgt hetzelfde patroon met het bestuur als contact; daarvoor is geen eigen scherm gemaakt.
- *B5, één woord per begrip:* in het scherm heet de groep **Raad van Elf**; RV11 is afkorting van de opdrachtgever en staat alleen in de mail. "Overige leden" (de opdrachtgever), "extern" (de keuzelijst bij het indelen) en "gastwerker" zijn nog drie woorden voor mogelijk hetzelfde; dat hangt af van antwoord van de opdrachtgever op vraag 1 (hebben gastwerkers een eigen inlog?). In Mijn diensten staat de bak met het label "bak"; "dienst" betekent daar "waar je die avond moet zijn", terwijl *plek* de regel in de rolbezetting blijft.

**Achtste ronde: één link in de kop** (15-10-2026, de bouwer: "2 link-knoppen in een header?"). De kop volgt de afspraak "titel links, eventueel één link rechts". "Al je diensten →" blijft in de kop (persoonlijk, voor iedereen); "Deze activiteit beheren →" is verplaatst naar de statuskaart op `welkom` en `welkom-afgemeld`, onder de knoppen (activiteit en rol, alleen voor het bestuur). Op `activiteit-optocht` en `activiteit-bonte-avond-afgemeld` staat hij nog rechts in de balk naast "← Terug naar …". De link staat in de markup die `bouw.py` uit de visuele versie haalt (besluit 08-10-2026).

**Negende ronde: de bovenbalk heet Start** (15-10-2026, de bouwer: "het is wel raar dat als je op vandaag klikt je ziet wat er morgen op de planning staat"). Het scherm toont de activiteit van vandaag en anders de eerstvolgende (UC-001); op donderdag 21 januari staat er dus "Morgen, vrijdag 22 januari" onder het label "Vandaag". Het label beloofde meer dan het scherm waarmaakt (conceptueel model: wat de naam zegt tegenover wat je ziet). Overwogen: "Eerstvolgende" (beviel niet), "Welkom" (woord van de opdrachtgever, geen woord dat zegt wat je ziet) en "Straks"; gekozen is "Start": neutraal en het klopt op elke dag. De knoppen "Terug naar vandaag" heten nu "Terug naar start". Het kaartje zegt nog steeds Vandaag, Morgen of de datum.

**Elfde ronde: de labels van het kaartje en de busvertrekplaats** (15-10-2026, de bouwer: "start van wat, einde van wat, verzamelen, bus?"). De punten van de tijdlijn waren losse woorden zonder werkwoord of onderwerp. Nu: **Verzamelen**, **Bus vertrekt**, **Bonte Avond begint** en **Bonte Avond is afgelopen**. De naam van de activiteit staat daarmee twee keer op het kaartje (ook in de titel): dubbele informatie, maar het beantwoordt "van wat". Een korter alternatief ("Begint", "Afgelopen") loste dat niet op. *Voorbeelddata:* een bus naar een Bonte Avond in het eigen gemeenschapshuis oogt vreemd; de bouwer zegt dat de bus bij zulke activiteiten gewoon voorkomt, dus hij blijft staan.

**Twaalfde ronde: "Al je diensten" is een kaart, geen link in de kop** (16-10-2026, de bouwer: "hij voelt daar niet logisch"). De link stond rechts in de kop (interactiecheck B3: "naast de kop", zoals "Deze activiteit beheren"). Twee redenen om hem te verplaatsen. (1) *Visueel:* rechts in het kopvlak is het confettipatroon het drukst (links leeg, rechts dicht, zodat de titel schoon blijft); witte tekst met een streep verdween erin en ook een witte pil eromheen bleef daar een vreemde plek. (2) *Inhoud:* de kop is de begroeting; "al je diensten" gaat over jou en hoort bij de statuskaart ("Jouw status"). Nu: een kaart **Mijn diensten · 3 komende ›** in de zijkolom, direct onder de statuskaart (raadslid: 2 komende). Het getal laat zien waarom je klikt en is hetzelfde getal als op de tegel in het programma (B3: een tegel is anders statistiek). Op mobiel staat de kaart direct na het kaartje van de activiteit (`.wf-mobiel-boven`, nieuw in het template en alle schermen), niet onderaan de pagina, anders vindt niemand hem. De lege staat (`welkom-leeg`) heeft de kaart onder de melding; het BOB-scherm heeft hem niet (BOB heeft in het prototype geen eigen Mijn diensten). Hier is het script `tools/ronde12_diensten_kaart.py` (+ `ronde12b_mobiel_boven.py`). De kop heeft daarna nergens meer een link, dus de afspraak "één link in de kop" uit de achtste ronde is vervallen. *Niet getoetst met de opdrachtgever of leden.* Het alternatief (een vierde item in de bovenbalk) is bewust niet gekozen: zie Topnav.

**Zestiende ronde: leden zien de bak** (16-10-2026, de bouwer: "bij de Bonte Avond kun je niet zien wie er in de bak zit"). De bak stond alleen op het beheerscherm; een lid zag de rolbezetting (werkers, drankhalers, BOB) maar niet wie er in de bak zit, terwijl de Bonte Avond voor iedereen zichtbaar is. Nu staat onder Rolbezetting een kaart **Bak** (alleen lezen): prins en adjudant, vorst en de elf van de Raad van Elf, dezelfde veertien als in beheer en in de opgeslagen stand (Jan Weijers; de vervanging door Karin Peeters is op het beheerscherm nog niet opgeslagen). Op `welkom`, `welkom-afgemeld`, `welkom-bob`, `welkom-raadslid` (Ton Gubbels staat erin, als "(jij)") en op de tweede avond (`activiteit-bonte-avond-afgemeld`, zelfde bak). Wijzigen blijft alleen voor de admin (R23). Script: `tools/ronde16_bak_zichtbaar.py`. *Aanname, niet getoetst met de opdrachtgever:* dat alle leden de bak mogen zien. Dit raakt zijn vraag 5 niet (of een raadslid de bak ook in Mijn diensten en zijn agenda wil).

**Zeventiende ronde: de groepen overal waar je een activiteit aanmaakt** (16-10-2026, de bouwer: "de groepen zijn niet overal goed uitgewerkt op alle schermen waar je een activiteit kan aanmaken"). Gevonden en opgelost (`tools/ronde17_groepen_overal.py`): (1) op `admin-activiteit-nieuw` was *Voor wie* een veld zonder link, je kon de lijst niet openen; (2) het formulier van het concept (`admin-activiteit-onvolledig` en de drie schermen met een open keuzelijst bij een plek) had het veld helemaal niet; (3) de keuzelijst bestond alleen voor een gepubliceerde activiteit, met de waarschuwing dat leden het niet meer zien en bericht krijgen. Voor een concept is er nu een eigen scherm, `admin-activiteit-voor-wie-concept` (zelfde lijst, geen waarschuwing, want leden zien een concept toch niet); (4) `admin-bulk-importeren` noemde de groep "RV11", terwijl het scherm overal Raad van Elf zegt (B5); (5) in `admin-bulk-controleren-fouten` gaf een Excel-regel met een groep die niet bestaat geen fout; nu een derde fout, "Groep onbekend" (3 regels kloppen niet). *Nog niet uitgewerkt:* de groep per regel aanpassen op het controlescherm van meerdere activiteiten (nu alleen de datum), en of de keuzelijst bij een rol voor een groepsactiviteit alleen leden van die groep toont (de bak doet dat wel). Beide aan de opdrachtgever of aan de bouwgids V8.

**Achttiende ronde: reactie van de opdrachtgever op het visuele prototype** (16-10-2026, drie punten, `tools/ronde18_opdrachtgever_16okt.py`):
1. *Agenda op Android* ("kan dit niet makkelijker dan een link en een computer?"). De Google Agenda-app kan een abonnement niet toevoegen, de website wel. De Android-kaart krijgt een knop **Zet in je agenda** (zelfde vervolgscherm als op de iPhone): die opent in de praktijk Google Agenda op de website met de vraag of de agenda mag worden toegevoegd (link `calendar.google.com/calendar/render?cid=webcal://…`, niet officieel gedocumenteerd, *nog te testen op een echte Android*). Het kopiëren van de link blijft als terugval onder "Lukt het niet?". Google ververst een abonnement bovendien traag (tot een dag), dus de bevestiging "Bevestig op je telefoon" belooft niet dat het direct klopt.
2. *Voor wie: meerdere groepen* ("kan ik daar ook Bestuur en RV11 selecteren?", en "als ik op bestuur klik doet hij niets"). R22 is aangepast: een activiteit heeft één of meer groepen. De keuzelijst heeft aankruisvakjes en een knop Klaar; "Iedereen" sluit de rest uit. In de visuele versie werkt het nu echt (de keuze staat daarna in het veld, en in "Wijzigingen opslaan" met het aantal leden dat de activiteit niet meer ziet; het aantal is een som en houdt geen rekening met leden die in twee groepen zitten). Dat "klikken niets deed" kwam doordat de keuzelijst bij een concept ontbrak of een klik niets zichtbaars veranderde (zie zeventiende ronde).
3. *De bak per activiteit* ("hoeft alleen bij de Bonte Avond en één andere activiteit"). Een aan/uit-schakelaar rechts in de kop van de kaart Bak (eerst een vakje met "Bak bijhouden bij deze activiteit", dat was onoverzichtelijk; `tools/ronde18b_bak_schakelaar.py`); uit = alleen de kop met één uitleg, aan = de bak eronder. De Bonte Avond heeft hem aan; bij de Jeugdmiddag staat hij uit. De opdrachtgever zag de bak bij elke activiteit omdat in het prototype elke rij van het beheeroverzicht naar hetzelfde scherm (de Bonte Avond) gaat; dat blijft een beperking van het prototype. *Open:* welke andere activiteit krijgt een bak? (De opdrachtgever noemde "jeugd van …bal".) *Alleen visueel:* het schakelen en aankruisen werkt in de visuele versie; de wireframes zijn statisch en tonen de beginstand.

**Dertiende ronde: "Al je diensten" als knop op je eigen rij** (16-10-2026, de bouwer: "dit lijkt me de meest logische plek"). Het label "jouw dienst" in de rolbezetting zei hetzelfde als "Mark Hendriks (jij)" (dubbele informatie). Op de plek waar je net je eigen dienst leest is een knop naar al je diensten het meest voor de hand liggend; het label is daarom vervangen door een kleine knop **Al je diensten** (`welkom`, `welkom-twee`). *Afweging:* "Eén plek per actie" zegt dat de rolbezetting een leeslijst is zonder acties; dit is navigatie, geen actie op de dienst zelf, en de regel is daarop aangepast. *Gevolg (veertiende ronde, 16-10-2026, de bouwer: "dan kan dit weg"):* de kaart "Mijn diensten" in de zijkolom is op `welkom` en `welkom-twee` vervallen, want daar is de knop de ingang. Op `welkom-afgemeld`, `welkom-raadslid` en `welkom-leeg` heeft het lid geen eigen dienstrij om de knop op te zetten, dus daar blijft de kaart de enige ingang (script `tools/ronde14_kaart_weg.py`). *Open:* (1) wie op een dag geen eigen dienstrij heeft maar wel diensten (een dag zonder dienst, bijvoorbeeld de Jeugdmiddag in `welkom-twee` voor de tweede activiteit) heeft de knop bij de andere activiteit; op een dag met alleen een activiteit zonder dienst is er geen ingang behalve het programma. (2) `welkom-bob` houdt het label "jouw dienst": BOB heeft in het prototype geen eigen Mijn diensten, dus er is niets om naartoe te gaan. Script: `tools/ronde13_knop_eigen_rij.py`. Niet getoetst met de opdrachtgever of leden.
*Busvertrekplaats:* de bus vertrekt volgens de bouwer bijna altijd vanaf dezelfde plek. De plaats is daarom een vaste instelling van de vereniging ("Parkeerplaats Sporthal") en de beheerder vult per activiteit alleen de tijd in; in het formulier staat eronder "Vertrekt vanaf Parkeerplaats Sporthal · andere plek". Het lid ziet de plaats nog steeds onder "Bus vertrekt". Bij meerdere verenigingen is dit een instelling per vereniging. Er is in de MVP geen scherm voor de instelling (zoals bij de groepen: eenmalig bij de start) en "andere plek" is nog geen uitgewerkt veld. *Open:* waar verzamelen leden als er een bus is, bij de bus of bij de locatie? "Verzamelen" heeft daarom nog geen plaats eronder (vraag 6 aan de opdrachtgever).

**Wat nog niet is uitgewerkt**

- Een scherm om leden in groepen te zetten: eenmalig bij de start (ledenbeheer is buiten scope).
- De keuzelijst bij het indelen van gewone plekken filtert niet op groep; alleen de bak heeft een eigen keuzelijst.
- Een bevestiging voor "Nieuwe link maken". "Bak overnemen" heeft geen eigen bevestiging: het vult de plekken op het scherm en gaat pas bij Opslaan door.
- Een gebruiker die in geen enkele groep zit: wat ziet die? (Alleen de activiteiten voor iedereen.)

**Vragen aan de opdrachtgever** (de rest is voorlopig zelf besloten, zie BA-7 t/m BA-9; de opdrachtgever kan erop terugkomen)

1. Hebben gastwerkers (Overige leden) een eigen inlog, of zijn het externe helpers zonder account?
2. Wat staat er in het huidige bakschema: alleen wie erin zit, of ook waar (op of langs het podium) en wanneer? Kan hij het schema sturen (foto of Excel)?
3. Zijn prins, adjudant en vorst leden in het systeem, en zitten ze in een groep?
4. Hebben de meeste leden een iPhone of een Android? Dat bepaalt hoeveel moeite de Android-uitleg bij het koppelen van de agenda waard is.
5. Wil een raadslid de bak terugzien in zijn overzicht Mijn diensten en in zijn agenda? Nu staat de bak erin met het label "bak", niet als dienst; zegt de opdrachtgever nee, dan vervalt dat.
6. Waar verzamelen leden als er een bus is: bij de bus of bij de locatie van de activiteit? En vertrekt de bus bijna altijd vanaf dezelfde plek (dan is die plek een vaste instelling)?

Meenemen als voorstel (hij reageert alleen als het anders moet): Mijn diensten toont alleen diensten (niet "aanwezig zonder dienst"); in de agenda staat standaard alles, met een schakelaar voor alleen diensten; een afmelding haalt de activiteit uit de agenda; wie niet in een groep zit ziet de activiteit niet.

## Na de pilot: meerdere verenigingen

*Besloten 02-10-2026: niet in de MVP, wel vastgelegd.* Het product moet uiteindelijk door meerdere verenigingen te gebruiken zijn. Een nieuwe vereniging heeft vaak al een startpunt (een Excel-planning), dus importeren is dan de eerste stap en een lage drempel bepaalt of een vereniging overstapt. Wat dat voor het ontwerp betekent, zodat het later niet opnieuw bedacht hoeft te worden:

| Onderdeel | Pilot (Beringse Kuus) | Later, meerdere verenigingen |
|-----------|-----------------------|------------------------------|
| Startscherm "Meerdere tegelijk aanmaken" | Twee opties: vorig seizoen kopiëren, Excel importeren | Naam beter laten aansluiten op woorden van de opdrachtgever, bijvoorbeeld "Nieuw seizoen klaarzetten". Per optie zeggen wanneer je hem kiest. Kopiëren eerst voor wie een vorig seizoen heeft |
| Eerste keer, nog geen vorig seizoen | Niet ontworpen | "Vorig seizoen kopiëren" staat uitgegrijsd met "Nog geen vorig seizoen"; Excel is dan de route. Als scherm uitwerken zodra er een tweede vereniging is |
| Excel-import | Vast sjabloon met vaste kolommen | **Kolommen koppelen**: de vereniging uploadt haar eigen bestand en wijst aan welke kolom datum, naam enzovoort is. Komt als stap tussen "bestand kiezen" en "controleren"; het controlescherm hoeft niet te veranderen |
| Plekken per rol in de import | Niet in het sjabloon | Hangt samen met beslispunt BA-6: met meerdere verenigingen met eigen rollen is een beheerbare rollijst waarschijnlijker dan een vaste lijst |
| Woorden in de schermen | Carnaval ("Vastelaovend", "Elfde van de elfde") | Verenigingsspecifieke woorden uit een instelling halen in plaats van in de schermen zetten |
| Uitstraling | Wordt in de visuele fase ontworpen als algemeen carnaval met een thema per vereniging (primaire kleur, logo, naam, motto, groet); Beringse is het eerste voorbeeldthema | Instelbaar per vereniging; het ontwerp rekent daar nu al mee (kleuren als variabelen, logo en woorden als invulplekken) |
| Gegevens | Eén vereniging | Alles gescheiden per vereniging in de database (toegangsregels per vereniging, RLS); geen gedeelde ledenlijsten of activiteiten |

**antwoord van de opdrachtgever (02-10): het Excel-formaat is gewoon de velden die elke activiteit heeft, en het importeren zelf vindt hij iets voor later: hij voert het seizoen dadelijk met de hand in.** Het sjabloon klopt dus, en de import hoort niet bij de pilot (zie `docs/bouw/Bouwgids-V8-voorbereiding.md`, hoofdstuk 3). Daarvóór was het uitgangspunt van de bouwer: De opdrachtgever werkt nu in Excel, en importeren is **eenmalig**: de overstap. Daarna beheert hij alles in de app, en volgende seizoenen gaan via "vorig seizoen kopiëren". Dat is ook waarom het vaste sjabloon voor de pilot volstaat: hij zet zijn sheet één keer over. Voor een nieuwe vereniging is import wél de eerste stap en de drempel, vandaar kolommen koppelen. Nog door de opdrachtgever te bevestigen: dat hij na de overstap niet terug naar Excel wil voor een volgende planning.

## Vervolg

Deze uitwerking is input voor de visuele ontwerpfase. Daarna is de logische
volgende stap fase 3 uit de bouwgids: `ruil_dienst()`, `meld_af()` en
`trek_afmelding_in()` bouwen mét row level security, en het resultaat laten
reviewen in een schone chat tegen hoofdstuk 4, 5 en 7 van de bouwgids
(bouwgids 11.3).
