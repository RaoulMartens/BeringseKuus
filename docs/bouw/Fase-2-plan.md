# Fase 2: plan

Stand 02-11-2026. **Voorstel van de bouwer, nog te bevestigen:** de besluiten in punt 2 zijn aanbevelingen, geen genomen
besluiten. Bron: `Fase-1-plan.md` (versmald op 30-10-2026), `Afname-fase-1.md` punt 4 ("Van fase 1 naar fase 2"),
`Bouwbesluiten-2026-10-27.md` 5.1, `Datamodel-fase-1.md` (vooral punt 4 en 5) en bouwgids V8 hoofdstuk 10 en 13.3.

**Doel (V8 10, fase 2):** de beheerder deelt mensen in en publiceert; leden zien wie waar staat. Daarbij de schermen die
uit fase 1 zijn verschoven. Resultaat volgens V8 13.3, pilot A: *het programma en de indeling zijn te zien, zonder
afmelden en ruilen.*

## 1. Wat erin zit en wat niet

**In fase 2**

- `activiteit_opslaan` wordt uitgebreid van "aanmaken en een concept wijzigen" naar de hele handtekening van V8 4.4:
  mensen indelen (`toewijzen`, `leegmaken`), een gepubliceerde activiteit wijzigen, **publiceren** (R21: een eindtijd en
  een eindverantwoordelijke met telefoonnummer), `verwachte_bezetter` en `verwachte_versie` (punt 2.1).
- De kleine migratiepunten uit `Afname-fase-1.md`: het type van `p_activiteit_id` (`null`), `versie`, `bijgewerkt`,
  "geweest" met de tijdfunctie van de database (F1-10), het seizoenfilter, `contact_eindverantwoordelijke()`.
- **Beheerschermen, als één scherm voor aanmaken en bewerken** met de rolbezetting op het activiteitscherm zelf: het
  beheeroverzicht met tellers en taken (V8 5.6), activiteit aanmaken als concept, indelen, publiceren, de bevestigingsstap
  met "Wie krijgt bericht", concept verwijderen (V8 4.6).
- **Ledenschermen:** het welkomscherm (`welkom`, `welkom-leeg`, `welkom-twee`) en het activiteitscherm voor leden, met de
  rolbezetting zoals een lid die ziet (lege plekken blijven verborgen, R13).
- De componenten die die schermen nodig hebben (Tijdlijnkaartje, Statuspaneel, Keuzelijst met aankruisvakjes,
  Stappenbalk, Schakelaar) en de eerste serveractie met invoer, met een vast schema (Zod, `Fase-1-plan.md` 2.4).
- Browsertests voor wat nu alleen met pgTAP is bewezen (`Afname-fase-1.md` punt 4).

**Niet in fase 2:** afmelden en ruilen (fase 3), ledenimport en uitnodigingen (fase 4), meldingen en de echte agenda-feed
(fase 7), meerdere activiteiten tegelijk aanmaken (fase 9). **De bak** (V8 3.7, `bak_actief`) stel ik voor te laten
vallen voor pilot A: ze is niet nodig om het programma en de indeling te tonen, en de eerste activiteit met een bak
is waarschijnlijk in januari (het programma 2026/2027 noemt de Jeugd van Vreuger middig op 17 januari; of dat de bak is, is een aanname uit V8 15). Dat is een voorstel; zie 2.4.

## 2. Beslissingen

De eerste drie staan in `Bouwbesluiten` 5.1 als "vóór fase 2"; de bouwer legt ze nu vast.

| # | Vraag | Voorstel | Reden |
|---|---|---|---|
| 2.1 | Versie van de activiteit (review 06): vervangt `verwachte_versie` het `verwachte_bezetter`, of komt het ernaast? | **Ernaast.** `verwachte_bezetter` beschermt de ene plek (er bestaat al een scherm voor `slot_gewijzigd`). `versie` is het grove vangnet voor alles wat de getoonde activiteit raakt. Nieuwe foutcode `versie_verouderd`, met de tekst "Iemand anders heeft deze activiteit net gewijzigd. Laad de pagina opnieuw en probeer het nog eens." | Twee beheerders is genoeg om elkaar in de weg te zitten. Ernaast kost weinig: de bestaande controle verandert niet |
| 2.2 | Doelgroepconflict (review 05): een groepswijziging terwijl er ingedeelden zijn die daardoor toegang verliezen | **Weigeren.** Foutcode `doelgroep_conflict`, met de namen in `detail`; de beheerder haalt ze eerst uit de indeling. Niet "automatisch verwijderen in dezelfde opslag" | Weigeren is de veiligste keuze; niemand verdwijnt uit een indeling zonder dat de beheerder het ziet |
| 2.3 | BA-6: roltypen als tabel | **Ja, al gedaan:** `rol_slots.rol_type` verwijst naar `roltypen(code)` sinds fase 1 | `Datamodel-fase-1.md` punt 2.6 |
| 2.4 | De bak in pilot A | **Niet in pilot A.** `bak_actief` blijft in het schema; de plek in de bak en het scherm volgen vóór de eerste bak (januari), samen met fase 3 | Tijd: het beslismoment is 6 november, pilot A begint 14 november |
| 2.5 | Een scherm of tekst voor `versie_verouderd`, `doelgroep_conflict` en de blokkades bij publiceren | **Ontwerpgat** (V8 14.3): de ontwerper maakt de wireframe, Claude zet een eerste versie klaar in de stijl van de andere schermen | Zonder wireframe geen scherm |

