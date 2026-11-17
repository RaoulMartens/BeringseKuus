# Een seizoen kopiëren (UC-006)

Bij de start van een seizoen maakt de beheerder alle activiteiten in één keer aan door het vorige seizoen te kopiëren. Dit
document legt uit wat er gebeurt, wat meegaat en wat niet. De Excel-import (zelfde scherm, andere ingang) staat in
`docs/bouw/Pilotleden.md` en de code in `src/app/beheer/activiteiten/bulk/`.

## Het scherm

1. **Meerdere activiteiten aanmaken** (`/beheer/activiteiten/bulk`): kies *Vorig seizoen kopiëren* of *Excel-bestand importeren*.
2. **Vorig seizoen kopiëren** (`/bulk/kopieren`): kies het seizoen (standaard het nieuwste), een activiteit met een bekende
   datum (standaard de Optocht) en de datum waarop die in het nieuwe seizoen valt, bijvoorbeeld `27-02-2028`.
3. **Controleer de activiteiten:** per activiteit de nieuwe datum (aan te passen), de datum van vorig seizoen om mee te
   vergelijken, en *Niet meenemen*. Er is nog niets opgeslagen: weggaan kost niets.
4. **N concepten aanmaken:** alle regels in één transactie (`activiteiten_bulk_aanmaken`, alles of niets, tweemaal klikken
   geeft nooit dubbele activiteiten). Daarna staat de beheerder op het overzicht met de melding.

## Hoe de datums schuiven

- Het verschil in dagen tussen de oude en de nieuwe datum van de gekozen activiteit geldt voor alle activiteiten. Valt de nieuwe
  datum op dezelfde weekdag, dan kloppen alle weekdagen.
- **11 november blijft staan.** Een activiteit op 11-11 (Elfde van de elfde) komt op 11 november van het beginjaar van het
  nieuwe seizoen (bij de Optocht op 27-02-2028 is dat 11-11-2027). Het controlescherm toont "Vaste datum: elk jaar 11 november".
  Het systeem kent geen andere vaste datums; die past de beheerder per regel aan.
- Het nieuwe seizoen moet later zijn dan het gekopieerde; een datum in hetzelfde seizoen wordt geweigerd.
- De rekenregels staan in `src/lib/kopieren.ts`, met tests in `src/lib/kopieren.test.ts` (schrikkeljaar, zomertijd, seizoengrens).

## Wat meegaat en wat niet

| Gaat mee | Gaat niet mee |
|---|---|
| Naam, verzameltijd, starttijd, eindtijd, locatie, busvertrek en busplaats, notitie, minimaal aanwezig | Wie waar is ingedeeld: alle plekken starten leeg |
| De doelgroep (voor wie) | Afmeldingen en de wijzigingenlog |
| De plekken per soort werk (twee tappers, een drankhaler, enzovoort) | De bak (`bak_actief` en de bakplekken) |
| De afmeld-deadline, op dezelfde afstand van de nieuwe datum en op dezelfde tijd op de klok in Nederland | De eindverantwoordelijke (de database maakt een lege vaste plek, zoals bij elke nieuwe activiteit) |
| | Oud papier (dat maakt het systeem zelf aan) en geannuleerde activiteiten |
| | De status: alles wordt een concept, dus er gaan geen berichten uit (R18) |

Een concept uit het vorige seizoen zonder starttijd of locatie kan niet worden aangemaakt. Het controlescherm meldt dat en de
beheerder neemt de regel dan niet mee (of vult hem eerst aan in het vorige seizoen).

## Waarom zo

- **Alles in de app, niets nieuws in de database.** `activiteiten_bulk_aanmaken` kon al groepen, plekken per soort, een
  busplaats, een deadline en een minimum aan (migratie `20261113140000`, voor dit doel gemaakt). De app berekent de regels en
  de database controleert ze opnieuw. Er is dus geen nieuwe migratie.
- **De afmeld-deadline gaat zonder tijdzone naar de database.** De database leest `JJJJ-MM-DDTUU:MM:SS` als tijd in Nederland,
  dus de deadline blijft op dezelfde tijd op de klok, ook als de zomertijd ertussen komt.
- **Een eigen seizoen per schermbreedte in de browsertest** (`e2e/kopieren.spec.ts`: 2090 en 2070), zodat de twee tegelijk
  draaiende tests elkaars gegevens niet zien.

## Wat nog niet kan

- Naam of tijd per regel aanpassen op het controlescherm: alleen de datum is aan te passen. Dat kan daarna op het gewone
  activiteitscherm. Verandert er veel per jaar, dan komt dit erbij (open vraag uit UC-006).
- Een waarschuwing als een activiteit met dezelfde naam en datum al bestaat.
- Een regel toevoegen die in het vorige seizoen niet bestond.
