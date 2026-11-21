# Wie is aan de beurt? (UC-012, FO 9.2, bouwgids 8.2)

De opdrachtgever vroeg om een fijn overzicht voor de beheerders: wie is er dit seizoen nog niet aan de beurt geweest, zodat het
bestuur die kan invullen. Het systeem telt en laat zien; het bestuur beslist (FO 9.2). Geen "eerlijke verdeling" die iets
automatisch indeelt, en geen weging naar zwaarte: alleen aantallen.

## Wat een beheerder ziet

Er is geen eigen lijst met tellers. Het staat op de plek waar de keuze wordt gemaakt:

- **Snelkeuze onder de eerste lege plek van een rol.** Eén compacte regel in het vlak van het veld: een bliksem, de voornamen van
  wie nog geen dienst heeft als pillen met een plus (maximaal vijf), en "Alle ›" rechts. Een tik zet die persoon op de plek. De
  keuzelijst werkt gewoon door; het is een hulp, geen regel. Dezelfde voornaam twee keer in de rij: dan "Jan P.", en is ook die
  letter gelijk de hele naam (`kortNaam` in `src/lib/naam.ts`). Geen snelkeuze bij een rol zonder lege plek en nooit bij de
  eindverantwoordelijke (een vaste, benoemde persoon).
- **Keuzelijst:** wie dit seizoen nog geen dienst heeft staat bovenaan in een eigen groep, **Nog niet aan de beurt**; de rest staat
  daaronder op alfabet, met "— 1 dienst dit seizoen" bij wie er één heeft.
- **Raster `/beheer/verdeling`:** alle leden als hetzelfde bolletje met initialen als bij "Wie komt er?" (UC-010), met het aantal
  diensten als klein getal. Gestippeld is nog geen dienst, licht groen één of twee, donker groen drie of meer; de minste eerst.
  De naam met het aantal staat bij hover, focus en tikken en voor een schermlezer. De link "Alle ›" in de snelkeuze opent het
  raster in een nieuw tabblad, zodat wat op het formulier nog niet is opgeslagen niet kwijtraakt.

## Wat er telt

Elke bezette plek van een lid bij een concept of gepubliceerde activiteit van het seizoen, oud papier erbij. Niet: de bak (geen
dienst, R23), een geannuleerde activiteit (BG 5.4), een externe helper (staat er niet in, BG 9), een beheeraccount. Het seizoen
is het huidige (`public.huidig_seizoen`, begin 1 september). `?seizoen=2025` toont een ander seizoen, maar staat niet in het
scherm.

## Hoe het is gebouwd

- `src/lib/verdeling.ts`: zuivere logica (`telDiensten`, `maakVerdeling`, `trapVan`, `dienstenTekst`), met tests.
- `src/app/beheer/verdeling/gegevens.ts`: leest leden en plekken via de rechten van de database; `leesKandidaten` (formulier)
  gebruikt dezelfde telling, zodat keuzelijst, snelkeuze en raster hetzelfde getal laten zien. Geen nieuwe migratie.
- `src/components/verdelingsraster/`: het raster. `src/app/beheer/activiteiten/plekken.tsx`: groep in de keuzelijst en
  `Snelkeuze`. De keuzelijst is nu een gecontroleerd veld, zodat een tik op een pil hem bijwerkt.
- Het bliksemicoon is Phosphor `lightning` (MIT, dezelfde commit als de rest), in `scripts/maak-iconen.ts`.

## Wat nog open staat

- **Ingang zonder lege plek:** het raster is alleen bereikbaar via de snelkeuze (of de link). Zijn alle plekken gevuld, dan staat er
  geen snelkeuze en dus geen link. Een vaste ingang op het beheeroverzicht is bewust niet gebouwd (ontwerp: geen dubbele
  elementen); beslis met de beheerders of dat nodig is.
- Bij meer dan ongeveer honderd leden wordt het raster onrustig; dan past een filter op aantal.
- De snelkeuze staat op elk scherm dat de Rolbezetting toont (nieuw, bewerken, reeks); bij Excel-import en kopiëren van een seizoen
  worden plekken niet ingevuld, dus daar is geen snelkeuze.
