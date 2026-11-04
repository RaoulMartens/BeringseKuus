# Datamodel fase 3: afmelden, afmelding intrekken, dienst overdragen, Mijn diensten

Stand 04-11-2026, **voorstel, gereviewd door een schone chat en bijgewerkt**. Dit is stap A van fase 3 (`Fase-3-plan.md`): wat er in de database komt
voordat er een migratie is. Bron: `use-cases.md` (UC-002, UC-003, UC-007; regels R1 tot en met R9, R14, R15, R17, R20, R22,
"Gelijktijdigheid: één slot per activiteit"), bouwgids V8 4.2, 4.3 en 5.7, `Datamodel-fase-1.md` (uitgangspunten) en
`Datamodel-fase-2.md` (versie, vangnet, foutcodes). Wat hier niet staat, verandert niet.

## 1. Wat verandert

| Wat | Hoe |
|---|---|
| `meld_af(p_activiteit_id, p_toelichting)` | Nieuw. Een lid meldt zich af (UC-003) |
| `trek_afmelding_in(p_activiteit_id)` | Nieuw. Een lid trekt zijn afmelding in (R9) |
| `ruil_dienst(p_rol_slot_id, p_vervanger_id)` | Nieuw. Een lid draagt zijn dienst over (UC-002) |
| `beschikbare_vervangers(p_activiteit_id)` | Nieuw, alleen lezen: wie kan overnemen, en zo niet, waarom |
| view `mijn_diensten` | Nieuw, alleen lezen: de eigen diensten van het seizoen, komend en geweest (UC-007, V8 5.7) |
| Tabellen, kolommen, constraints | **Geen wijziging.** `afmeldingen`, `rol_slots` (met `geen_dubbelboeking`), `roltypen.ruilbaar_door_lid` en `alleen_admin`, `wijzigingen_log` en `activiteiten.versie` staan er al |

De migratie bevat dus alleen functies, één view en rechten. Er verdwijnt niets en er wordt geen bestaande rij aangeraakt.

**Niet in fase 3:** berichten (O-1, `Bouwbesluiten` 5.3), de bak (`bak_actief`, besluit 2.4 van `Fase-2-plan.md`), de agenda-feed
(UC-008, fase 7) en het overzicht van openstaande ruilverzoeken (buiten de MVP).

## 2. Uitgangspunten (gelden voor alle vier)

1. **Wie belt:** een ingelogd, **actief lid** (`intern.huidig_lid()` is niet leeg). Zonder lid: foutcode `geen_lid`. Een beheerder
   is ook gewoon lid en meldt zich zoals een lid af (DM-03: zijn welkomscherm is dat van een lid). Er is dus geen `geen_admin`
   en geen eis aan `aal2`: dit zijn ledenhandelingen.
2. **Eerst de lock, dan lezen** (`use-cases.md`, Gelijktijdigheid): de eerste handeling na de controle op het lid is
   `select … from public.activiteiten where id = … for update`. Alle drie schrijffuncties nemen dezelfde lock als
   `activiteit_opslaan`, in dezelfde volgorde (eerst de activiteit, dan de slots), zodat ze elkaar niet in een
   deadlock zetten.
3. **Zichtbaar is de poort (R15, R22):** alles wat het lid niet mag zien (onbekend, concept, andere doelgroep) geeft
   `activiteit_niet_open` met een lege `detail`, hetzelfde als een niet bestaand id. Pas na de zichtbaarheidscontrole noemt
   `detail.reden` of de activiteit `geannuleerd` of `afgelopen` is; dat verraadt niets, want het lid mag hem zien.
4. **Eén transactie, alles of niets**, met `security definer` en `set search_path = ''`, zoals fase 1 en 2. Foutcodes met
   SQLSTATE `BK001` (`intern.fout`).
5. **Auditspoor:** elke wijziging krijgt een regel in `wijzigingen_log` met alleen id's en aantallen, **nooit** de toelichting
   van een afmelding of een naam (`Bouwbesluiten` 4.6). De toelichting staat alleen in `afmeldingen.toelichting`; die kan
   een lid zelf en de beheerder lezen (bestaande policy).
