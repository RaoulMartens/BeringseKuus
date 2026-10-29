# Datamodel en rechten, fase 1

Stand 29-10-2026. **Voorstel, wacht op de review door een schone chat (`Bouwbesluiten` 2) en het akkoord van de
bouwer.** Pas daarna komt de eerste migratie (`Fase-1-plan.md` stap B). Bronnen: bouwgids V8 hoofdstuk 3, 4, 5 en 7;
`Bouwbesluiten-2026-10-27.md` punt 1 en 4 (gaat voor); `docs/ux-flows/use-cases.md` (R1–R24, UC-001, UC-004);
de wireframes van fase 1.

Dit stuk legt vast: welke tabellen er komen, wie wat mag lezen en schrijven, welke databasefuncties fase 1 bouwt en met
welke foutcodes, en welke test elke regel bewijst. Het schema is dat van heel hoofdstuk 3 (V8 10: fase 1 is "database,
hoofdstuk 3"); de functies zijn alleen die van fase 1. Fase 2 en 3 bouwen erop door zonder het schema om te gooien.

## 1. Uitgangspunten

1. **Rollen.** `anon` (niet ingelogd) mag niets. `authenticated` is iedereen met een sessie; daarbinnen onderscheiden
   de regels een **lid** (een actief lid van type `lid`, gekoppeld via `auth_user_id`) en een **beheerder** (een lid
   met `is_admin` **én** een sessie met MFA, `aal2`; `Bouwbesluiten` 4.3). Een bestuurslid zonder `aal2` is gewoon
   lid. `service_role` gebruiken alleen de seed, de tests en later de taken-Worker. `postgres` voert de migraties uit.
2. **Lezen gaat via rechten per rij (RLS) op de tabellen; schrijven gaat alleen via databasefuncties.** `anon` en
   `authenticated` krijgen nergens `insert`, `update`, `delete` of `truncate` (de rechtentest bewaakt dat al). Elke
   schrijffunctie is `security definer`, met `set search_path = ''` en volledig gekwalificeerde namen.
3. **Eerst wie belt, dan wat er bestaat** (`Bouwbesluiten` 4.3). Een functie controleert eerst of de aanroeper het mag
   (lid of beheerder), daarna pas of de activiteit bestaat en in welke toestand. Voor een lid zien een onbekende en een
   verborgen activiteit er van buiten hetzelfde uit (R22).
4. **Alles of niets.** Een schrijffunctie draait in één transactie. Een fout gaat als `raise exception` met de foutcode
   als melding (`message`) en de bijzonderheden als JSON in `detail` (welke regel, welk veld). Daardoor rolt de database
   alles terug. De app vertaalt de foutcode naar het scherm uit de wireframes; een foutcode zonder scherm is een
   ontwerpgat (punt 7).
5. **Eén lock per activiteit.** Elke schrijffunctie die een bestaande activiteit raakt, neemt als eerste handeling na de
   rechtencontrole `select … from public.activiteiten where id = … for update` (V8 4.1, use-cases "Gelijktijdigheid").
6. **Auditlog in dezelfde transactie.** Elke schrijffunctie schrijft zelf haar regels in `wijzigingen_log` (V8 3.5), zodat
   een regel alleen bestaat als de wijziging bestaat.
7. **Eén tijdfunctie** voor "bezig", "geweest" en het einde, in `Europe/Amsterdam` (`Bouwbesluiten` 4.5, punt 4.4).
8. **`vereniging_id`** op de tabellen met eigen verenigingsgegevens, met de vaste Beringse-rij als standaardwaarde; RLS
   en functies kijken er nog niet naar (`Bouwbesluiten` 1). De tabellen die via een ouderrij bij een vereniging horen,
   staan op de lijst "afgeleid via ouder" in punt 2.

## 2. Tabellen

Alle tabellen in `public`, met RLS aan. Kolommen: **vet** = verplicht (`not null`). Standaardwaarden en controles
(`check`) staan erbij. "Lezen" is de RLS-regel voor `select`; schrijven staat alleen bij de functies in punt 4.

### 2.1 `verenigingen` en `verenigingsinstellingen`

| Tabel | Kolommen | Lezen |
|---|---|---|
| `verenigingen` | **`id`** uuid pk (vaste waarde voor Beringse, in de migratie), **`naam`** text | lid: alle rijen (één) |
| `verenigingsinstellingen` | **`vereniging_id`** uuid pk → `verenigingen`, `bus_vertrekplaats` text | lid: alle rijen (één) |

Geen beheerscherm in de pilot (V8 3.8); de waarde komt uit de seed. Later komen hier naam, motto, groet, seizoensnaam en
kleur bij. Een wijziging van de vertrekplaats is een melding (BA-4); dat hoort bij de functie die hem wijzigt, die er
in de pilot niet is.

### 2.2 `leden` en `leden_prive`

`Bouwbesluiten` 4.1 en 4.2: elk lid een eigen `id`, ook een externe helper; het inlogaccount apart; wat andere leden
niet mogen zien in een eigen tabel.

| Kolom (`leden`) | Type | Toelichting |
|---|---|---|
| **`id`** | uuid pk, `gen_random_uuid()` | Alle verwijzingen gaan hiernaar |
| **`vereniging_id`** | uuid → `verenigingen` | Standaard Beringse |
| `auth_user_id` | uuid, uniek, → `auth.users` `on delete set null` | Leeg bij een externe helper |
| **`voornaam`**, **`achternaam`** | text, niet leeg | |
| **`type`** | text, `check in ('lid', 'extern')` | |
| **`actief`** | boolean, standaard `true` | Uitschrijven = `false`, nooit verwijderen (V8 3.1) |
| **`aangemaakt`** | timestamptz, `now()` | |

`check (type = 'lid' or auth_user_id is null)`: een externe helper logt niet in.

| Kolom (`leden_prive`) | Type | Toelichting |
|---|---|---|
| **`lid_id`** | uuid pk → `leden` `on delete cascade` | Eén rij per lid |
| `email` | text, uniek (kleine letters, `check (email = lower(email))`) | Ook van een externe helper (V8 3.1, uniek over iedereen) |
| `telefoon` | text | Nodig voor de eindverantwoordelijke (R21, fase 2) |
| **`is_admin`** | boolean, standaard `false` | Bestuurslid |
| **`mag_bob`**, **`mag_eindverantw`** | boolean, standaard `false` | Hulp bij het kiezen (R19) |

**Afwijking van V8 3.1, ter beslissing (punt 8, vraag 1):** `is_admin`, `mag_bob` en `mag_eindverantw` staan in
`leden_prive`, niet in `leden`. Reden: rechten per rij werken per rij, niet per kolom; wat in `leden` staat, ziet elk
lid van elk ander lid. Of iemand BOB mag zijn (rijbewijs) of bestuurslid is, hoeft een ander lid niet te weten.
`Bouwbesluiten` 4.2 zegt al: `leden` bevat wat andere leden mogen zien.

**De agendavelden** (`agenda_token`, `agenda_token_versie`, `agenda_laatst_opgehaald`) komen pas in fase 7. Dan moet ook
een tegenspraak worden beslist: het Fase-0-plan (review PR11) zegt "een hash van het token bewaren", `Bouwbesluiten` 5.4
zegt "tokens gehasht opslaan: niet overgenomen".

Lezen:

| Tabel | Lid | Beheerder |
|---|---|---|
| `leden` | Alle rijen, maar **alleen de kolommen** `id`, `voornaam`, `achternaam`, `type`, `actief` (rechten per kolom: `grant select (…)`). Nodig om de rolbezetting met namen te tonen (V8 7.1) | Idem; de beheerschermen lezen de rest via `leden_prive` |
| `leden_prive` | Alleen de eigen rij | Alle rijen |

`auth_user_id` en `vereniging_id` krijgt `authenticated` niet: die leest alleen `huidig_lid()` (punt 3).

### 2.3 Groepen (V8 3.6, R22)

| Tabel | Kolommen | Lezen (lid) | Lezen (beheerder) |
|---|---|---|---|
| `groepen` | **`id`** uuid pk, **`vereniging_id`**, **`naam`** text (uniek per vereniging), **`volgorde`** int | Alle rijen (het programma toont "Alleen bestuur") | Alle rijen |
| `lid_groep` | **`lid_id`** → `leden` cascade, **`groep_id`** → `groepen` cascade; pk op beide | Alleen eigen rijen | Alle rijen (aantallen per groep in de keuzelijst) |
| `activiteit_groep` | **`activiteit_id`** → `activiteiten` cascade, **`groep_id`** → `groepen` restrict; pk op beide | Alleen rijen van activiteiten die het lid mag zien | Alle rijen |

Geen rijen in `activiteit_groep` = iedereen. De zichtbaarheid toetst `mag_activiteit_zien()` (punt 3), die alle rijen
leest; een lid dat een rij niet ziet, kan dus nooit "geen rijen = iedereen" afleiden (`Bouwbesluiten` 4.3). Groep is geen
recht: beheerrechten hangen aan `is_admin` (V8 3.6).

### 2.4 `activiteiten` (V8 3.2)

| Kolom | Type | Toelichting |
|---|---|---|
| **`id`** | uuid pk | |
| **`vereniging_id`** | uuid | |
| **`naam`** | text, niet leeg | |
| **`datum`** | date | |
| `verzameltijd` | time | |
| **`starttijd`** | time | Altijd verplicht (UC-004 AF-4); zie vraag 2 |
| `eindtijd` | time | Mag leeg in een concept; verplicht om te publiceren (R21, fase 2). Vóór de starttijd = de volgende dag (R16) |
| **`locatie`** | text, niet leeg | Altijd verplicht (UC-004 AF-4) |
| `bus_vertrektijd` | time | Leeg = geen bus |
| `bus_locatie` | text | Leeg = de standaard uit `verenigingsinstellingen` |
| `notitie` | text | "Belangrijk om te weten" |
| **`type`** | text, `check in ('seizoen', 'oud_papier')`, standaard `seizoen` | De admin kiest het niet (UC-004 stap 5) |
| **`seizoen`** | int | Beginjaar; zie hieronder |
| **`status`** | text, `check in ('concept', 'gepubliceerd', 'geannuleerd')`, standaard `concept` | Eén richting (V8 3.2), bewaakt door de functies |
| `afmeld_deadline` | timestamptz | Leeg = vrij afmelden (R8) |
| `min_aanwezigen` | int, `check (min_aanwezigen >= 1)` | Leeg = uit. Standaard 13 bij `seizoen`, leeg bij `oud_papier` (V8 3.2) |
| **`bak_actief`** | boolean, standaard `false` | Fase 2 (V8 3.7) |
| `bron_activiteit_id` | uuid → `activiteiten` `on delete set null` | Fase 9 |
| **`aangemaakt`**, **`bijgewerkt`** | timestamptz | `bijgewerkt` zet de functie bij elke wijziging (agenda, fase 7: `LAST-MODIFIED`) |

**Seizoen.** Het systeem rekent het uit de datum: augustus tot en met december → dat jaar, januari tot en met juli → het
jaar ervoor. Zo krijgen de ledenvergadering (8 maart 2027) en de feestavond (22 mei 2027) seizoen 2026 (V8 13.1). Een
aanname (vraag 3).

Lezen:

| Lid | Beheerder |
|---|---|
| Rijen waarvoor `mag_activiteit_zien(id)`: status `gepubliceerd` of `geannuleerd`, en de doelgroep is leeg of het lid zit in een van de groepen (R15, R22, V8 7.1). Een concept nooit | Alle rijen, ook concepten (V8 7.1: in het programma ziet de beheerder een concept met het label "concept") |

Niet in fase 1: `versie` (`Bouwbesluiten` 5.1, besluit vóór fase 2).

### 2.5 `roltypen` (BA-6, aanname: tabel)

| Kolom | Type |
|---|---|
| **`code`** | text pk: `werker`, `drankhaler`, `fotograaf`, `bob`, `eindverantwoordelijke`, `bak` |
| **`naam`** | text (zoals op het scherm) |
| **`ruilbaar_door_lid`** | boolean (werker, drankhaler, fotograaf) |
| **`alleen_admin`** | boolean (bob, eindverantwoordelijke, bak) |
| **`volgorde`** | int |

Gedeeld, zonder `vereniging_id`: eigen rollen per vereniging zijn de latere ombouw (`Bouwbesluiten` 1). Lezen: lid en
beheerder alle rijen. Gevuld in de migratie, niet in de seed: de functies hangen ervan af.

### 2.6 `rol_slots` (V8 3.3)

| Kolom | Type | Toelichting |
|---|---|---|
| **`id`** | uuid pk | |
| **`activiteit_id`** | uuid → `activiteiten` `on delete cascade` | |
| **`rol_type`** | text → `roltypen(code)` | |
| `bezetter_id` | uuid → `leden` `on delete restrict` | Leeg = open plek. Een lid wordt nooit verwijderd (`actief = false`) |
| `plek_label` | text, `check (plek_label in ('prins', 'adjudant', 'vorst', 'raadslid'))` | Alleen bij `bak`: `check ((rol_type = 'bak') = (plek_label is not null))` |
| **`volgorde`** | int | Volgorde op het scherm |

- **Geen dubbelboeking:** `unique (activiteit_id, bezetter_id) deferrable initially deferred` (V8 3.3; lege bezetters
  botsen niet).
- **Precies één eindverantwoordelijke:** een unieke index op `activiteit_id` waar `rol_type = 'eindverantwoordelijke'`
  (hooguit één), en `activiteit_opslaan` maakt hem bij het aanmaken (minstens één; `Bouwbesluiten` 4.4). Weghalen kan
  niet (punt 4).

Lezen:

| Lid | Beheerder |
|---|---|
| Alleen **bezette** plekken (R13) van activiteiten die het lid mag zien | Alle plekken |

### 2.7 `afmeldingen` (V8 3.4)

| Kolom | Type |
|---|---|
| **`id`** | uuid pk |
| **`activiteit_id`** | uuid → `activiteiten` `on delete cascade` |
| **`lid_id`** | uuid → `leden` `on delete restrict` |
| `toelichting` | text (alleen voor het bestuur, V8 3.4) |
| **`aangemaakt`** | timestamptz |

`unique (activiteit_id, lid_id)`. Lezen: een lid alleen de eigen afmeldingen (ook de eigen toelichting); de beheerder
alle. De afmeldingen van anderen zijn voor een lid niet nodig: of een vervanger beschikbaar is, geeft
`beschikbare_vervangers()` in fase 3 terug, zonder privévelden (`Bouwbesluiten` 4.2). In fase 1 schrijft er nog niets
in; de tabel bestaat, zodat het aantal aanwezigen klopt (de seed vult een paar afmeldingen).

### 2.8 `wijzigingen_log` (V8 3.5, `Bouwbesluiten` 4.6)

| Kolom | Type | Toelichting |
|---|---|---|
| **`id`** | bigint, `generated always as identity` | |
| **`vereniging_id`** | uuid | Eigen kolom: na het verwijderen van een concept bestaat de activiteit niet meer (`Bouwbesluiten` 1) |
| **`moment`** | timestamptz, `now()` | |
| `door_lid_id` | uuid → `leden` `on delete set null` | |
| **`actie`** | text | Bijvoorbeeld `activiteit_aangemaakt`, `concept_verwijderd` |
| **`tabel`**, `rij_id` | text, uuid | Geen verwijzing: de rij kan weg zijn |
| **`omschrijving`** | text | Leesbaar: "Jeugdmiddag (za 6 februari 2027) aangemaakt als concept" |

Geen afmeldtoelichtingen of andere privévelden erin (`Bouwbesluiten` 4.6). Lezen: alleen de beheerder (V8 7.1).

### 2.9 Niet in fase 1

`meldingen` (`Bouwbesluiten` 5.3, fase 7), de agendavelden (fase 7), `wil_ruilen` (V8 4.3, fase 5) en `versie` (fase 2).

### 2.10 Vereniging per tabel

Eigen kolom `vereniging_id`: `leden`, `groepen`, `activiteiten`, `wijzigingen_log`, `verenigingsinstellingen` (als
sleutel). Afgeleid via een ouder: `leden_prive` en `lid_groep` (via `leden`), `rol_slots`, `afmeldingen` en
`activiteit_groep` (via `activiteiten`). Gedeeld: `verenigingen`, `roltypen`. Een databasetest eist dat elke tabel in
`public` op precies één van die drie lijsten staat (`Bouwbesluiten` 1).

## 3. Hulpfuncties

Allemaal `security definer`, `stable`, `set search_path = ''`, eigenaar `postgres`. `execute` alleen voor
`authenticated` (de RLS-regels roepen ze aan), niet voor `anon` of `public`.

| Functie | Geeft | Regel |
|---|---|---|
| `huidig_lid()` | uuid of leeg | Het lid met `auth_user_id = auth.uid()`, `actief` en `type = 'lid'`. Leeg voor iemand zonder lid (`Bouwbesluiten` 4.1). Alle regels en functies gebruiken deze, nooit rechtstreeks `auth.uid()` |
| `is_beheerder()` | boolean | `huidig_lid()` heeft `is_admin` in `leden_prive` **en** `auth.jwt() ->> 'aal' = 'aal2'` (`Bouwbesluiten` 4.3) |
| `mag_activiteit_zien(activiteit_id)` | boolean | Beheerder: ja. Anders: er is een `huidig_lid()`, de status is `gepubliceerd` of `geannuleerd`, en er is geen `activiteit_groep`-rij of het lid zit in een van die groepen |
| `activiteit_einde(datum, starttijd, eindtijd)` | timestamptz | `datum + eindtijd` in `Europe/Amsterdam`, een dag later als `eindtijd < starttijd`. Zonder eindtijd: het einde van de dag (`datum + 1 dag, 00:00`) |
| `activiteit_geweest(activiteit_id, moment default now())` | boolean | `moment >= activiteit_einde(…)` (R16) |

`activiteit_einde` is `immutable` (geen `now()`), zodat de tests rond middernacht, het deadlinemoment en de zomertijd
(`Bouwbesluiten` 4.5) een vast moment kunnen meegeven.

## 4. Schrijffuncties in fase 1

Alleen `execute` voor `authenticated`. Rechtstreeks schrijven in de tabellen kan niet (uitgangspunt 2).

### 4.1 `activiteit_opslaan(activiteit_id uuid, velden jsonb, wijzigingen jsonb, publiceren boolean) returns jsonb`

De handtekening van V8 4.4, zodat fase 2 hem uitbreidt in plaats van vervangt. Fase 1 doet het **aanmaken** en het
**wijzigen van een concept**; de rest geeft `niet_ondersteund` (geen scherm: de app stuurt het in fase 1 niet).

1. `is_beheerder()`, anders `geen_admin`.
2. **Aanmaken** (`activiteit_id` leeg): nieuwe rij met status `concept`, type `seizoen`, `min_aanwezigen` 13 tenzij
   `velden` anders zegt, seizoen uit de datum, en **precies één lege plek eindverantwoordelijke** (`Bouwbesluiten` 4.4).
   **Wijzigen** (`activiteit_id` gevuld): lock op de rij; bestaat hij niet, dan `activiteit_onbekend`; is hij geen
   concept, dan `niet_ondersteund` (gepubliceerd wijzigen is fase 2).
3. `velden`: alleen de toegestane sleutels (`naam`, `datum`, `verzameltijd`, `starttijd`, `eindtijd`, `locatie`,
   `bus_vertrektijd`, `bus_locatie`, `notitie`, `afmeld_deadline`, `min_aanwezigen`, `groepen`). Een onbekende sleutel
   of een waarde van het verkeerde soort geeft `veld_ongeldig` met de naam van het veld. Na het bijwerken moeten
   `naam`, `datum`, `starttijd` en `locatie` gevuld zijn, anders `veld_ontbreekt` met de namen (UC-004 AF-4). `groepen`
   is de volledige nieuwe lijst groep-id's; leeg = iedereen; een onbekende id geeft `groep_onbekend`.
4. `wijzigingen`: in fase 1 alleen `plek_toevoegen` (`rol_type` in `werker`, `drankhaler`, `fotograaf`, `bob`, met een
   `tijdelijk_id`) en `plek_weghalen` (`rol_slot_id`; de plek hoort bij deze activiteit, anders `plek_onbekend`
   (`Bouwbesluiten` 4.4); is leeg, anders `plek_niet_leeg`; is geen eindverantwoordelijke, anders
   `eindverantwoordelijke_verplicht`). `toewijzen`, `leegmaken`, de bak en `publiceren = true` geven `niet_ondersteund`.
5. `bijgewerkt` op `now()`, één regel per handeling in `wijzigingen_log`.
6. Geeft terug: `{ "activiteit_id": …, "plekken": { "<tijdelijk_id>": "<rol_slot_id>" } }`.

Geen meldingen: een concept ziet niemand (R18).

### 4.2 `concept_verwijderen(activiteit_id uuid) returns jsonb` (V8 4.6)

`is_beheerder()` anders `geen_admin`; lock; bestaat niet → `activiteit_onbekend`; status is geen `concept` →
`alleen_concept` (niets verwijderd); dan verwijderen (de plekken, de doelgroep en eventuele afmeldingen gaan mee via
`on delete cascade`), één regel in `wijzigingen_log` met naam en datum. Geeft terug `{ "naam": …, "datum": … }` voor de
melding "Jeugdmiddag is verwijderd". Geen meldingen (R18). Een verwijderd concept komt niet terug (`Bouwbesluiten` 4.6).

## 5. Leesfuncties en wat de schermen lezen

| Scherm (wireframe) | Wat het leest | Hoe |
|---|---|---|
| `welkom`, `welkom-leeg`, `welkom-twee` | De activiteiten van vandaag die nog niet geweest zijn, anders de eerstvolgende (UC-001; `Bouwbesluiten` 4.5: wat gisteren begon en nog loopt, blijft staan); de vertrekplaats van de bus | `activiteiten` met RLS, gefilterd op `activiteit_einde(…) > now()`, plus `verenigingsinstellingen` |
| `programma` | Alle zichtbare activiteiten van het seizoen, komend en geweest, met "Alleen bestuur" bij een doelgroep; de beheerder ziet ook concepten | `activiteiten`, `activiteit_groep`, `groepen` met RLS |
| Activiteitscherm voor leden (`activiteit-optocht`) | Eén activiteit; onbekend of verborgen geeft hetzelfde "niet gevonden" | `activiteiten` met RLS |
| `admin-activiteiten` (tellers en taken) | Per komende, niet-geannuleerde activiteit: lege plekken per rol, eindtijd en eindverantwoordelijke ingevuld, aantal aanwezigen, minimum | `beheeroverzicht()`: `security definer`, eerst `is_beheerder()` anders `geen_admin`. De taak in woorden maakt de app uit deze getallen; de tellers ook, uit dezelfde rijen (V8 5.6) |
| `admin-activiteit-nieuw`, `-voor-wie-concept` | De groepen met het aantal leden | `groepen` en `lid_groep` met RLS (de beheerder leest alle rijen) |
| `admin-concept-verwijderen` | Naam, datum en het aantal ingedeelde leden | `activiteiten` en `rol_slots` met RLS |

**Aanwezigen** (R1, R12, R22, V8 5.6): actieve leden van type `lid` in de doelgroep (iedereen, of de leden van minstens
één van de groepen, elk één keer), min de afmeldingen. Eén interne functie `aantal_aanwezigen(activiteit_id)` (geen
`execute` voor `authenticated`), die `beheeroverzicht()` nu gebruikt en `meld_af()` in fase 3. "Bijna te weinig" (minimum
+ 1) is een constante in de app (V8 5.6).

## 6. Rechten in één overzicht

| Tabel | anon | lid lezen | beheerder lezen | schrijven |
|---|---|---|---|---|
| `verenigingen`, `verenigingsinstellingen`, `roltypen`, `groepen` | — | alles | alles | migratie of seed |
| `leden` | — | alle rijen, vijf kolommen | idem | fase 4 (ledenimport); in de pilot de seed of de beheerder met de hand |
| `leden_prive` | — | eigen rij | alles | idem |
| `lid_groep` | — | eigen rijen | alles | idem |
| `activiteiten` | — | zichtbaar (R15, R22) | alles | `activiteit_opslaan`, `concept_verwijderen` |
| `activiteit_groep` | — | van zichtbare activiteiten | alles | `activiteit_opslaan` |
| `rol_slots` | — | bezet, van zichtbare activiteiten (R13) | alles | `activiteit_opslaan` (fase 2 ook toewijzen; fase 3 `ruil_dienst`) |
| `afmeldingen` | — | eigen | alles | fase 3 (`meld_af`, `trek_afmelding_in`) |
| `wijzigingen_log` | — | — | alles | alleen de functies |

**Dus lijsten in de rechtentest** (`supabase/tests/database/rechten.test.sql`): de tabellen hierboven staan op de lijst
"bewust leesbaar voor ingelogd", met deze reden; de functies uit punt 3, 4 en `beheeroverzicht()` op de lijst "bewust uit
te voeren door ingelogd". Niets voor `anon`.

## 7. Foutcodes van fase 1

| Foutcode | Wanneer | Scherm |
|---|---|---|
| `geen_admin` | Geen beheerder (geen `is_admin` of geen `aal2`) | **Ontwerpgat:** de beheerschermen zijn voor een niet-beheerder niet bereikbaar, maar een sessie zonder MFA of een ingetrokken `is_admin` kan er wel staan. Voorstel: naar het MFA-scherm (stap D) of terug naar Start; wireframe nodig |
| `veld_ontbreekt` | Verplicht veld leeg | Het veld gemarkeerd, zoals "Vul een eindtijd in." in `admin-activiteit-voor-wie-concept` |
| `veld_ongeldig` | Verkeerd soort waarde | Idem; de app voorkomt het meestal al |
| `groep_onbekend` | Groep bestaat niet (meer) | **Ontwerpgat** (zeldzaam: er is geen groepenbeheer) |
| `activiteit_onbekend` | De activiteit is er niet (meer), bijvoorbeeld door een ander bestuurslid verwijderd | **Ontwerpgat** |
| `alleen_concept` | Verwijderen terwijl een ander bestuurslid hem net publiceerde | **Ontwerpgat** (UC-004 AF-10 noemt de code, geen scherm) |
| `plek_onbekend`, `plek_niet_leeg`, `eindverantwoordelijke_verplicht` | Plek hoort niet bij deze activiteit, is bezet, of is de eindverantwoordelijke | De app laat het niet toe (× alleen bij een lege plek); geen scherm nodig |
| `niet_ondersteund` | Een handeling van fase 2 of later | Geen: de app stuurt hem in fase 1 niet |

## 8. Vragen aan de bouwer

1. **Vlaggen in `leden_prive`** (punt 2.2), afwijkend van V8 3.1. Akkoord?
2. **Verplichte velden van een concept.** UC-004 AF-4 en V8 4.5 zeggen: naam, datum, starttijd en locatie zijn altijd
   verplicht. De wireframes `admin-activiteit-nieuw` en `-voor-wie-concept` zeggen: "Velden met * zijn verplicht om te
   kunnen publiceren. Opslaan als concept kan altijd, ook halfaf." Dit voorstel volgt UC-004 en V8 (de bronvolgorde,
   `Bouwbesluiten` 7); de tekst in de wireframe moet dan mee. Of: alleen naam en datum verplicht in een concept.
