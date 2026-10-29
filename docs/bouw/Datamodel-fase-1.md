# Datamodel en rechten, fase 1

Stand 29-10-2026, **versie 2**: de review door een schone chat (`Bouwbesluiten` 2; 19 bevindingen DM-01 t/m DM-19,
oordeel "niet akkoord, dichtbij") is verwerkt, en de bouwer heeft de vier vragen beslist (punt 8). Wacht op de controle
van de gewijzigde punten door de reviewer en het akkoord van de bouwer; pas daarna komt de eerste migratie
(`Fase-1-plan.md` stap B). Bronnen: bouwgids V8 hoofdstuk 3, 4, 5 en 7; `Bouwbesluiten-2026-10-27.md` punt 1 en 4 (gaat
voor); `docs/ux-flows/use-cases.md` (R1–R24, UC-001, UC-004); de wireframes van fase 1.

Dit stuk legt vast: welke tabellen er komen, wie wat mag lezen en schrijven, welke databasefuncties fase 1 bouwt en met
welke foutcodes, en welke test elke regel bewijst. Het schema is dat van heel hoofdstuk 3 (V8 10: fase 1 is "database,
hoofdstuk 3"); de functies zijn alleen die van fase 1. Fase 2 en 3 bouwen erop door zonder het schema om te gooien.

## 1. Uitgangspunten

1. **Rollen.** `anon` (niet ingelogd) mag niets. `authenticated` is iedereen met een sessie; daarbinnen onderscheiden
   de regels een **lid** (`intern.huidig_lid()` is niet leeg: een actief lid van type `lid`, gekoppeld via
   `auth_user_id`) en een **beheerder** (`intern.is_beheerder()`, punt 3). Wie een sessie heeft maar geen actief lid is
   (uitgeschreven met een nog geldige sessie, een ongekoppeld account), leest **niets** (DM-02). `service_role` en
   `postgres` gebruiken alleen de seed, de tests, de migraties en later de taken-Worker.
2. **Lezen gaat via rechten per rij (RLS) op de tabellen; schrijven gaat alleen via databasefuncties.** `anon` en
   `authenticated` krijgen nergens `insert`, `update`, `delete` of `truncate` (de rechtentest bewaakt dat al).
3. **Twee schema's.** In `public` staan de tabellen en alleen de functies die de app aanroept (`activiteit_opslaan`,
   `concept_verwijderen`, `beheeroverzicht`) en de view `mijn_activiteiten`. De hulpfuncties staan in een eigen schema
   **`intern`**, dat de Data API niet openzet (`[api] schemas` blijft `public` en `graphql_public`; `controle:poort`
   bewaakt dat). Zo zijn ze niet als `/rest/v1/rpc/…` aan te roepen: een hulpfunctie die een lid vraagt "is deze
   activiteit al geweest?" zou anders verraden dat een concept bestaat (DM-01). `authenticated` krijgt `usage` op
   `intern` en `execute` op precies de functies die de RLS-regels nodig hebben.
4. **`security definer` waar het moet, en waarom.** De hulpfuncties die tabellen lezen, zijn `security definer` met
   eigenaar `postgres` (die RLS overslaat). Als `security invoker` roept de regel op `activiteiten` zichzelf
   eindeloos aan (nagegaan in de review, DM-18). Altijd met `set search_path = ''` en volledig gekwalificeerde namen.
   Functies die niets lezen (de tijdfuncties) zijn `immutable` zonder definer. In de RLS-regels staat `(select
   intern.is_beheerder())`, zodat Postgres hem één keer per query uitrekent in plaats van per rij.
5. **Eerst wie belt, dan wat er bestaat** (`Bouwbesluiten` 4.3). Een functie controleert eerst of de aanroeper het mag,
   daarna pas of de activiteit bestaat en in welke toestand. Voor een lid zien een onbekende en een verborgen activiteit
   er van buiten hetzelfde uit (R22).
6. **Alles of niets, met eigen foutcodes.** Een schrijffunctie draait in één transactie. Een fout gaat als `raise
   exception using errcode = 'BK001', message = '<foutcode>', detail = '<json>'`; de eigen SQLSTATE `BK001` maakt een
   bedoelde fout herkenbaar tegenover een onverwachte (DM-13). De database rolt alles terug. De functie controleert elk
   veld zelf vóór het schrijven; de `check`-regels in de tabellen zijn alleen het vangnet, zodat de app nooit een kale
   SQLSTATE als `23514` of `22007` krijgt. De app vertaalt de foutcode naar het scherm uit de wireframes; een foutcode
   zonder scherm is een ontwerpgat (punt 7).
7. **Eén lock per activiteit, en de tijd ná de lock.** Elke schrijffunctie die een bestaande activiteit raakt, neemt na
   de rechtencontrole als eerste `select … from public.activiteiten where id = … for update` (V8 4.1). Daarna zet ze
   `v_nu := clock_timestamp()` en toetst alles met díe tijd, niet met `now()` (dat is het begin van de transactie,
   vóór het wachten op de lock; `Bouwbesluiten` 4.5, DM-05).
8. **Auditlog in dezelfde transactie.** Elke schrijffunctie schrijft zelf haar regels in `wijzigingen_log` (V8 3.5).
9. **Vangnet in de database** (DM-14). Twee triggers op `activiteiten`, voor wie buiten de functies om schrijft (seed,
   SQL-editor, later de taken-Worker): de status gaat alleen concept → gepubliceerd → geannuleerd (of concept →
   geannuleerd, V8 5.4), en `bijgewerkt` wordt bij elke wijziging gezet; verwijderen kan alleen bij status `concept`.
10. **`vereniging_id`** op de tabellen met eigen verenigingsgegevens, met de vaste Beringse-rij als standaardwaarde; RLS
    en functies kijken er nog niet naar (`Bouwbesluiten` 1). Zie punt 2.10.

## 2. Tabellen

Alle tabellen in `public`, met RLS aan. Kolommen: **vet** = verplicht (`not null`). "Lezen" is de RLS-regel voor
`select`; "lid" betekent steeds: er is een `intern.huidig_lid()` (uitgangspunt 1). Schrijven staat in punt 4.

### 2.1 `verenigingen` en `verenigingsinstellingen`

