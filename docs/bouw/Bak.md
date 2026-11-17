# De bak bij de Bonte Avond (BA-8, R23)

De bak is de lijst plekken bij de Bonte Avond voor de prins, de adjudant, de vorst en de elf raadsleden van de Raad van Elf. Het
bestuur houdt hem bij; leden zien wie erin zit. Dit document legt uit wat er is gebouwd, hoe het werkt en wat nog open staat.

## Wat een beheerder ziet

Op het activiteitscherm staat een kaart **Bak**, onder de Rolbezetting:

- Een schakelaar **Bak bijhouden bij deze activiteit**. Uit: alleen de schakelaar. De bak hoort niet bij elke activiteit, alleen
  bij de Bonte Avond en één of twee andere (de opdrachtgever, 16-10-2026).
- Aan: de plekken per kopje, **Prins en adjudant**, **Vorst** en **Raad van Elf**, elk met een keuzelijst met leden. De eerste keer
  is hij **vooraf gevuld met de Raad van Elf** (de leden van die groep); de prins, de adjudant en de vorst zijn leeg, omdat het
  systeem niet weet wie dat dit seizoen zijn (ze zijn nog niet bekend, en misschien geen lid). Een plek zonder naam blijft
  leeg en is voor leden niet te zien (R13).
- **Plek weghalen** en **+ plek erbij** bij de Raad van Elf, voor een wisseling of een extra raadslid.
- Alles gaat pas bij **Opslaan** door, samen met de rest van het scherm: alles of niets.

## Wat een lid ziet

- Onder de Rolbezetting een kaart **Bak**, alleen lezen, met alleen de kopjes waar iemand zit. Jezelf herken je aan "(jij)".
- Zit je zelf in de bak, dan zegt de statuskaart **"Je zit in de bak."** Je krijgt geen knop Afmelden maar het nummer van de
  eindverantwoordelijke (R23: een plek in de bak is een beheerrol, zoals BOB). De database weigert een afmelding ook
  (`heeft_adminrol`).

## Hoe het werkt

- **Geen nieuwe tabel.** De bak is rol_slots met `rol_type = 'bak'` en een `plek_label` (prins, adjudant, vorst, raadslid), plus
  de schakelaar `activiteiten.bak_actief`. Dat bestond al sinds fase 1.
- **`activiteit_opslaan` is niet aangeraakt.** Die functie weigert een bakplek nog steeds (`niet_ondersteund`). De migratie
  `20261117150000_bak.sql` voegt twee functies toe:
  - `intern.bak_zetten(activiteit, bak)`: zet de bak op de gevraagde eindtoestand (plekken erbij, een andere bezetter, plekken
    eraf, de schakelaar) en controleert eerst alles: alleen een beheerder, een bestaand label, een lid van de vereniging (geen
    externe helper of inactief lid), niemand dubbel (R6, ook niet met een andere plek bij dezelfde activiteit) en
    `verwachte_bezetter` tegen twee beheerders tegelijk (`slot_gewijzigd`). Het logt `bak_gewijzigd` zonder namen.
  - `public.activiteit_opslaan_met_bak(...)`: roept `activiteit_opslaan` aan en daarna `bak_zetten`, in één transactie. Faalt het
    een of het ander, dan gaat er niets door (ook de rest van het scherm niet). De app roept alleen deze aan; zonder `bak` in
    de aanroep werkt hij als gewoon opslaan.
- **Berichten** (O-1): een plek in de bak erbij of eraf geeft hetzelfde bericht als elke plek ("Je zit in de bak." en "Je zit niet
  meer in de bak."), zodra de mail aan staat. De bak zelf heeft geen eigen berichtenlogica.
- De rekenregels en de vorm van het formulierveld staan in `src/lib/bak.ts` (tests: `src/lib/bak.test.ts`), het scherm in
  `src/app/beheer/activiteiten/bak.tsx`, de leesroute voor leden in `src/app/ledenactiviteit.ts`.

## Tests

- `supabase/tests/database/bak.test.sql`: 34 databasetests (alleen beheerder, aanzetten, alles of niets met de rest van het
  scherm, vervangen, `slot_gewijzigd`, dubbelboeking, externe helper en inactief lid, plekken eraf, uitzetten, wat een lid ziet,
  afmelden vanuit de bak, rechten).
- `e2e/bak.spec.ts`: de beheerder zet de bak aan, kiest en slaat op (en weer uit), en een lid ziet de bak, "Je zit in de bak" en
  geen knop Afmelden; beide schermbreedtes, met axe.

## Wat nog niet is

- **Mijn diensten:** een plek in de bak staat er niet in. Ontwerp (UC-007 AF-2) en de vraag aan het bestuur (wil een raadslid de
  bak terugzien in Mijn diensten en in zijn agenda?) zijn nog open; zolang dat niet beantwoord is, is Mijn diensten alleen
  diensten.
- **De bak overnemen van de eerste avond** (`admin-activiteit-bewerken-za`): bij de tweede avond een knop "Bak overnemen van
  vr 22 januari". Nu vul je de bak per avond (of kopieer je de eerste avond met het kopiëren van een seizoen: de bak gaat daar
  niet mee, want wie erin zit verandert per seizoen).
- **De keuzelijst met zoeken en het label "Raad van Elf, al in de bak"** (`admin-activiteit-kiezen-bak-zoeken`): nu een gewone
  keuzelijst met alle leden.
- **Wat er in het huidige bakschema staat** (op of langs het podium, en wanneer): open vraag aan het bestuur. Nu alleen wie erin zit.
- **Prins, adjudant en vorst vooraf gevuld:** pas als het systeem weet wie dat zijn (een instelling per seizoen of een eigen groep).