6. **Geen directe schrijfrechten:** `afmeldingen` en `rol_slots` blijven alleen via de functies te schrijven (fase 1).

## 3. De functies

**Voor alle vier:** een argument dat `null` is, geeft de foutcode van een onbekend object (`activiteit_niet_open` bij een activiteit,
`geen_bezetter` bij een slot, `vervanger_ongeldig` bij een vervanger), nooit een onverwachte fout. De tijd is `clock_timestamp()`,
**gezet ná de lock** (`v_nu`), zoals `activiteit_opslaan`; `now()` is het begin van de transactie en zou een afmelding die op de lock
heeft gewacht nog "vóór de deadline" laten tellen.

### 3.1 `meld_af(p_activiteit_id uuid, p_toelichting text default null) returns jsonb`

Controles, in deze volgorde (de eerste die faalt geeft de foutcode; niets wordt dan gewijzigd). De lock en `v_nu` komen na controle 0.

| # | Controle | Foutcode | Regel |
|---|---|---|---|
| 0 | Is er een actief lid? | `geen_lid` | DM-20 |
| 1 | Bestaat de activiteit en mag het lid hem zien (`lid_mag_zien`)? Dan pas: is hij gepubliceerd (`reden: geannuleerd`) en niet afgelopen (`reden: afgelopen`, `eindigt_om > v_nu`)? | `activiteit_niet_open` | R15, R16 |
| 2 | Bestaat er al een afmelding van dit lid? | `al_afgemeld` | AF-8 |
| 3 | Bezet het lid **bij deze activiteit** een slot met `roltypen.alleen_admin` (eindverantwoordelijke, BOB, bak)? | `heeft_adminrol` | R4, R23 |
| 4 | Bezet het lid bij deze activiteit nog een ander slot? (Na controle 3 is dat een slot dat niet `alleen_admin` is, dus `ruilbaar_door_lid`.) | `heeft_ruilbare_rol` | R7 |
| 5 | Is `afmeld_deadline` verstreken (`intern.deadline_verstreken(…, v_nu)`, strikt groter dan), staat de ondergrens aan (`min_aanwezigen` is niet leeg) en zijn er na deze afmelding minder dan `min_aanwezigen` aanwezigen? | `onder_ondergrens` | R8 |

`detail`: `activiteit_niet_open` → `{ "reden": … }` of `{}` (zie uitgangspunt 3); `onder_ondergrens` →
`{ "min": n, "aanwezigen_nu": n, "aanwezigen_na": n }` (het scherm toont beide: "nu 13 aanwezig, met jouw afmelding 12"); de rest
`{}`. Het telefoonnummer van de eindverantwoordelijke haalt het scherm op met de bestaande `contact_eindverantwoordelijke` (R10), niet
uit deze fout.

**De toelichting:** gesnoeid (spaties vooraan en achteraan weg), stuurtekens vervangen door een spatie, daarna afgekapt op 500 tekens;
leeg wordt `null`. Afkappen en niet afwijzen: een lid dat iets langs typt, moet zich kunnen afmelden. (`intern.json_tekst` weigert
te lange tekst en past hier dus niet.)

Bij succes: een rij in `afmeldingen`, een log `afgemeld`, en `{ "activiteit_id": …, "aanwezigen": n }` terug.

*Besluit 3.1:* controle 3 komt vóór controle 4. Een lid met zowel een beheerrol als een ruilbare plek moet eerst bij de
eindverantwoordelijke zijn; daar kan een overdracht niets aan veranderen. Controle 4 kijkt naar *elk* ander slot en niet naar de vlag
`ruilbaar_door_lid`: een roltype dat later met beide vlaggen onwaar wordt toegevoegd (BA-6), mag een bezetter niet "afgemeld én ingedeeld"
maken. Een pgTAP-bewaker eist bovendien dat elk roltype precies één van de twee vlaggen heeft.