| Tabel | Kolommen | Lezen |
|---|---|---|
| `verenigingen` | **`id`** uuid pk (vaste waarde voor Beringse, in de migratie), **`naam`** text | lid: alle rijen (één) |
| `verenigingsinstellingen` | **`vereniging_id`** uuid pk → `verenigingen`, `bus_vertrekplaats` text | lid: alle rijen (één) |

Geen beheerscherm in de pilot (V8 3.8); de waarde komt uit de seed. Later komen hier naam, motto, groet, seizoensnaam,
kleur en de maand waarin het seizoen begint bij.

### 2.2 `leden` en `leden_prive`

`Bouwbesluiten` 4.1 en 4.2: elk lid een eigen `id`, ook een externe helper; het inlogaccount apart; wat andere leden
niet mogen zien in een eigen tabel.

| Kolom (`leden`) | Type | Toelichting |
|---|---|---|
| **`id`** | uuid pk, `gen_random_uuid()` | Alle verwijzingen gaan hiernaar |
| **`vereniging_id`** | uuid → `verenigingen` | Standaard Beringse |
| `auth_user_id` | uuid, uniek, → `auth.users` `on delete set null` | Leeg bij een externe helper |
| **`voornaam`**, **`achternaam`** | text, `check (… <> '')` | |
| **`type`** | text, `check in ('lid', 'extern')` | |
| **`actief`** | boolean, standaard `true` | Uitschrijven = `false`, nooit verwijderen (V8 3.1) |
| **`aangemaakt`** | timestamptz, `now()` | |

`check (type = 'lid' or auth_user_id is null)`: een externe helper logt niet in.

| Kolom (`leden_prive`) | Type | Toelichting |
|---|---|---|
| **`lid_id`** | uuid pk → `leden` `on delete cascade` | Eén rij per lid |
| **`email`** | text, uniek, `check (email = lower(email))` | Verplicht, ook voor een externe helper (V8 3.1 en 9, DM-15). De bron voor meldingen; het adres in `auth.users` is alleen voor het inloggen. Gelijk houden: fase 4 |
| `telefoon` | text | Nodig voor de eindverantwoordelijke (R21, fase 2) |
| **`is_admin`** | boolean, standaard `false` | Bestuurslid |
| `beheerder_sinds` | timestamptz | Wanneer `is_admin` aanging; zie punt 3 en DM-09 |
| **`mag_bob`**, **`mag_eindverantw`** | boolean, standaard `false` | Hulp bij het kiezen (R19) |

**Besluit (de bouwer, 29-10-2026): de vlaggen staan in `leden_prive`, niet in `leden`** (afwijking van V8 3.1, voor V9).
Rechten per rij werken per rij: wat in `leden` staat, ziet elk lid van elk ander lid. Of iemand BOB mag zijn of
bestuurslid is, hoeft een ander lid niet te weten (`Bouwbesluiten` 4.2).

Elk lid heeft precies één `leden_prive`-rij: de functie die leden aanmaakt (fase 4, en tot dan het script voor de
pilotleden, punt 10) maakt beide in één transactie; een test eist het voor de seed.

**De agendavelden** (`agenda_token`, `agenda_token_versie`, `agenda_laatst_opgehaald`) komen in fase 7, in
`leden_prive`. Dan moet ook een tegenspraak worden beslist: het Fase-0-plan (review PR11) zegt "een hash van het token
bewaren", `Bouwbesluiten` 5.4 zegt "tokens gehasht opslaan: niet overgenomen".

Lezen:

| Tabel | Lid | Beheerder |
|---|---|---|
| `leden` | Alle rijen, maar **alleen de kolommen** `id`, `voornaam`, `achternaam`, `type`, `actief` (`grant select (…)` per kolom) | Idem; de rest via `leden_prive` |
| `leden_prive` | Alleen de eigen rij | Alle rijen |

**`leden` altijd met een kolomlijst lezen** (DM-10). Met rechten per kolom geven `select *` en een embed `leden(*)`
een fout (`42501`), geen kleiner resultaat. Dit komt ook in de `CLAUDE.md` van de code. Het echte gevaar is één
goedbedoelde `grant select on public.leden`: dan staat alles open. Een test eist daarom dat `authenticated` geen
kolomrecht heeft op `auth_user_id`, `vereniging_id` en `aangemaakt`.

### 2.3 Groepen (V8 3.6, R22)

| Tabel | Kolommen | Lezen (lid) | Lezen (beheerder) |
|---|---|---|---|
| `groepen` | **`id`** uuid pk, **`vereniging_id`**, **`naam`** text (uniek per vereniging), **`volgorde`** int | Alle rijen (het programma toont "Alleen bestuur") | Alle rijen |
| `lid_groep` | **`lid_id`** → `leden` cascade, **`groep_id`** → `groepen` cascade; pk op beide; index op `(lid_id, groep_id)` | Alleen eigen rijen | Alle rijen (aantallen per groep in de keuzelijst) |
| `activiteit_groep` | **`activiteit_id`** → `activiteiten` cascade, **`groep_id`** → `groepen` restrict; pk op beide | Alleen rijen van activiteiten die het lid mag zien | Alle rijen |

Geen rijen in `activiteit_groep` = iedereen. De zichtbaarheid toetst `intern.lid_mag_zien()` (punt 3), die alle rijen
leest; een lid dat een rij niet ziet, kan dus nooit "geen rijen = iedereen" afleiden (`Bouwbesluiten` 4.3). Groep is geen
recht: beheerrechten hangen aan `is_admin` (V8 3.6).

### 2.4 `activiteiten` (V8 3.2)