3. **Seizoen uit de datum** (augustus–december dat jaar, anders het jaar ervoor). Akkoord, of een vaste instelling?
4. **Plekken in fase 1.** Het aanmaakscherm toont de rolbezetting. Dit voorstel laat fase 1 lege plekken toevoegen en
   weghalen, en mensen kiezen pas in fase 2. Het scherm van fase 1 toont dan plekken zonder "Kies iemand…". Akkoord?

## 9. Tests (pgTAP en browsertests)

Elke regel hieronder krijgt een test die eerst rood is. De negatieve tests draaien als **beide** soorten gebruiker:
een lid (sessie met `aal1`) en een beheerder (`aal2`), via `set local role authenticated` en `request.jwt.claims`.

**Rechten op tabellen**
- `anon` leest en schrijft niets (de algemene rechtentest).
- Een lid: leest geen concept, ook niet via een directe `select` op `activiteiten`, `rol_slots` of `activiteit_groep`
  (V8 12, `Bouwbesluiten` 4.2); leest geen activiteit van een doelgroep waar hij niet in zit (R22); leest geen lege plek
  (R13); leest van `leden` geen `auth_user_id`; leest geen `leden_prive` van een ander; leest geen afmelding of
  toelichting van een ander; leest niets uit `wijzigingen_log`; leest geen `lid_groep` van een ander.