**Aanwezigen:** `intern.aantal_aanwezigen(activiteit)` telt de doelgroep (R22), type `lid` en `actief` (R1, R12) en trekt bestaande
afmeldingen af, dus een externe helper of een lid buiten de doelgroep telt niet mee. De aanroeper zelf telt mee (controle 1 en 2
garanderen dat), dus `aanwezigen_na` is de teller min 1. De aanroep staat **in een eigen statement ná de lock**, niet in dezelfde
`select … for update`: een stabiele functie in dezelfde query gebruikt de momentopname van vóór het wachten, en dan lezen twee gelijktijdige
afmeldingen toch beide 14.

### 3.2 `trek_afmelding_in(p_activiteit_id uuid) returns jsonb`

| # | Controle | Foutcode | Regel |
|---|---|---|---|
| 0 | Is er een actief lid? | `geen_lid` | |
| 1 | Mag het lid de activiteit zien? Is hij gepubliceerd en niet afgelopen? | `activiteit_niet_open` (onzichtbaar, onbekend of geannuleerd) of `activiteit_voorbij` (afgelopen) | R9, R15 |
| 2 | Bestaat er een afmelding van dit lid? | `niet_afgemeld` | |

Geen ondergrenscontrole: intrekken verhoogt het aantal aanwezigen. Een eerder overgedragen dienst komt **niet** terug (R9): de functie
raakt `rol_slots` niet aan. De lock staat er toch, voor dezelfde volgorde. Log: `afmelding_ingetrokken`. Terug:
`{ "activiteit_id": …, "aanwezigen": n }` (de stand ná het intrekken).

*Besluit 3.5 (afwijking van UC-003 en R9):* een geannuleerde activiteit geeft bij intrekken `activiteit_niet_open` en niet
`activiteit_voorbij`. Gevolg: een afmelding op een activiteit die daarna wordt geannuleerd blijft bestaan (in het blok "Afgemeld" van
Mijn diensten) en is niet meer in te trekken. Dat is bedoeld: er valt niets meer aan te melden.

### 3.3 `ruil_dienst(p_rol_slot_id uuid, p_vervanger_id uuid) returns jsonb`

Het slot-id verraadt niets over de activiteit. De functie zoekt het slot eerst op **zonder lock** om de activiteit te kennen, neemt dan de
lock op de activiteit en leest het slot **opnieuw** (de bezetter kan intussen zijn veranderd), met `for update of s`: een `for update` zonder
`of` zou bij een join ook de rij in `roltypen` vergrendelen en alle ruilen van alle activiteiten op elkaar laten wachten. Geen slot gevonden,
op welk moment ook (voor de lock, na de lock, door een gelijktijdig weghalen of verwijderen van een concept), is altijd `geen_bezetter`.

| # | Controle | Foutcode | Regel |
|---|---|---|---|
| 0 | Is er een actief lid? | `geen_lid` | |
| 1 | Bestaat het slot, mag het lid de activiteit zien (`lid_mag_zien`) en is het lid de huidige bezetter? Een slot van een ander, een slot in een verborgen activiteit (een lid kan in een concept staan) en een leeg slot zien er hetzelfde uit | `geen_bezetter` | BG 4 |
| 2 | Is `roltypen.ruilbaar_door_lid` waar voor dit slot? | `rol_niet_ruilbaar` | R4 |
| 3 | Is de activiteit gepubliceerd en niet afgelopen (`reden` zoals bij `meld_af`)? | `activiteit_niet_open` | R15 |
| 4 | Is de vervanger een **actief lid** van type `lid`, niet het lid zelf, en mag hij de activiteit zien (doelgroep)? De rij van de vervanger wordt met `for share` gelezen | `vervanger_ongeldig` | R14, R17, R22 |
| 5 | Is de vervanger niet afgemeld voor deze activiteit? | `vervanger_afgemeld` | R5 |
| 6 | Staat de vervanger niet al op een ander slot van deze activiteit? | `dubbelboeking` | R6, R20 |

Doordat controle 1 de zichtbaarheid meeneemt, kan `reden` bij controle 3 nooit iets over een verborgen activiteit verraden.