| Kolom | Type | Toelichting |
|---|---|---|
| **`id`** | uuid pk | |
| **`vereniging_id`** | uuid | |
| **`naam`** | text, `check (naam <> '')` | |
| **`datum`** | date | |
| `verzameltijd` | time | |
| `starttijd` | time | Verplicht om te publiceren (punt 8, besluit 2) |
| `eindtijd` | time | Verplicht om te publiceren (R21). Vóór de starttijd = de volgende dag (R16); gelijk aan de starttijd mag niet (`check (eindtijd <> starttijd)`, DM-06) |
| `locatie` | text | Verplicht om te publiceren (punt 8, besluit 2) |
| `bus_vertrektijd` | time | Leeg = geen bus |
| `bus_locatie` | text | Leeg = de standaard uit `verenigingsinstellingen` |
| `notitie` | text | "Belangrijk om te weten" |
| **`type`** | text, `check in ('seizoen', 'oud_papier')`, standaard `seizoen` | De admin kiest het niet (UC-004 stap 5) |
| **`seizoen`** | int, **gegenereerd** uit `datum` (`stored`) | Zie hieronder |
| **`status`** | text, `check in ('concept', 'gepubliceerd', 'geannuleerd')`, standaard `concept` | Eén richting (V8 3.2), vangnet: trigger (uitgangspunt 9) |
| `afmeld_deadline` | timestamptz | Leeg = vrij afmelden (R8) |
| `min_aanwezigen` | int, `check (min_aanwezigen >= 1)` | Leeg = uit. Standaard 13 bij `seizoen`, leeg bij `oud_papier` (V8 3.2) |
| **`bak_actief`** | boolean, standaard `false` | Fase 2 (V8 3.7) |
| `bron_activiteit_id` | uuid → `activiteiten` `on delete set null` | Fase 9 |
| **`begin`**, **`einde`** | timestamptz, **gegenereerd** (`stored`) uit `datum`, `starttijd` en `eindtijd` | Zie punt 3; maakt filteren via de Data API mogelijk (DM-07) |
| **`aangemaakt`**, **`bijgewerkt`** | timestamptz | `bijgewerkt` zet de trigger (fase 7: `LAST-MODIFIED`) |

**Vangnet voor publiceren:** `check (status = 'concept' or (starttijd is not null and eindtijd is not null and
locatie is not null))`.

**Seizoen** (besluit 3): het beginjaar, berekend uit de datum met de grens **1 september**: september tot en met december
→ dat jaar, januari tot en met augustus → het jaar ervoor. Gelijk aan V8 6.2, zodat er één grens is (DM-11). Als
gegenereerde kolom kan hij niet uit de pas lopen met de datum: verschuift de datum, dan het seizoen mee. Zo krijgen de
ledenvergadering (8 maart 2027) en de feestavond (22 mei 2027) seizoen 2026 (V8 13.1).

Lezen:

| Lid | Beheerder |
|---|---|
| Rijen waarvoor `intern.lid_mag_zien(id, intern.huidig_lid())`: status `gepubliceerd` of `geannuleerd`, en de doelgroep is leeg of het lid zit in een van de groepen (R15, R22, V8 7.1). Een concept nooit | Alle rijen, ook concepten: in het **programma** ziet de beheerder een concept met het label "concept" (V8 7.1) |

Het **welkomscherm** van een beheerder is wel "precies zoals een lid" (V8 7.1): daarvoor is er de view
`public.mijn_activiteiten` (`security_invoker`), die alleen rijen geeft waarvoor `lid_mag_zien(id, huidig_lid())`
waar is. Een beheerder ziet daar dus geen concept en geen activiteit van een groep waar hij niet in zit (DM-03). Mijn
diensten (fase 3) en de agenda-feed (fase 7) gebruiken dezelfde view.

Niet in fase 1: `versie` (`Bouwbesluiten` 5.1, besluit vóór fase 2).

### 2.5 `roltypen` (BA-6, aanname: tabel)

| Kolom | Type |
|---|---|
| **`code`** | text pk: `werker`, `drankhaler`, `fotograaf`, `bob`, `eindverantwoordelijke`, `bak` |
| **`naam`** | text (zoals op het scherm) |
| **`ruilbaar_door_lid`** | boolean (werker, drankhaler, fotograaf) |
| **`alleen_admin`** | boolean (bob, eindverantwoordelijke, bak) |
| **`volgorde`** | int |

Gedeeld, zonder `vereniging_id`: eigen rollen per vereniging horen bij de latere ombouw (`Bouwbesluiten` 1); dan moet de
primaire sleutel om. Lezen: lid alle rijen. Gevuld in de migratie: de functies hangen ervan af.

### 2.6 `rol_slots` (V8 3.3)

| Kolom | Type | Toelichting |
|---|---|---|
| **`id`** | uuid pk | |
| **`activiteit_id`** | uuid → `activiteiten` `on delete cascade` | |
| **`rol_type`** | text → `roltypen(code)` | |
| `bezetter_id` | uuid → `leden` `on delete restrict` | Leeg = open plek. Een lid wordt nooit verwijderd (`actief = false`); zie DM-19 voor wissen op verzoek |
| `plek_label` | text, `check (plek_label in ('prins', 'adjudant', 'vorst', 'raadslid'))` | Alleen bij `bak`: `check ((rol_type = 'bak') = (plek_label is not null))` |
| **`volgorde`** | int | Volgorde op het scherm |

- **Geen dubbelboeking:** `constraint geen_dubbelboeking unique (activiteit_id, bezetter_id) deferrable initially
  deferred` (V8 3.3). Uitgesteld faalt hij pas bij `commit`, buiten de functie, als databasefout (DM-12). Daarom toetst
  `activiteit_opslaan` in fase 2 de eindtoestand zelf (V8 4.4) en zet hij aan het eind `set constraints
  public.geen_dubbelboeking immediate` in een eigen blok, zodat een dubbelboeking als `dubbelboeking` terugkomt. De
  constraint is dan alleen het vangnet.
- **Precies één eindverantwoordelijke:** een unieke index op `activiteit_id` waar `rol_type = 'eindverantwoordelijke'`
  (hooguit één), en `activiteit_opslaan` maakt hem bij het aanmaken (minstens één; `Bouwbesluiten` 4.4). Weghalen kan
  niet (punt 4).

Lezen: een lid alleen **bezette** plekken (R13) van activiteiten die hij mag zien; de beheerder alle.

### 2.7 `afmeldingen` (V8 3.4)

| Kolom | Type |
|---|---|
| **`id`** | uuid pk |
| **`activiteit_id`** | uuid → `activiteiten` `on delete cascade` |
| **`lid_id`** | uuid → `leden` `on delete restrict` |
| `toelichting` | text (alleen voor het bestuur, V8 3.4) |
| **`aangemaakt`** | timestamptz |

`unique (activiteit_id, lid_id)`. Lezen: een lid alleen de eigen afmeldingen; de beheerder alle. Of een vervanger
beschikbaar is, geeft `beschikbare_vervangers()` in fase 3 terug, zonder privévelden (`Bouwbesluiten` 4.2). In fase 1
schrijft er nog niets in; de seed vult een paar, zodat het aantal aanwezigen klopt.

