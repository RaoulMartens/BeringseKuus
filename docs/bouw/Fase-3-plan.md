# Fase 3: plan

Stand 04-11-2026, **voorstel van de bouwer, nog niet vastgesteld**. De planning is een schatting. Bron: `Afname-fase-2.md` punt 7 ("In fase 3"),
`Fase-2-plan.md`, `Datamodel-fase-3.md` en bouwgids V8 hoofdstuk 4, 5 en 10.

**Doel (V8 10, fase 3):** leden melden zich af, trekken een afmelding in en dragen hun dienst over; ze zien hun eigen diensten.
Resultaat: pilot B (3 januari 2027) kan met afmelden en ruilen draaien. Pilot A (14 tot 22 november) draait zonder; dit werk
hoeft er niet voor klaar te zijn en mag de pilotvoorwaarden niet ophouden.

## 1. Wat erin zit en wat niet

**In fase 3**

- De databasefuncties `meld_af`, `trek_afmelding_in`, `ruil_dienst`, `beschikbare_vervangers` en de view `mijn_diensten`
  (`Datamodel-fase-3.md`), met pgTAP en de gelijktijdigheidstests.
- Ledenschermen: Afmelden (met de blokkade onder de ondergrens), Afmelden met een dienst als één taak van twee stappen (Stappenbalk), Dienst
  overdragen (vervanger kiezen met de redenen, bevestigen), Afmelding intrekken, en **Mijn diensten** met de lege staat.
- De componenten die erbij horen: Stappenbalk en Schakelaar (`Afname-fase-2.md`, regel Componenten).
- Een wachtstand op de knoppen met een gevolg (F2-05), zodat dubbel klikken geen tweede afmelding of overdracht maakt.
- De tekst op Start die belooft dat iedereen op aanwezig staat (F2-14) klopt dan weer.

**Niet in fase 3:** berichten (O-1, `Bouwbesluiten` 5.3), de bak, de agenda-koppeling (fase 7), ledenbeheer en import (fase 4),
het overzicht van openstaande ruilverzoeken (buiten de MVP).

## 2. Beslissingen

De bouwer neemt ze hieronder; ze staan open voor de ontwerper en de review.

| # | Vraag | Voorstel | Reden |
|---|---|---|---|
| 3.1 tot 3.7 | Zie `Datamodel-fase-3.md` punt 7 | Daar | Het datamodel is stap A |
| 3.8 | Wachtstand per knop of op het hele formulier? | Per formulier: de verzendknop is uitgeschakeld en toont een korte "bezig"-staat zolang de serveractie loopt; de actie zelf is ook veilig bij dubbelklikken (`al_afgemeld`) | De server is de echte bescherming; de wachtstand is voor het gevoel van de lid |
| 3.9 | Welke teksten bij de fouten? | Die uit de wireframes (`afmelden-fout-ondergrens`, `ruilen-fout-afgemeld`, `ruilen-fout-dubbel`) en een korte standaardtekst voor `geen_bezetter`, `activiteit_niet_open` en `geen_lid` | De rest heeft geen ontwerp; de ontwerper beoordeelt de eerste versie (zoals in fase 2) |
| 3.10 | Hoe tonen we de eindverantwoordelijke bij de blokkade? | Met `contact_eindverantwoordelijke` (R10), zoals Start | Eén route voor dat nummer |

## 3. Stappen

Elke stap is een eigen pull request met de hele poort groen. Migraties, rechten en inloggen krijgen een eigen review door een schone chat.

### Stap A: het datamodel van fase 3 op papier

`Datamodel-fase-3.md` en dit plan, vóór er een migratie is. Daarna een review door een schone chat. **Deze pull request.**

### Stap B: migratie en tests

Eén migratie met de vier functies, de view en de rechten; pgTAP per controle (`fase3_*.test.sql`); de rechtentest met haar twee
naamlijsten (`rechten.test.sql`, regel 59 tot 66 en 135 tot 139); de bewaker in `fase2_opslaan.test.sql` (versmallen, `ruil_dienst` op de lijst)
en de nieuwe bewaker op de vlaggen van `roltypen`; de gelijktijdigheidstests in `e2e/ledenacties-gelijktijdig.spec.ts`, ook een ruil tegen
`activiteit_opslaan` met twee sessies; de databasetypen. De migratie komt via de job `migraties` direct online:
controleer dus eerst lokaal en laat de review eerst gebeuren. Zonder `drop` van bestaande objecten.

### Stap C: afmelden en afmelding intrekken

De schermen en serveracties (Zod), de Schakelaar en de wachtstand. Per scherm axe op 1200 en 375 px, een vergelijking met het visuele ontwerp,
en browsertests uit de dekkingsmatrix.

**Gebouwd (04-11-2026)**, naar de wireframes `afmelden-bevestigen`, `afmelden-gelukt`, `afmelden-fout-ondergrens` en `afmelding-ingetrokken`:

- `/afmelden/<id>`: de bevestiging (kaart met wat je afmeldt, je dienst, de deadline; een toelichting die alleen het bestuur leest; Afmelden bevestigen en Annuleren).
- `/afmelden/<id>/gelukt`, `/ingetrokken` en `/kan-niet` (de blokkade van R8 met het nummer van de eindverantwoordelijke en de twee redenen). Die laatste
  krijgt alleen aantallen in het adres.
- In het paneel "Jouw status": de knop Afmelden voor wie op aanwezig staat zonder dienst, en Afmelding intrekken (direct, zonder bevestigingspagina: het kan
  terug en raakt niemand) voor wie is afgemeld, op Start en in het programma (R9). Een beheerrol of een dienst krijgt een uitleg in plaats van een knop.
- Een wachtstand op de nieuwe knoppen (`Verzendknop`): dubbel klikken maakt één afmelding.
- Wat de knoppen aanbieden staat op één plek (`maakAanbod`, `src/lib/afmelden.ts`) met unit tests; de pagina's en acties hebben browsertests (`e2e/afmelden.spec.ts`).

**Bewust nog niet** (stap D): afmelden met een dienst, dus de twee stappen met de Stappenbalk; tot dan zegt het paneel dat het hier nog niet kan en dat het lid het met de
eindverantwoordelijke regelt. Het blok "Let op: je eerder overgedragen dienst komt niet terug" op de pagina na het intrekken: een lid kan zijn eigen overdracht niet lezen, dat
komt met de overdracht. De wachtstand op Publiceren en Opslaan (F2-05): die knoppen staan buiten hun formulier en vragen een kleine ombouw.

### Stap D: dienst overdragen en afmelden met een dienst

Stappenbalk, vervangerlijst met redenen, de twee stappen als één taak, het afbreken na stap 1 (de overdracht blijft staan, zoals UC-003 AF-1 zegt).

### Stap E: Mijn diensten

De lijst (komend en geweest dit seizoen), het blok Afgemeld, de lege staat, en de ingang vanaf Start (de kaart onder de statuskaart, en de knop "Al je diensten"
op de eigen rij in de rolbezetting).

### Stap G: de bak

Dit stelt besluit 2.4 van `Fase-2-plan.md` bij ("samen met fase 3"): de bak krijgt een eigen stap, vóór de eerste Bonte Avond op 15 januari 2027. De plek in de bak
(`bak_actief`, `alleen_admin`), het beheerscherm, de lijst voor leden en de tekst bij Afmelden zijn te ontwerpen na de antwoorden van de opdrachtgever (vraag 5, 15-10).
`meld_af` is al bak-klaar: een bakplek valt onder `heeft_adminrol`.

### Stap F: afname fase 3

`Afname-fase-3.md`: bewijs, review van de fase als geheel, de lijst "Van fase 3 naar pilot B".

## 4. Planning

Een schatting, geen afspraak. Pilot A heeft voorrang boven fase 3.

| Wat | Streefdatum |
|---|---|
| Stap A (met review) | donderdag 5 november |
| Stap B (met review) | woensdag 11 november |
| Stap C tot en met E | na pilot A, begin december |
| **Besluit berichten (O-1): komen ze vóór pilot B?** | 1 december |
| Stap F | half december |
| Pilot B | 3 januari 2027 |
| Stap G (de bak) | vóór de Bonte Avond, 15 januari 2027 |

## 5. Risico's

| Risico | Wat dan |
|---|---|
| Een migratie die direct online komt en een fout bevat | Eerst lokaal, de review eerst, geen `drop`; de functies zijn nieuw, dus terugdraaien is `drop function` in een volgende migratie |
| Gelijktijdigheid (twee afmeldingen tegelijk onder de grens) | De lock op `activiteiten` en de tests die rood zijn zonder lock |
| Lock-volgorde tussen `ruil_dienst` en `activiteit_opslaan` leidt tot een deadlock | Beide nemen eerst de activiteit, dan de slots; een test met twee sessies |
| Een overdracht zonder bericht aan de vervanger (O-1) | Besluit vóór 1 december: berichten vóór pilot B, of pilot B draait zonder en het bestuur licht de vervanger onderling in |
| Ledenbeheer (fase 4) of `leden:zet` wijzigt `actief` of groepen zonder de lock op de activiteit | `for share` op de vervanger in `ruil_dienst`; voor de telling van aanwezigen een eigen regel in fase 4 (`Datamodel-fase-3.md` O-4) |
| De pilot A-leden vragen om afmelden terwijl het er nog niet is | De pilotleden worden verteld dat het nog niet kan (F2-14); het bestuur laat het onderling weten |
| Ontwerpgaten voor de foutschermen | Eerste versie door de bouwer; zonder beoordeling blijft het een voorstel |