## 3. Stappen

Elke stap is een eigen pull request, met de hele poort groen. Migraties, rechten, inloggen en de poort krijgen een
eigen review door een schone chat (`CLAUDE.md`, Werkwijze).

### Stap A: het datamodel van fase 2 op papier

`docs/bouw/Datamodel-fase-2.md`, **vóór er een migratie komt**: de uitgebreide `activiteit_opslaan` (per handeling: wie
mag, welke foutcodes, wat in `wijzigingen_log`), `versie` en `bijgewerkt` (welke wijzigingen verhogen de versie), de
publicatieregels (R21 en welke andere velden), de foutcodes `versie_verouderd` en `doelgroep_conflict`, de dekkingsmatrix
voor fase 2 en de schermen die gebouwd worden, met wat ze lezen. Daarna een review door een schone chat.

### Stap B: migraties en tests

De migratie(s) met per functie de rechten en de negatieve tests in pgTAP, de gelijktijdigheidstest voor `versie` (twee
sessies tegelijk, een publicatie tegen een wijziging), het type van `p_activiteit_id` in de databasetypen, en
"geweest" met de tijdfunctie op één plek. De migratie komt door de job `migraties` bij het samenvoegen **direct online**
(`Afname-fase-1.md`): controleer vooraf dus lokaal en laat de review eerst gebeuren.

### Stap C: beheerschermen

Het beheeroverzicht, het activiteitscherm met de rolbezetting (aanmaken en bewerken), publiceren met de bevestigingsstap
en concept verwijderen, met de teksten uit de wireframes en het uiterlijk uit de componenten. Per scherm: axe op 1200 en
375 px, een screenshot naast het visuele ontwerp (`Design-overdracht.md` 4), en browsertests voor de regels uit de
dekkingsmatrix. Hier komt Zod voor de eerste serveractie met invoer.

### Stap D: ledenschermen

Het welkomscherm in drie varianten en het activiteitscherm voor leden. Ook hier axe en de vergelijking met het ontwerp.

### Stap E: afname en pilotcheck

`Afname-fase-2.md` (bewijs, review van de fase als geheel, de lijst "Van fase 2 naar de pilot") en de pilotcheck uit
`Bouwbesluiten` 5.2, plus wat pilot A naast de code vraagt (`Fase-1-plan.md` 2.7).

## 4. Planning

Dit is een schatting, geen afspraak. Het beslismoment van `Fase-1-plan.md` 3 blijft vrijdag 6 november.

| Wat | Streefdatum |
|---|---|
| Stap A (met review) | woensdag 4 november |
| Stap B (met review) | vrijdag 6 november |
| **Beslismoment: haalt fase 2 de 13e?** Zo niet, dan pilot B en de opdrachtgever laten weten | vrijdag 6 november |
| Stap C en D | dinsdag 10 november |
| Stap E en de pilotcheck | woensdag 11 november |
| Pilot | 14 tot 22 november |

Op 6 november weten we of stap A en B klaar zijn en hoe ver C is. Zijn A en B niet klaar, dan is pilot A niet
haalbaar. Dat is geen mislukking: de pilotvoorwaarden (`Fase-1-plan.md` 2.7) hebben eigen tijd nodig, onder meer het
afzenderadres voor de inlogmail en de bevestiging van de tweede beheerder.

## 5. Risico's

| Risico | Wat dan |
|---|---|
| De tijd tot 6 november is krap voor datamodel, review en migratie | Stap A kort houden en de review in dezelfde dag; wat blijft liggen staat in `Afname-fase-2.md` |
| Ontwerpgaten (2.5) houden de schermen op | Eerste versie door Claude, beoordeling door de ontwerper; zonder beoordeling blijft het scherm een voorstel |
| Een migratie die direct online komt (de job `migraties`) en een fout bevat | Eerst lokaal en met de review; geen `drop` zonder bevestiging; een back-up-afspraak volgt vóór de pilot (`Bouwbesluiten` 3.4) |
| Het inlogadres van de bestuursleden komt niet aan bij werkmailsystemen | Eigen afzenderdomein vóór de pilot (`Fase-1-plan.md` 2.7, open besluit) |