### 2.8 `wijzigingen_log` (V8 3.5, `Bouwbesluiten` 4.6)

| Kolom | Type | Toelichting |
|---|---|---|
| **`id`** | bigint, `generated always as identity` | |
| **`vereniging_id`** | uuid | Eigen kolom: na het verwijderen van een concept bestaat de activiteit niet meer |
| **`moment`** | timestamptz, `clock_timestamp()` | |
| `door_lid_id` | uuid → `leden` `on delete set null` | |
| **`actie`** | text | Bijvoorbeeld `activiteit_aangemaakt`, `concept_verwijderd` |
| **`tabel`**, `rij_id` | text, uuid | Geen verwijzing: de rij kan weg zijn |
| **`omschrijving`** | text | Leesbaar: "Jeugdmiddag (za 6 februari 2027) aangemaakt als concept" |

Geen afmeldtoelichtingen of andere privévelden erin (`Bouwbesluiten` 4.6). Wel namen als tekst: bij wissen op verzoek
moeten die mee (DM-19). Lezen: alleen de beheerder (V8 7.1).

### 2.9 Niet in fase 1

`meldingen` (`Bouwbesluiten` 5.3, fase 7), de agendavelden (fase 7), `wil_ruilen` (V8 4.3, fase 5), `versie` (vóór fase
2) en een tabel voor `aanmaak_id` (bulk, fase 9). Alles is toe te voegen zonder het schema om te gooien.

### 2.10 Vereniging per tabel

Eigen kolom `vereniging_id`: `leden`, `groepen`, `activiteiten`, `wijzigingen_log`, `verenigingsinstellingen` (als
sleutel). Afgeleid via een ouder: `leden_prive` en `lid_groep` (via `leden`), `rol_slots`, `afmeldingen` en
`activiteit_groep` (via `activiteiten`). Gedeeld: `verenigingen`, `roltypen`. Een databasetest eist dat elke tabel in
`public` op precies één van die drie lijsten staat (`Bouwbesluiten` 1).

## 3. Hulpfuncties (schema `intern`)

Eigenaar `postgres`, `set search_path = ''`. `execute` alleen voor `authenticated` waar een RLS-regel of view ze nodig
heeft; nooit voor `anon` of `PUBLIC`.

| Functie | Soort | Geeft |
|---|---|---|
| `huidig_lid()` | `security definer`, `stable` | Het `leden.id` met `auth_user_id = auth.uid()`, `actief` en `type = 'lid'`; anders leeg (`Bouwbesluiten` 4.1). Alle regels gebruiken deze, nooit rechtstreeks `auth.uid()` |
| `is_beheerder()` | `security definer`, `stable` | Waar als: (1) er is een `huidig_lid()`; (2) die heeft `is_admin` in `leden_prive`; (3) `auth.jwt() ->> 'aal' = 'aal2'`; (4) er is een geverifieerde MFA-factor van deze gebruiker die is aangemaakt **vóór** `beheerder_sinds` (DM-09, zie hieronder). Intrekken van `is_admin` werkt direct, ook in een lopende sessie |
| `lid_mag_zien(activiteit_id, lid_id)` | `security definer`, `stable` | Status `gepubliceerd` of `geannuleerd`, en geen `activiteit_groep`-rij of het lid zit in een van die groepen. **Zonder** uitzondering voor de beheerder (DM-03) |
| `mag_activiteit_zien(activiteit_id)` | `security definer`, `stable` | `is_beheerder()` of `lid_mag_zien(activiteit_id, huidig_lid())`. Voor de RLS op `activiteiten`, `rol_slots`, `activiteit_groep` |
| `aantal_aanwezigen(activiteit_id)` | `security definer`, `stable`, **geen** `execute` voor `authenticated` | Actieve leden van type `lid` in de doelgroep (iedereen, of de leden van minstens één van de groepen, elk één keer), min de afmeldingen (R1, R12, R22, V8 5.6). Voor `beheeroverzicht()` nu en `meld_af()` in fase 3 |

**Tijd** (`Bouwbesluiten` 4.5, DM-05, DM-06): `immutable`, zonder definer, zonder `execute` voor `authenticated` (de
gegenereerde kolommen en de functies gebruiken ze). Geen standaardwaarde voor het moment: elke aanroeper geeft het mee.

| Functie | Geeft |
|---|---|
| `activiteit_begin(datum, starttijd)` | `(datum + coalesce(starttijd, '00:00')) at time zone 'Europe/Amsterdam'` |
| `activiteit_einde(datum, starttijd, eindtijd)` | Met eindtijd: `((datum + (case when eindtijd < starttijd then 1 else 0 end)) + eindtijd) at time zone 'Europe/Amsterdam'`: de dag erbij op de **datum**, niet op het tijdstip (anders een uur fout rond de zomertijd). Zonder eindtijd, of zonder starttijd: het einde van de dag, `(datum + 1) at time zone 'Europe/Amsterdam'` |
| `deadline_verstreken(afmeld_deadline, moment)` | `afmeld_deadline is not null and moment > afmeld_deadline`: het moment zelf telt als vóór (R8) |
| `vandaag(moment)` | `(moment at time zone 'Europe/Amsterdam')::date`: de sessie draait in UTC |

"Bezig" = `begin <= moment < einde`; "geweest" = `moment >= einde` (R16). Een schrijffunctie geeft als moment
`clock_timestamp()` ná de lock mee (uitgangspunt 7); een leesregel `now()`. Postgres-gedrag bij de zomertijd, letterlijk
in de tests: 02:30 op 28 maart 2027 bestaat niet en wordt 03:30 zomertijd; 02:30 op 31 oktober 2027 bestaat twee keer en
wordt de wintertijd.

**Wat `aal2` wel en niet bewijst** (DM-09). `aal2` zegt dat er een tweede factor is gebruikt, niet dat het die van het
juiste bestuurslid is. Een bestuurslid met `is_admin` zonder factor logt in met alleen een inloglink; wie die mail
onderschept, kan zelf een factor inschrijven. Daarom:
- **Volgorde:** eerst stelt het bestuurslid zijn authenticator in (dat mag elk lid), daarna zet de beheerder `is_admin`
  aan en `beheerder_sinds` op dat moment. Een factor die later is ingeschreven, geeft geen beheerrechten (punt (4) van
  `is_beheerder()`). Dit komt in de handleiding en in `Fase-1-plan` stap D.