*Besluit 3.3 (uitbreiding op UC-002):* controle 4 eist ook dat de vervanger de activiteit **mag zien**. Zonder die eis geeft een
overdracht een plek aan een lid dat de activiteit nergens ziet (R22), hetzelfde gat dat de review van de ledenimport (CR-04) bij een groepswijziging vond. Het is dezelfde foutcode: voor het lid is het een vervanger die niet kan. `for share` op de vervanger sluit een gelijktijdig inactief zetten
(fase 4) goedkoop uit, zonder dat ledenbeheer de activiteit-lock hoeft te nemen.

De controles 5 en 6 gebeuren expliciet in de functie. De constraint `geen_dubbelboeking` is `deferrable initially deferred` en blijft het
vangnet bij commit; de functie toetst de eindtoestand zelf, zodat een gelijktijdige overtreding niet pas bij commit als onbekende fout
verschijnt.

Bij succes: `rol_slots.bezetter_id` wordt de vervanger **in dezelfde update**, er ontstaat dus geen lege plek (R2). Daarna:

- **De versie gaat NIET omhoog.** Dit blijft zoals `Datamodel-fase-2.md` punt 2 en besluit 1 (review R2-07) het vastlegden: de acties van een lid
  verhogen de versie niet, anders krijgt een beheerder met een open formulier bij elke ruil `versie_verouderd` en verliest hij zijn werk,
  terwijl de plek al per stuk beschermd is door `verwachte_bezetter` (`slot_gewijzigd`) en een dubbelboeking in de eindtoestand wordt
  gemeld. Een eerdere versie van dit document verhoogde de versie wel; dat was een fout.
- `bijgewerkt` moet wel verschuiven (leden zien dat de bezetting is veranderd). `bk.zichtbaar` wordt voor deze activiteit gezet (alleen
  binnen de transactie) en de functie doet daarna een **no-op update** op de activiteit (`update public.activiteiten set naam = naam
  where id = …`): zonder UPDATE vuurt de trigger `activiteit_vangnet` niet. In de migratie staat dat als commentaar, zodat niemand er
  later `versie = versie + 1` van maakt.
- een log `dienst_geruild` met het slot-id en alleen de id's van de twee leden. Dat wijkt bewust af van het indelen in
  `activiteit_opslaan`, dat namen in de omschrijving zet: hier staat niets wat een naam vraagt.

Terug: `{ "rol_slot_id": …, "activiteit_id": … }`.

`meld_af` en `trek_afmelding_in` verhogen de **versie niet** om dezelfde reden. Het beheerformulier toont "Afgemeld — N" wel (Datamodel-fase-2,
schermen), maar de stand is voorlichting: indelen controleert `lid_afgemeld` opnieuw bij het opslaan, dus een beheerder die een afmelding
mist, verliest niets.

### 3.4 `beschikbare_vervangers(p_activiteit_id uuid)` (alleen lezen)

`language sql stable security definer`, zoals `contact_eindverantwoordelijke` (een `plpgsql`-functie met `returns table (lid_id, voornaam, …)` maakt die
namen tot variabelen en geeft "column reference is ambiguous"). Geeft `table (lid_id uuid, voornaam text, achternaam text, beschikbaar boolean, reden text)`:

- alleen als het lid een **ruilbaar slot** van deze activiteit bezet, en de activiteit gepubliceerd en nog niet afgelopen is (zoals controle 3 van
  `ruil_dienst`); anders geen rijen (dus geen fout, geen verraad);
- per actief lid van type `lid` dat de activiteit mag zien, behalve het lid zelf;
- `beschikbaar = false` met `reden` `'afgemeld'` of `'al_ingedeeld'` (bij beide tegelijk, wat normaal niet kan: `'afgemeld'`), anders `true` en `reden` leeg;
- gesorteerd op achternaam, voornaam.

Dit is **voorlichting, geen afdwinging**: `ruil_dienst` toetst alles opnieuw, en een pariteitstest bewaakt dat de twee overeenstemmen. Geen lock, want
een verouderde lijst is toegestaan en wordt door de server opgevangen (AF-1, AF-2 van UC-002). De functie geeft alleen de vijf publieke ledenvelden
terug die een lid al mag lezen, geen e-mail, telefoon of toelichting.

