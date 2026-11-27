# Het wijzigingenlog bekijken (UC-015)

Elke schrijffunctie schrijft zelf haar regels in `wijzigingen_log`, in dezelfde transactie (Datamodel-fase-1, 2.8). Beheerders kunnen het nu lezen in
Beheer onder **Ledenbeheer, Wijzigingen** (`/beheer/wijzigingen`): per dag wie wat deed, van nieuw naar oud.

## Wat er is

- **Scherm:** per dag een kaart ("Vandaag", "Gisteren", "Dinsdag 19 januari"), per regel de wijziger vet, de omschrijving eronder en het uur rechts. Een regel
  over een activiteit of lid dat er nog is, opent die. "Toon oudere wijzigingen" laadt er 50 bij (het adres bevat het id van de laatste regel).
- **Filter** in de zijkolom en in de adresbalk (`?soort=`): Alles, Diensten (indelen, vervangen, eraf halen, ruilen, de bak), Activiteiten (aanmaken, wijzigen,
  publiceren, verwijderen), Leden (toevoegen, uitnodigen, inactief, gegevens, herinnering) en Beheer (rechten). Een actie die geen filter kent staat alleen bij Alles.
- **Database:** één leesfunctie, `wijzigingen_lezen(p_soort, p_voor_id, p_aantal)` (migratie `20261127120000_wijzigingenlog.sql`), alleen voor een beheerder met een
  recente code (`geen_admin`). Ze geeft één regel meer dan gevraagd, zodat het scherm weet of er meer is.

## Regels

- **R41.** Alleen een beheerder met een recente code leest het log; het is alleen-lezen (geen schrijfrecht voor de app).
- **R42.** Afmeldingen en het intrekken ervan (`afgemeld`, `afmelding_ingetrokken`) staan er niet in, ook niet de reden; e-mailadressen staan er nooit in.
- Een dienst die een lid overdroeg staat in het log met alleen id's; de leesfunctie maakt er namen van ("Dienst bij Bonte Avond (22-01-2027) overgedragen van A aan B").
- **R43.** "Het systeem" staat bij wat de taken-Worker of de database zelf deed (oud papier, herinnering). Een wijziger die er niet meer is, staat er ook zo.

## Tests

`supabase/tests/database/wijzigingenlog.test.sql` (17: rechten, filters, geen afmeldingen, namen, links, bladeren), `src/lib/wijzigingenlog.test.ts` (filter, dagen in de tijd van
Nederland) en `e2e/wijzigingen.spec.ts` (de ingang, een regel naar een lid, het filter, bladeren, met toegankelijkheidscontrole).