- **Na te gaan in stap D** (proef op de echte Worker): of de functie `auth.mfa_factors` mag lezen; of Supabase met een
  `aal1`-sessie een tweede factor laat inschrijven als er al een geverifieerde is; wat er met een `aal2`-sessie gebeurt
  als de factor wordt verwijderd.
- **Sessieduur:** `aal2` blijft in elke ververste token van die sessie. In stap D kiest de bouwer bewust een
  sessieduur (`[auth.sessions] timebox` of `inactivity_timeout`) of een recente MFA-stap voor het beheer, en legt die
  vast.

## 4. Schrijffuncties in fase 1 (schema `public`)

`security definer`, eigenaar `postgres`, `set search_path = ''`, `execute` alleen voor `authenticated`.

### 4.1 `activiteit_opslaan(activiteit_id uuid, velden jsonb, wijzigingen jsonb, publiceren boolean) returns jsonb`

De handtekening van V8 4.4, zodat fase 2 hem uitbreidt in plaats van vervangt. Fase 1 doet het **aanmaken** en het
**wijzigen van een concept**; de rest geeft `niet_ondersteund`.

1. `intern.is_beheerder()`, anders `geen_admin`, ook voor een onbekend id (eerst wie belt).
2. **Aanmaken** (`activiteit_id` leeg): nieuwe rij met status `concept`, type `seizoen`, `min_aanwezigen` 13 tenzij
   `velden` anders zegt, en **precies één lege plek eindverantwoordelijke** (`Bouwbesluiten` 4.4). **Wijzigen**
   (`activiteit_id` gevuld): lock op de rij, dan `v_nu := clock_timestamp()`; bestaat hij niet, dan
   `activiteit_onbekend`; is hij geen concept, dan `niet_ondersteund` (gepubliceerd wijzigen is fase 2).
3. `velden` is een **gedeeltelijke wijziging** (DM-13): een sleutel die ontbreekt, blijft zoals hij was; een sleutel
   met `null` maakt het veld leeg. Toegestane sleutels: `naam`, `datum`, `verzameltijd`, `starttijd`, `eindtijd`,
   `locatie`, `bus_vertrektijd`, `bus_locatie`, `notitie`, `afmeld_deadline`, `min_aanwezigen`, `groepen`. De functie
   controleert elk veld zelf: een onbekende sleutel, een waarde van het verkeerde soort, `eindtijd` gelijk aan
   `starttijd` of `min_aanwezigen` onder 1 geeft `veld_ongeldig` met de naam van het veld in `detail`. Na het bijwerken
   moeten **`naam` en `datum`** gevuld zijn, anders `veld_ontbreekt` (besluit 2). `groepen` is de volledige nieuwe
   lijst groep-id's; leeg = iedereen; een onbekende id geeft `groep_onbekend`.
4. `wijzigingen` is een lijst; elke regel heeft een `handeling`. In fase 1:
   - `plek_toevoegen` met `rol_type` (`werker`, `drankhaler`, `fotograaf` of `bob`) en een `tijdelijk_id` (uniek binnen
     de aanroep);
   - `plek_weghalen` met `rol_slot_id`: de plek hoort bij deze activiteit, anders `plek_onbekend` (`Bouwbesluiten` 4.4);
     is leeg, anders `plek_niet_leeg`; is geen eindverantwoordelijke, anders `eindverantwoordelijke_verplicht`.
   - `toewijzen`, `leegmaken`, een plek in de bak en `publiceren = true` geven `niet_ondersteund`.
   - Geen lijst, een onbekende `handeling`, een onbekend `rol_type` of een dubbele `tijdelijk_id`: `wijziging_ongeldig`
     met de regelindex in `detail`.
5. Eén regel per handeling in `wijzigingen_log`.
6. Geeft terug: `{ "activiteit_id": …, "plekken": { "<tijdelijk_id>": "<rol_slot_id>" } }`.

Geen meldingen: een concept ziet niemand (R18).

### 4.2 `concept_verwijderen(activiteit_id uuid) returns jsonb` (V8 4.6)

`intern.is_beheerder()` anders `geen_admin`; lock; bestaat niet → `activiteit_onbekend`; status is geen `concept` (ook
geannuleerd) → `alleen_concept`, niets verwijderd; dan verwijderen (de plekken, de doelgroep en eventuele afmeldingen gaan
mee via `on delete cascade`; een concept dat bron is van een ander, laat bij dat andere `bron_activiteit_id` leeg), één
regel in `wijzigingen_log` met naam en datum. Geeft `{ "naam": …, "datum": … }` voor de melding "Jeugdmiddag is
verwijderd". Geen meldingen (R18). Een verwijderd concept komt niet terug (`Bouwbesluiten` 4.6).

## 5. Wat de schermen lezen

| Scherm (wireframe) | Wat het leest | Hoe |
|---|---|---|
| `welkom`, `welkom-leeg`, `welkom-twee` | De activiteiten van vandaag (in Amsterdamse tijd) die nog niet geweest zijn, anders de eerstvolgende; wat gisteren begon en nog loopt, blijft staan (`Bouwbesluiten` 4.5); de vertrekplaats van de bus. Ook voor een beheerder precies zoals een lid (DM-03) | View `mijn_activiteiten` met een filter op de kolom `einde` (`einde > now()`), plus `verenigingsinstellingen` |
| `programma` | Alle zichtbare activiteiten van het seizoen, komend en geweest, met "Alleen bestuur" bij een doelgroep; de beheerder ziet ook concepten | `activiteiten`, `activiteit_groep`, `groepen` met RLS |
| Activiteitscherm voor leden (`activiteit-optocht`) | Eén activiteit; onbekend of verborgen geeft hetzelfde "niet gevonden" | `activiteiten` met RLS |
| `admin-activiteiten` (tellers en taken) | Per komende, niet-geannuleerde activiteit: lege plekken per rol, welke van starttijd, eindtijd, locatie en eindverantwoordelijke ontbreken, aantal aanwezigen, minimum | `beheeroverzicht()`: `security definer`, eerst `is_beheerder()` anders `geen_admin`. De taak in woorden en de tellers maakt de app uit dezelfde rijen (V8 5.6), met de marge "bijna te weinig" (minimum + 1) als constante |
| `admin-activiteit-nieuw`, `-voor-wie-concept` | De groepen met het aantal leden | `groepen` en `lid_groep` met RLS |
| `admin-concept-verwijderen` | Naam, datum en het aantal ingedeelde leden | `activiteiten` en `rol_slots` met RLS |