- Een bestuurslid **zonder** `aal2` ziet hetzelfde als een lid, en `activiteit_opslaan` en `concept_verwijderen` geven
  `geen_admin`.
- Een lid in twee groepen ziet een activiteit van elk van beide; telt één keer als aanwezig.
- Elke tabel heeft `vereniging_id` of staat op de lijst "afgeleid" of "gedeeld" (punt 2.10).

**`activiteit_opslaan`**
- Een lid krijgt `geen_admin` en er is niets aangemaakt, ook geen logregel.
- Aanmaken: status concept, type seizoen, minimum 13, seizoen 2026 voor 15 januari 2027 en voor 22 mei 2027, precies één
  lege eindverantwoordelijke, één logregel.
- Ontbrekende naam, datum, starttijd of locatie: `veld_ontbreekt`, niets aangemaakt.
- Onbekende sleutel in `velden`: `veld_ongeldig`. Onbekende groep: `groep_onbekend`.
- Plek toevoegen en in dezelfde aanroep een tweede: beide er, met hun echte id in het antwoord.
- Een plek van een andere activiteit weghalen: `plek_onbekend`, niets veranderd (`Bouwbesluiten` 4.4).
- De eindverantwoordelijke weghalen: `eindverantwoordelijke_verplicht`.
- Een gepubliceerde activiteit wijzigen, `toewijzen`, of `publiceren = true`: `niet_ondersteund`.
- Een fout in de laatste regel van `wijzigingen`: ook de velden en de eerdere regels zijn niet doorgevoerd.