*Bewust besluit:* een slothouder ziet zo wie zich heeft afgemeld en wie al ingedeeld is, terwijl `afmeldingen` en `lid_groep` voor leden privé zijn.
UC-002 stap 3 en 4 vraagt dat ("grijs, met de reden"): een ruil die niet kan, moet vooraf uitleggen waarom. Het blijft beperkt tot de reden `afgemeld` of
`al_ingedeeld`, nooit de toelichting, en alleen voor wie zelf een ruilbare dienst bij die activiteit heeft.

### 3.5 View `mijn_diensten` (V8 5.7, UC-007)

`security_invoker`. Eén rij per eigen slot, voor gepubliceerde activiteiten die het lid mag zien, zonder de bak (`rol_type <> 'bak'`, besluit 2.4 en vraag 5
aan de opdrachtgever):

`rol_slot_id, activiteit_id, rol_type, ruilbaar, naam, datum, seizoen, verzameltijd, starttijd, eindtijd, locatie, begint_om, eindigt_om`

Gefilterd op `bezetter_id = intern.huidig_lid()` **en op `intern.lid_mag_zien(activiteit, huidig_lid)`**. Dat tweede filter is nodig: de policies op
`rol_slots` en `activiteiten` laten een beheerder (aal2) alles zien, ook een groepsactiviteit buiten zijn groepen, en R22 zegt dat een lid die nergens ziet,
ook niet in Mijn diensten. Dezelfde reden waarom `mijn_activiteiten` dat filter heeft (DM-03).

De view geeft **alle** eigen diensten van het seizoen, komend en geweest; het scherm splitst (UC-007: "Komende diensten" en "Geweest dit seizoen"), op `eindigt_om`.
Het blok **"Afgemeld"** van UC-007 komt uit een tweede lezing van `afmeldingen` (eigen rijen, bestaande policy) gekoppeld aan `mijn_activiteiten`; daar is geen
nieuw object voor nodig. Het besluit van 15-10-2026 ("Mijn diensten toont alleen diensten") betekent: geen regel "aanwezig zonder dienst", niet: geen blok afgemeld.

## 4. Foutcodes van fase 3

Alle met SQLSTATE `BK001`, zoals `Datamodel-fase-2.md` punt 7. Nieuw in fase 3:

| Foutcode | Wanneer | `detail` | Scherm |
|---|---|---|---|
| `geen_lid` | Geen actief lid aan deze sessie | `{}` | Terug naar inloggen |
| `al_afgemeld` | Tweede afmelding (dubbelklik, tweede tabblad) | `{}` | Terug naar Start, status "Je bent afgemeld" |
| `niet_afgemeld` | Intrekken zonder afmelding | `{}` | Terug naar Start |
| `heeft_ruilbare_rol` | Afmelden terwijl het lid nog een ruilbare dienst heeft (stap 1 niet gedaan, of intussen ingedeeld) | `{}` | `afmelden-eerst-ruilen` |
| `heeft_adminrol` | Afmelden met een beheerrol (eindverantwoordelijke, BOB, bak) | `{}` | Statuskaart met contact (AF-2) |
| `onder_ondergrens` | Zie 3.1 | `{ "min": n, "aanwezigen_nu": n, "aanwezigen_na": n }` | `afmelden-fout-ondergrens` |
| `activiteit_voorbij` | Intrekken na afloop | `{}` | Terug naar Start |
| `geen_bezetter` | Ruilen van een slot dat niet (meer) van het lid is | `{}` | Terug naar Start met de actuele bezetting |
| `rol_niet_ruilbaar` | Ruilen van een niet-ruilbare rol | `{}` | Geen: de knop staat er niet |
| `vervanger_ongeldig`, `vervanger_afgemeld`, `dubbelboeking` | Zie 3.3 | `{ "lid_id": … }` bij `vervanger_ongeldig` (het meegegeven id); anders `{}` | `ruilen-kies-vervanger` met `ruilen-fout-afgemeld` en `ruilen-fout-dubbel` |

Bestaand en hergebruikt: `activiteit_niet_open`. Een lid ziet nooit de foutcode zelf; de app vertaalt hem naar de tekst uit het wireframe
(`UX-FLOWS.md`, foutschermen).