**Afwijkingen van de wireframes in fase 1** (in het pull request van stap F, besluit 4): het aanmaakscherm toont plekken
zonder "Kies iemand…" en zonder de bak; mensen kiezen kan pas in fase 2. Het beheeroverzicht krijgt de taken
"starttijd invullen" en "locatie invullen" erbij (besluit 2).

## 6. Rechten in één overzicht

| Tabel / object | anon | lid lezen | beheerder lezen | schrijven |
|---|---|---|---|---|
| `verenigingen`, `verenigingsinstellingen`, `roltypen`, `groepen` | — | alles | alles | migratie of seed |
| `leden` | — | alle rijen, vijf kolommen | idem | fase 4; tot dan het script voor pilotleden (punt 10) |
| `leden_prive` | — | eigen rij | alles | idem |
| `lid_groep` | — | eigen rijen | alles | idem |
| `activiteiten` | — | zichtbaar (R15, R22) | alles | `activiteit_opslaan`, `concept_verwijderen` |
| `mijn_activiteiten` (view) | — | zichtbaar | zichtbaar als lid | — |
| `activiteit_groep` | — | van zichtbare activiteiten | alles | `activiteit_opslaan` |
| `rol_slots` | — | bezet, van zichtbare activiteiten (R13) | alles | `activiteit_opslaan` (fase 2 ook toewijzen; fase 3 `ruil_dienst`) |
| `afmeldingen` | — | eigen | alles | fase 3 |
| `wijzigingen_log` | — | — | alles | alleen de functies |

Wie een sessie heeft maar geen actief lid is, leest uit geen van deze iets (DM-02).

**De lijsten in de rechtentest** (`supabase/tests/database/rechten.test.sql`): de tabellen en de view hierboven staan op
de lijst "bewust leesbaar voor ingelogd", met deze reden; `activiteit_opslaan`, `concept_verwijderen` en
`beheeroverzicht` op de lijst "bewust uit te voeren door ingelogd" in `public`; en de hulpfuncties die RLS nodig heeft
(`huidig_lid`, `is_beheerder`, `lid_mag_zien`, `mag_activiteit_zien`) op dezelfde lijst voor het schema `intern`, dat de
test ook gaat nalopen. Niets voor `anon`.

## 7. Foutcodes van fase 1

Alle met SQLSTATE `BK001` en de foutcode als `message` (uitgangspunt 6).

| Foutcode | Wanneer | Scherm |
|---|---|---|
| `geen_admin` | Geen beheerder | **Ontwerpgat:** een sessie zonder MFA of met een ingetrokken `is_admin` kan op een beheerscherm staan. Voorstel: naar het MFA-scherm (stap D) of terug naar Start; wireframe nodig |
| `veld_ontbreekt` | Naam of datum leeg | Het veld gemarkeerd, zoals "Vul een eindtijd in." in `admin-activiteit-voor-wie-concept` |
| `veld_ongeldig` | Verkeerd soort waarde, eindtijd gelijk aan starttijd, minimum onder 1, onbekende sleutel | Idem; de app voorkomt het meestal al |
| `groep_onbekend` | Groep bestaat niet (meer) | **Ontwerpgat** (zeldzaam: er is geen groepenbeheer) |
| `activiteit_onbekend` | De activiteit is er niet (meer), bijvoorbeeld door een ander bestuurslid verwijderd | **Ontwerpgat** |
| `alleen_concept` | Verwijderen terwijl een ander bestuurslid hem net publiceerde | **Ontwerpgat** (UC-004 AF-10 noemt de code, geen scherm) |
| `plek_onbekend`, `plek_niet_leeg`, `eindverantwoordelijke_verplicht` | Plek hoort niet bij deze activiteit, is bezet, of is de eindverantwoordelijke | De app laat het niet toe; geen scherm nodig |
| `wijziging_ongeldig` | Een fout in de opbouw van `wijzigingen` | Geen: de app maakt de lijst |
| `niet_ondersteund` | Een handeling van fase 2 of later | Geen: de app stuurt hem in fase 1 niet |

Ook een klein ontwerpgat: `admin-concept-verwijderen` zegt "4 leden zijn al ingedeeld"; in fase 1 is dat altijd 0
(behalve in de seed). De tekst voor 0 ontbreekt ("Er is nog niemand ingedeeld", of de zin weglaten).

## 8. Besluiten van de bouwer (29-10-2026)

1. **De vlaggen `is_admin`, `mag_bob` en `mag_eindverantw` staan in `leden_prive`** (punt 2.2). Afwijking van V8 3.1,
   voor V9.
2. **Een concept heeft alleen naam en datum verplicht**; starttijd, eindtijd en locatie zijn verplicht om te
   publiceren, met een `check` als vangnet (punt 2.4). Reden: de bronnen spreken elkaar tegen (UC-004 AF-4 en V8 4.5:
   altijd verplicht; V8 13.5, 13.6 en testgeval 12: het programma komt binnen met alleen datum en naam; de wireframes:
   "opslaan als concept kan altijd, ook halfaf"), en zonder dit kan de seed niet het echte programma zijn (DM-04). Voor
   V9: UC-004 AF-4 en V8 4.5 aanpassen; voor fase 9 opnieuw kijken wat bij de bulk verplicht is.
3. **Het seizoen begint op 1 september**, berekend uit de datum (punt 2.4), gelijk aan V8 6.2 (DM-11).
4. **Fase 1 voegt alleen lege plekken toe en haalt ze weg; mensen kiezen kan in fase 2** (punt 4.1). Het scherm van fase
   1 wijkt daarin af van de wireframe; dat staat in het pull request van stap F.

## 9. Tests

Elke regel krijgt een test die eerst rood is. De pgTAP-tests draaien als verschillende gebruikers via `set local role
authenticated` en `request.jwt.claims`: geen lid, inactief lid, lid (`aal1`), lid in groep Bestuur zonder `is_admin`
(`aal2`), bestuurslid zonder `aal2`, en beheerder.