**`concept_verwijderen`**
- Lid: `geen_admin`. Gepubliceerd: `alleen_concept`, en de activiteit bestaat nog.
- Concept: weg, met plekken en doelgroep, één logregel met naam en datum, geen andere tabellen geraakt.

**Tijd** (`activiteit_einde`, `activiteit_geweest`)
- Eindtijd vóór de starttijd (Bonte Avond 20:11–01:11): einde de volgende dag.
- Rond middernacht, op het exacte eindmoment (geweest), en rond de overgang naar zomertijd (28 maart 2027) en
  wintertijd (31 oktober 2027).

**Aanwezigen en beheeroverzicht**
- Iedereen-activiteit: actieve leden van type lid min afmeldingen; een externe helper en een inactief lid tellen niet
  mee (R1, R12).
- Groepsactiviteit: alleen de doelgroep, een lid in twee groepen één keer.
- `beheeroverzicht()`: het aantal lege plekken is gelijk aan het aantal lege `rol_slots` van komende, niet-geannuleerde
  activiteiten (V8 12, 5.6).

**Browsertests (fase 1)**: een lid ziet in het programma geen concept en geen activiteit van een andere groep; een
beheerder met `aal2` maakt een concept aan, ziet het met het label "concept", en verwijdert het; zonder `aal2` komt hij
niet in het beheer.