## 5. Rechten

| Object | Wijziging |
|---|---|
| `meld_af`, `trek_afmelding_in`, `ruil_dienst`, `beschikbare_vervangers` | `security definer`, `set search_path = ''`; `revoke` van `public` en `anon`; `grant execute` voor `authenticated`. Staan op de naamlijst voor `authenticated` in `supabase/tests/database/rechten.test.sql` (regel 59 tot 66), met de reden |
| view `mijn_diensten` | `grant select` voor `authenticated`; `security_invoker`; erbij op `pg_temp.leesbaar_voor_ingelogd` in dezelfde test (regel 135 tot 139) |
| `afmeldingen`, `rol_slots` | Ongewijzigd: alleen lezen |
| Bewaker `fase2_opslaan.test.sql` (regel 582 tot 594) | Die eist nu dat alleen `activiteit_opslaan` in `rol_slots` schrijft, en zoekt in `prosrc` met een brede reguliere expressie (ook commentaar en `meld_af`, dat `rol_slots` leest). Versmallen tot `(insert\s+into\|update\|delete\s+from)\s+public\.(rol_slots\|activiteit_groep)` en `ruil_dienst` bewust op de lijst, met de uitleg dat die geen versie verhoogt |

Wat een ingelogde zonder lid probeert, geeft `geen_lid` (functies) of geen rijen (view).

## 6. Tests

Elke regel krijgt een test die eerst rood is, zoals in fase 2. pgTAP draait als dezelfde gebruikers als in fase 1.

- **`meld_af`:** elke foutcode apart met een bewuste fout; de volgorde (adminrol vóór ruilbaar); de grens exact op het minimum is toegestaan,
  één eronder niet. De grens "op het deadline-moment" test je op `intern.deadline_verstreken(t, t)` (want `clock_timestamp()` is niet vast te zetten);
  via `meld_af` alleen "ruim vóór" en "ruim na". Geen deadline of geen minimum blokkeert nooit; een externe helper en een lid buiten de doelgroep tellen niet mee;
  een toelichting van 501 tekens wordt afgekapt, stuurtekens verdwijnen; een afmelding verandert `versie` en `bijgewerkt` niet; de log bevat geen toelichting;
  een inactief lid, een externe helper en een sessie zonder lid geven `geen_lid`; een beheerder zonder `aal2` kan zich afmelden (besluit 3.1).
- **Verborgen is gelijk aan onbekend:** voor `meld_af`, `trek_afmelding_in` en `beschikbare_vervangers` geven een concept, een andere doelgroep en een niet bestaand id
  dezelfde fout met dezelfde `detail`.
- **`trek_afmelding_in`:** slaagt en het aantal aanwezigen gaat met 1 omhoog; `niet_afgemeld`; geannuleerd en verborgen geven `activiteit_niet_open`; na afloop
  `activiteit_voorbij`; een overgedragen dienst komt niet terug; `versie` en `bijgewerkt` ongewijzigd; het log.
- **`ruil_dienst`:** alle zes controles; het slot van een ander, een leeg slot en een slot in een concept of verborgen activiteit geven `geen_bezetter` (nooit
  `rol_niet_ruilbaar` of een `reden`); de vervanger buiten de doelgroep geeft `vervanger_ongeldig`; geen lege plek tussendoor; `versie` blijft gelijk en `bijgewerkt`
  verschuift; na een ruil geeft `activiteit_opslaan` met de oude `verwachte_bezetter` `slot_gewijzigd` en met de oude versie slaagt een opslag van een ander veld;
  BOB en eindverantwoordelijke geven `rol_niet_ruilbaar`; wisselen met zichzelf geeft `vervanger_ongeldig`; `null` als slot of vervanger; het log bevat geen naam;
  na een geslaagde ruil kan het lid zonder rol zich afmelden zonder foutcode (UC-003 AF-1).
- **Herlezen onder de lock:** in een tweede sessie de activiteit-lock vasthouden, de bezetter wijzigen en committen: `ruil_dienst` geeft dan `geen_bezetter`. Een slot of
  activiteit die tussen opzoeken en lock verdwijnt, geeft ook `geen_bezetter`.
