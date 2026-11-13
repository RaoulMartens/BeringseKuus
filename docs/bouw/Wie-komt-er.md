# Wie komt er? (UC-010)

Een lid ziet bij een activiteit wie er komt en wie zich heeft afgemeld, als raster van bolletjes met initialen. Gevuld is
"komt", gestippeld is "afgemeld". De naam staat bij hover, bij focus en voor een schermlezer. De reden van een afmelding is
er niet.

## Besluit

Op verzoek van de opdrachtgever mogen **alle leden** de afgemelde namen zien, zonder reden (13-11-2026, prototype). De
opdrachtgever bevestigt dit nog bij het bestuur. Valt het antwoord anders uit, dan verhuist de kaart naar de
beheerkant: alleen de database-functie en de plek op het scherm veranderen, de rest blijft.

## Wat er is

| Onderdeel | Waar |
|---|---|
| Leesfunctie `wie_komt_er(p_activiteit_id)` | `supabase/migrations/20261113120000_wie_komt_er.sql` |
| Databasetest (18 punten) | `supabase/tests/database/wie_komt_er.test.sql` |
| Rij naar raster, initialen, telling | `src/lib/wiekomter.ts` (+ test) |
| De kaart | `src/components/wiekomter/` |
| Op Start en op de activiteit in het programma | `src/app/page.tsx`, `src/app/programma/[id]/page.tsx` |
| e2e | `e2e/wie-komt-er.spec.ts` |

## Privacy

- De tabel `afmeldingen` blijft voor een lid beperkt tot zijn eigen regel (policy `eigen_of_beheerder`, ongewijzigd). De
  functie is de enige route naar de afmeldingen van anderen.
- Het resultaat is `lid_id`, `voornaam`, `achternaam`, `komt`. Geen toelichting, geen e-mailadres, geen telefoonnummer. De
  databasetest bewaakt dat de kolommen precies deze vier zijn.
- Doelgroep zoals bij het aantal aanwezigen (R1, R12, R22): actieve leden van type lid die de activiteit mogen zien. Externe
  helpers en inactieve leden staan er niet in.
- Een concept, een geannuleerde of onbekende activiteit, of een activiteit voor een groep waar het lid niet bij hoort, geeft
  geen rijen en geen fout (zoals `contact_eindverantwoordelijke`).

## Open

- De opdrachtgever bevestigt bij het bestuur dat alle leden de afgemelde namen mogen zien.
- Initialen zijn niet uniek (twee leden kunnen dezelfde hebben). Het bolletje is voor het overzicht; de naam staat erbij.
- Het raster groeit mee met de groep: bij 42 leden past het ruim, bij een vereniging met enkele honderden leden is een
  andere weergave nodig (bijvoorbeeld alleen de afgemelden).