**Wie is lid** (DM-02)
- Ingelogd zonder lid, inactief lid, een `sub` die niet bestaat, en een token zonder `aal`: lezen niets uit geen enkele
  tabel of view, en elke functie geeft `geen_admin`.

**Beheer** (DM-09, V8 12)
- `aal2` zonder `is_admin`, ook als het lid in groep Bestuur zit: `geen_admin`.
- `is_admin` en `aal2`, maar de factor is aangemaakt ná `beheerder_sinds`: `geen_admin`.
- `is_admin` uitzetten binnen dezelfde sessie: direct `geen_admin` en geen concepten meer.
- `is_admin` en `aal2` maar `actief = false`: niets.

**Rechten op tabellen**
- `anon` leest en schrijft niets (de algemene rechtentest).
- Een lid: leest geen concept, ook niet via een directe `select` op `activiteiten`, `rol_slots` of `activiteit_groep`
  (V8 12); leest geen activiteit van een doelgroep waar hij niet in zit (R22), wel een **geannuleerde** van zijn eigen
  doelgroep (V8 7.1); leest geen lege plek (R13); leest geen `leden_prive` van een ander; geen afmelding of toelichting
  van een ander; niets uit `wijzigingen_log`; geen `lid_groep` van een ander; wel `verenigingsinstellingen`.
- **Kolommen** (DM-10): `authenticated` heeft geen kolomrecht op `leden.auth_user_id`, `vereniging_id`, `aangemaakt`;
  een tabelbrede `select` op `leden` laat de test falen.
- **Welkom van een beheerder** (DM-03): via `mijn_activiteiten` geen concept en geen activiteit buiten zijn groepen; in
  `activiteiten` (het programma) wel.
- Een lid in twee groepen ziet een activiteit van elk van beide en telt één keer als aanwezig.
- Elke tabel heeft `vereniging_id` of staat op de lijst "afgeleid" of "gedeeld" (punt 2.10).
- Elk lid in de seed heeft precies één `leden_prive`-rij.

**Functies** (DM-01, DM-18)
- Voor een lid geven concept, verborgen en onbekend id hetzelfde antwoord bij **elke** functie die hij kan aanroepen.
- De hulpfuncties staan in `intern`, niet in `public`; per functie: `prosecdef` waar punt 3 dat zegt, eigenaar
  `postgres`, `search_path = ''`, geen `execute` voor `anon` of `PUBLIC`; de lijst "bewust uit te voeren" klopt voor
  `public` en `intern`.

**`activiteit_opslaan`**
- Een lid krijgt `geen_admin`, ook voor een onbekend id, en er is niets aangemaakt, ook geen logregel.
- Aanmaken met alleen naam en datum: status concept, type seizoen, minimum 13, precies één lege eindverantwoordelijke,
  één logregel. Seizoen 2026 voor 15 januari 2027 en voor 22 mei 2027; 2027 voor 1 september 2027; 2026 voor 31 augustus
  2027. Een gewijzigde datum verandert het seizoen mee.
- Naam of datum ontbreekt: `veld_ontbreekt`. Onbekende sleutel, verkeerd soort, eindtijd gelijk aan starttijd, minimum
  0: `veld_ongeldig`. Elke fout komt terug als `BK001` met de foutcode, nooit als `23514` of `22007`.
- Een ontbrekende sleutel wijzigt niets; `null` maakt leeg; `bijgewerkt` verandert.
- Onbekende groep: `groep_onbekend`. Onbekend id: `activiteit_onbekend`.
- Twee plekken toevoegen in één aanroep: beide er, met hun echte id in het antwoord. Dubbele `tijdelijk_id`, onbekende
  handeling of `rol_type`, geen lijst: `wijziging_ongeldig`.
- Een plek van een andere activiteit weghalen: `plek_onbekend`, niets veranderd. De eindverantwoordelijke weghalen:
  `eindverantwoordelijke_verplicht`.
- Een gepubliceerde activiteit wijzigen, `toewijzen`, of `publiceren = true`: `niet_ondersteund`.
- Een fout in de laatste regel van `wijzigingen`: ook de velden en de eerdere regels zijn niet doorgevoerd, en er is
  geen logregel.
- **R18** (DM-17): na `activiteit_opslaan` en `concept_verwijderen` zijn alleen `activiteiten`, `rol_slots`,
  `activiteit_groep` en `wijzigingen_log` veranderd (het aantal rijen van alle tabellen ervoor en erna).

**`concept_verwijderen`**
- Lid: `geen_admin`. Onbekend: `activiteit_onbekend`. Gepubliceerd of geannuleerd: `alleen_concept`, en de activiteit
  bestaat nog.
- Concept: weg, met plekken en doelgroep, één logregel met naam en datum; een ander concept dat ernaar verwees, houdt
  `bron_activiteit_id` leeg.

**Vangnet** (DM-14): als `postgres` een gepubliceerde activiteit terug naar concept zetten, of een gepubliceerde
verwijderen: geweigerd door de trigger.

**Tijd** (`Bouwbesluiten` 4.5, DM-05, DM-06)
- Eindtijd vóór de starttijd (20:11–01:11): einde de volgende dag. Zonder eindtijd of starttijd: het einde van de dag.
- Het exacte eindmoment telt als geweest.
- `deadline_verstreken`: op het deadlinemoment zelf niet, één microseconde erna wel, zonder deadline nooit.
- `vandaag`: tussen 00:00 en 02:00 Nederlandse tijd is het al de nieuwe dag, terwijl het in UTC nog de vorige is.
- De zomertijd: een activiteit op 27 maart 2027 tot 03:30 (de volgende dag) eindigt om 03:30 zomertijd; de twee
  gevallen 02:30 op 28 maart en 31 oktober 2027 met hun letterlijke uitkomst.

**Gelijktijdig** (DM-08, `Bouwbesluiten` 11): de eerste test met twee sessies komt in deze fase, omdat hier de eerste
functies met een lock komen; zonder die test bewijst niets dat de lock er staat. Opzet zonder nieuw pakket: een
Vitest-test laat één sessie via `psql` in de databasecontainer (`docker exec`) een transactie openen, de lock op een
concept nemen en twee seconden wachten; tegelijk roept de test via `supabase-js` als beheerder `concept_verwijderen` op
hetzelfde concept aan. Verwacht: de aanroep wacht tot de eerste klaar is en geeft dan de juiste uitkomst, nooit een half
resultaat of een kale databasefout. Deze `Bouwbesluiten` 11 wordt daarmee bijgewerkt: de opzet komt nu.