## 10. Seed (V8 13.5)

Alleen lokaal en in het ontwikkelproject, nooit met echte gegevens (`Bouwbesluiten` 4.3): het programma 2026/2027 (28
regels, 32 activiteiten: de verkoop van donateurskaarten is vijf dagen), als concept met type seizoen; een paar daarvan
gepubliceerd met verzonnen tijden, zodat de ledenschermen iets tonen. Verzonnen leden (de namen uit het prototype),
één beheerder, de vier groepen, een paar afmeldingen, en de vertrekplaats van de bus. De seed draait als
`service_role` en mag daarom rechtstreeks in de tabellen schrijven; de app nooit.

## 11. Dekkingsmatrix fase 1 (`Bouwbesluiten` 4.7)

| Regel | Servertest | Browsertest | Scherm |
|---|---|---|---|
| R1, R12 (aanwezigen) | Aanwezigen en beheeroverzicht | — | `admin-activiteiten` ("N aanwezig") |
| R13 (lege plekken verborgen) | Rechten op `rol_slots` | — (fase 2: rolbezetting) | — |
| R15 (concept niet zichtbaar) | Rechten op `activiteiten` | Programma als lid | `programma` |
| R16 (geweest) | Tijd | Welkom toont een lopende activiteit | `welkom` |
| R18 (geen meldingen bij een concept) | Er bestaat geen meldingentabel; `activiteit_opslaan` schrijft alleen in `wijzigingen_log` | — | — |
| R22 (doelgroep) | Rechten op `activiteiten` en `activiteit_groep`, lid in twee groepen | Programma als lid buiten de groep | `programma-raadslid` |
| V8 4.6 (concept verwijderen) | `concept_verwijderen` | Verwijderen als beheerder | `admin-concept-verwijderen`, `admin-activiteiten-verwijderd` |
| `Bouwbesluiten` 4.3 (MFA) | Bestuurslid zonder `aal2` | Zonder `aal2` geen beheer | MFA-schermen (ontwerpgat, stap D) |
| `Bouwbesluiten` 4.4 (één eindverantwoordelijke, plek van een andere activiteit) | `activiteit_opslaan` | — | — |
| `Bouwbesluiten` 4.5 (tijd) | Tijd | — | — |