- **`beschikbare_vervangers`:** alleen rijen voor een slotbezetter bij een gepubliceerde, lopende activiteit; de redenen; geen e-mail, telefoon of toelichting in het resultaat;
  een lid zonder slot krijgt niets; **pariteit:** elk lid met `beschikbaar = true` is met `ruil_dienst` overdraagbaar en elke `reden` komt overeen met `vervanger_afgemeld`
  of `dubbelboeking`.
- **`mijn_diensten`:** alleen eigen, geen bak, geen concept; geen lege plekken; de dienst van een ander niet; na een ruil verhuist de rij; **een beheerder op `aal2` ziet geen
  dienst buiten zijn doelgroep en geen concept** (de test van `mijn_activiteiten` als voorbeeld); `eindigt_om` zit in het resultaat.
- **Bewakers:** de aangepaste bewaker (punt 5); elk roltype heeft precies één van `ruilbaar_door_lid` en `alleen_admin`.
- **Rechten:** alle functies voor `anon` geweigerd; de naamlijsten in `rechten.test.sql` kennen ze; `intern.*` blijft dicht.
- **Gelijktijdig** (`e2e/ledenacties-gelijktijdig.spec.ts`, ook rood zonder de lock; bij "precies één slaagt" ook de eindtoestand: nooit een lid dat tegelijk afgemeld en ingedeeld is):
  twee afmeldingen bij 14 aanwezig en minimum 13 (de tweede wordt geweigerd); twee `meld_af`-aanroepen van hetzelfde lid (`al_afgemeld`, geen `23505`); een vervanger die
  zich afmeldt terwijl hij wordt aangewezen; twee overdrachten naar dezelfde vervanger voor verschillende slots (`dubbelboeking`); twee ruilen op hetzelfde slot; een ruil
  tegen `activiteit_opslaan` op hetzelfde slot (`slot_gewijzigd` of `geen_bezetter`, nooit een deadlock); een ruil naar B terwijl de beheerder B op een ander slot indeelt
  (`dubbelboeking`, exact één slaagt); een afmelding tegen een indeling door de beheerder.

### Dekkingsmatrix

| Regel of foutcode | Servertest | Browsertest | Scherm |
|---|---|---|---|
| R1, R12, R22 (wie telt mee) | `meld_af` telt alleen leden in de doelgroep | De teller op Start na afmelden | `welkom` |
| R2, R6, R20 | `ruil_dienst`, `dubbelboeking` | — | `ruilen-kies-vervanger` |
| R4, R23 | `heeft_adminrol`, `rol_niet_ruilbaar` | Leden met een beheerrol hebben geen knop | `welkom-bob` |
| R5, R14, R17 | `vervanger_afgemeld`, `vervanger_ongeldig`, pariteit | De lijst toont de reden | `ruilen-kies-vervanger` |
| R7 | `heeft_ruilbare_rol` | Afmelden met een dienst start de twee stappen | `afmelden-eerst-ruilen` |
| R8 | `onder_ondergrens` (grens, deadline) | Blokkade met tekst en telefoon | `afmelden-fout-ondergrens` |
| R9 | `trek_afmelding_in` | Intrekken vanaf Start en programma | `afmelding-ingetrokken` |
| R15, R16 | `activiteit_niet_open`, `activiteit_voorbij`, verborgen = onbekend | — | Terug naar Start |
| R22 (ook voor een beheerder) | `mijn_diensten` met `aal2` | — | `mijn-diensten` |
| V8 5.7 (Mijn diensten) | `mijn_diensten`, afmeldingen | De lijst, het blok Afgemeld en de lege staat | `mijn-diensten`, `mijn-diensten-leeg` |
| Gelijktijdigheid | `e2e/ledenacties-gelijktijdig.spec.ts` | — | — |

## 7. Besluiten van de bouwer (04-11-2026) en open punten