**Aanwezigen en beheeroverzicht**
- Iedereen-activiteit: actieve leden van type lid min afmeldingen; een externe helper en een inactief lid tellen niet
  mee (R1, R12). Groepsactiviteit: alleen de doelgroep, een lid in twee groepen één keer.
- `beheeroverzicht()`: het aantal lege plekken is gelijk aan het aantal lege `rol_slots` van komende,
  niet-geannuleerde activiteiten (V8 12, 5.6).

**App (Vitest)**: het afleiden van de taak per regel uit `beheeroverzicht()` en de marge "bijna te weinig"; een
activiteit met één taak staat onder "Vraagt aandacht" (V8 5.6, 12).

**Browsertests**: een lid ziet in het programma geen concept en geen activiteit van een andere groep; de drie activiteiten
van 9 februari 2027 zijn op naam uit elkaar te houden (V8 12); een beheerder met `aal2` maakt een concept aan met alleen
naam en datum, ziet het met het label "concept", en verwijdert het; zonder `aal2` komt hij niet in het beheer.

## 10. Seed en leden (V8 13.5, DM-16)

- **`supabase/seed.sql`** draait bij `supabase db reset` als `postgres`, alleen **lokaal** (en in de poort). Inhoud: het
  programma 2026/2027 (28 regels, 32 activiteiten: de verkoop van donateurskaarten is vijf dagen) als concept met alleen
  naam en datum, zoals het programma is; een paar daarvan gepubliceerd met verzonnen tijden en locatie, zodat de
  ledenschermen iets tonen. Verzonnen leden (de namen uit het prototype) met hun `leden_prive`-rij en een account in
  `auth.users` (zoals `npm run lid:lokaal`), één beheerder met een factor, de vier groepen, een paar afmeldingen, en de
  vertrekplaats van de bus.
- **Het ontwikkelproject online** krijgt de seed **niet** via de job `migraties` (`db push` zonder `--include-seed`).
  Wat daar nodig is voor de doorloop, zet een klein script met de geheime sleutel erin, met de hand gestart door de
  bouwer, nooit tegen het pilotproject.
- **De leden van het testgroepje** (pilot A, `Fase-1-plan` 2.7) komen er niet met de hand via het dashboard in (geen log,
  geen controle, de koppeling `auth_user_id` met de hand), maar met een klein script met de geheime sleutel, dat
  `leden`, `leden_prive`, `lid_groep` en het Auth-account in één keer aanmaakt. Dat script hoort bij fase 2 of de
  pilotvoorbereiding.

## 11. Dekkingsmatrix fase 1 (`Bouwbesluiten` 4.7)

| Regel of foutcode | Servertest (pgTAP) | Browser- of app-test | Scherm |
|---|---|---|---|
| R1, R12 (aanwezigen) | Aanwezigen | — | `admin-activiteiten` ("N aanwezig") |
| R13 (lege plekken verborgen) | Rechten op `rol_slots` | — (fase 2) | — |
| R15 (concept niet zichtbaar) | Rechten op tabellen; functies geven hetzelfde antwoord | Programma als lid | `programma` |
| R16 (geweest) | Tijd | Welkom toont een lopende activiteit | `welkom` |
| R18 (geen meldingen bij een concept) | Alleen de vier tabellen veranderen | — | — |
| R22 (doelgroep) | Rechten op `activiteiten` en `activiteit_groep`; lid in twee groepen; welkom van een beheerder | Programma als lid buiten de groep | `programma-raadslid` |
| V8 3.8 (instellingen leesbaar voor leden) | Rechten op tabellen | — | `welkom` (Bus vertrekt) |
| V8 4.6 (concept verwijderen) | `concept_verwijderen` | Verwijderen als beheerder | `admin-concept-verwijderen`, `admin-activiteiten-verwijderd` |
| V8 5.6 (teller = lijst, "Vraagt aandacht") | `beheeroverzicht()` | App: taak per regel | `admin-activiteiten` |
| V8 7.1 (welkom van een beheerder zoals een lid) | `mijn_activiteiten` | — | `welkom` |
| `Bouwbesluiten` 4.1, 4.2 (`huidig_lid`, `leden_prive`, kolomrechten) | Wie is lid; kolommen | — | — |
| `Bouwbesluiten` 4.3 (MFA, eerst wie belt) | Beheer; functies | Zonder `aal2` geen beheer | MFA-schermen (ontwerpgat, stap D) |
| `Bouwbesluiten` 4.4 (één eindverantwoordelijke, plek van een andere activiteit) | `activiteit_opslaan` | — | — |
| `Bouwbesluiten` 4.5 (tijd, ná de lock) | Tijd | Gelijktijdig | — |
| `geen_admin` | Beheer, `activiteit_opslaan`, `concept_verwijderen` | Zonder `aal2` | Ontwerpgat |
| `veld_ontbreekt`, `veld_ongeldig` | `activiteit_opslaan` | Concept met alleen naam en datum | Veld gemarkeerd |
| `groep_onbekend`, `activiteit_onbekend`, `alleen_concept` | `activiteit_opslaan`, `concept_verwijderen` | — | Ontwerpgat |
| `plek_onbekend`, `plek_niet_leeg`, `eindverantwoordelijke_verplicht`, `wijziging_ongeldig`, `niet_ondersteund` | `activiteit_opslaan` | — | Geen (de app voorkomt ze) |

## 12. Voor later (uit de review)

- **Wissen op verzoek (AVG)** (DM-19): leden worden nooit verwijderd (`on delete restrict`). Het antwoord op een verzoek
  is anonimiseren: naam vervangen, `leden_prive` leeg, `auth_user_id` leeg, en de namen in `wijzigingen_log.omschrijving`.
  Op de lijst voor vóór de pilot met echte leden (`Afname-fase-0.md` punt 4).
- **Bij meerdere verenigingen**: `roltypen` per vereniging (de primaire sleutel moet om) en de seizoensgrens als
  instelling.