Na de review door een schone chat (04-11-2026) verwerkt: de versie bij `ruil_dienst` (was een tegenspraak met fase 2), het filter op de doelgroep in
`mijn_diensten`, de klok, de lock op het slot, `beschikbare_vervangers`, de pgTAP-bewakers en een lijst extra tests.

| # | Besluit |
|---|---|
| 3.1 | Een beheerder meldt zich als lid af; geen `aal2` nodig. Controle 4 kijkt naar elk ander slot |
| 3.2 | "Ondergrens staat aan" is `min_aanwezigen` niet leeg (BA-5); er komt geen aparte vlag |
| 3.3 | `ruil_dienst`, `meld_af` en `trek_afmelding_in` verhogen de versie **niet** (fase 2 besluit 1); `ruil_dienst` zet `bijgewerkt` met een no-op update |
| 3.4 | De vervanger moet de activiteit mogen zien (uitbreiding op UC-002), gelezen met `for share` |
| 3.5 | Een geannuleerde activiteit geeft bij intrekken `activiteit_niet_open` (afwijking van UC-003 en R9), met het gevolg uit 3.2 |
| 3.6 | Geen berichten in fase 3, alleen het log. **Open besluit met deadline 1 december 2026**, vóór pilot B (zie O-1) |
| 3.7 | De bak blijft buiten `mijn_diensten` en buiten de pilot A. Dit stelt besluit 2.4 van `Fase-2-plan.md` bij: de bak krijgt een eigen stap in het plan (stap G) vóór de eerste Bonte Avond op 15 januari 2027 |

**Open**

- **O-1** Berichten. UC-002 stap 9 en R18 vragen een bericht aan de vervanger bij een overdracht. Zonder bericht merkt een aangewezen lid het pas als hij de app opent
  (de afstemming buiten de app, R3, vangt het meestal op, maar niet altijd). Besluit vóór 1 december: `Bouwbesluiten` 5.3 (tabel `meldingen`, verzendtaak) vóór pilot B, óf pilot B draait
  zonder bericht en het bestuur licht de vervanger onderling in.
- **O-2** Schermen voor `geen_lid`, `activiteit_niet_open` en `geen_bezetter`: een korte tekst op Start volstaat; de ontwerper beoordeelt dat in stap C.
- **O-3** De wachtstand op de knoppen (F2-05) hoort bij de eerste knop met een gevolg: afmelden. Daar komt hij mee.
- **O-4** Ledenbeheer (fase 4) en `leden:zet` wijzigen `leden.actief` en `lid_groep` zonder de lock op de activiteit. Voor de vervanger sluit `for share` het gat; voor de
  telling van aanwezigen heeft fase 4 een eigen regel nodig (de lock nemen op de activiteiten waar het lid in de doelgroep zit, of de toets herhalen). Op de lijst "Van fase 3 naar fase 4".
- **O-4a** Lock-volgorde voor fase 4: ledenbeheer neemt eerst de locks op de activiteiten waar het lid in de doelgroep zit (in vaste volgorde, op id), en wijzigt daarna pas de
  `leden`-rijen. `ruil_dienst` neemt de activiteit en daarna `for share` op de vervanger; een pad dat eerst `leden` wijzigt en daarna de activiteit wil, kan een deadlock geven. Vandaag
  bestaat dat pad niet (`leden:zet` neemt geen activiteit-lock), maar een lang lopende `leden:zet`-transactie laat een ruil wel wachten.
- **O-5** De slothouder die een vervanger zoekt, ziet wie van de doelgroep zich heeft afgemeld of al is ingedeeld (`beschikbare_vervangers`). Dat is wat UC-002 vraagt, maar
  `afmeldingen` is voor leden verder privé: leg het aan de opdrachtgever voor als bewust gekozen. Toelichting, e-mail en telefoon lekken niet.
- **O-6** Besluit 3.5 wijkt af van R9 en UC-003 (een afmelding op een geannuleerde activiteit is niet meer in te trekken). Neem het mee bij de volgende ronde van `use-cases.md` in de ontwerpmap.
- **O-7** `beschikbare_vervangers.reden` is `null` bij `beschikbaar = true`; de gegenereerde types zeggen `string`. De code die de functie aanroept, behandelt `null` expliciet.
