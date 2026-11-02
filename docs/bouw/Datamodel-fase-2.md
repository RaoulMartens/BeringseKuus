# Datamodel fase 2: indelen en publiceren

Stand 02-11-2026, na de review (punt 13). Stap A van `Fase-2-plan.md`: dit stuk komt **vóór de migratie** (bouwgids V8 12:
"database en rechten eerst"). Het bouwt voort op `Datamodel-fase-1.md` en gooit het schema niet om: één kolom erbij, één
functie vervangen, twee kleine functies erbij. Bron: `Fase-2-plan.md` (beslissing 2.1 tot en met 2.5), `use-cases.md`
(UC-004 en UC-005, R1 tot en met R24), `Bouwbesluiten` 4 en 5.1, bouwgids V8 4.4 en 5.6.

**Belangrijk bij het bouwen:** een migratie komt via de job `migraties` bij het samenvoegen **direct online**
(`Afname-fase-1.md`). Dit stuk en de migratie krijgen dus een review vóór het samenvoegen, en de migratie gaat pas na een
groene poort. De migratie vervangt een functie (`drop function` op de oude handtekening); dat verliest geen gegevens, maar
valt onder de regel voor migraties die iets weghalen (`Afname-fase-0.md` punt 4) en krijgt daarom een eigen bevestiging in
de pull request.

## 1. Wat verandert

| Wat | Hoe | Reden |
|---|---|---|
| `activiteiten.versie` | nieuwe kolom, `int not null default 1` | Beslissing 2.1: grof vangnet naast `verwachte_bezetter`, voor beheerder tegen beheerder |
| `activiteit_opslaan` | de oude functie vervangen door één met een vijfde parameter `p_verwachte_versie`, alle parameters met een standaardwaarde | Toewijzen, leegmaken, publiceren en wijzigen van een gepubliceerde activiteit; `p_activiteit_id` wordt `string \| undefined` in de databasetypen |
| `intern.activiteit_vangnet` | vervangen: `versie` telt niet mee voor `bijgewerkt` | Punt 2 |
| Nieuwe foutcodes | `versie_verouderd`, `doelgroep_conflict`, `publiceren_niet_mogelijk`, `activiteit_niet_open`, `lid_inactief`, `lid_afgemeld`, `lid_buiten_doelgroep`, `extern_niet_toegestaan`, `slot_gewijzigd`, `dubbelboeking` | Punt 4, 6 en 7 |
| `public.huidig_seizoen()` | nieuwe functie, `security definer` | Het programma toont het seizoen van vandaag (F1-21) |
| `public.contact_eindverantwoordelijke(p_activiteit)` | nieuwe functie | R10: het telefoonnummer van de eindverantwoordelijke is voor leden zichtbaar, de rest van `leden_prive` niet |
| "Geweest" | de app gebruikt de kolom `eindigt_om` in plaats van de datum | F1-10, R16 (punt 5) |
| Seed | een verzonnen telefoonnummer voor de eindverantwoordelijke van de gepubliceerde activiteiten | Anders blokkeert R21 elke opslag op de seed (punt 9) |

Niet erbij: een tabel `meldingen` (fase 7), de plek in de bak (beslissing 2.4: `niet_ondersteund`), annuleren (fase 5),
afmelden en ruilen (fase 3).

## 2. `activiteiten.versie`

| Kolom | Type | Toelichting |
|---|---|---|
| **`versie`** | int, `not null`, standaard 1 | Gaat met 1 omhoog bij een opslag die de getoonde activiteit wijzigt |

**Wanneer gaat de versie omhoog.** Eén keer per aanroep van `activiteit_opslaan` die iets **wijzigt**: een veld, de doelgroep,
een plek (erbij, eraf, bezetting) of de status. "Wijzigen" betekent: de nieuwe waarde is anders dan de oude (null-veilig
vergeleken). Een veld met dezelfde waarde, of een `toewijzen` van wie er al zit, is geen wijziging: geen versie, geen
logregel en geen `bijgewerkt`.

**De versie is voor beheerder tegen beheerder.** De acties van een lid in fase 3 (`ruil_dienst`, `meld_af`) verhogen de
versie **niet**. Reden: anders krijgt een beheerder bij elke ruil door een lid `versie_verouderd` op een scherm met
wijzigingen die nog niet zijn opgeslagen. De plek zelf is al beschermd door `verwachte_bezetter`: wie een plek overschrijft
die een lid net heeft overgedragen, krijgt `slot_gewijzigd` (UC-005 AF-8), en de wijzigingen op de andere plekken blijven
op het scherm staan. Ook afmeldingen raken de versie niet.

**Waarom in de functie en niet in een trigger.** Eén verhoging per opslag; een trigger op `rol_slots` zou per rij tellen.
Of de functies de enige schrijvers zijn, bewaakt de rechtentest alleen voor `anon` en `authenticated`; de seed en scripts
met de geheime sleutel schrijven ook, maar dan staat er geen scherm open. Daarom een **bewaker in pgTAP**: een test die
de bronnen van alle functies in `public` en `intern` doorzoekt naar `insert`, `update` en `delete` op `rol_slots` en
`activiteit_groep`, en faalt zodra er een functie bijkomt die niet op de lijst staat (nu alleen `activiteit_opslaan` en
`concept_verwijderen`). Wie een nieuwe schrijver toevoegt, moet de lijst aanpassen en daarbij beslissen of de versie omhoog
moet.

**`bijgewerkt`** (de toekomstige `LAST-MODIFIED` van de agenda, fase 7) verandert alleen als leden iets zien veranderen.
`intern.activiteit_vangnet` vergelijkt de rij met de vorige; `versie` komt op de lijst van kolommen die **niet** meetellen,
anders verandert `bijgewerkt` bij elke verhoging, ook bij een plek erbij die leden niet zien (R13). De functie zet
`bijgewerkt` zelf als de **bezetting** verandert (`toewijzen`, `leegmaken`), omdat een lid dat ziet; een lege plek erbij of
eraf laat het staan. Er is een test voor elk van die gevallen.

**Rechten.** `authenticated` leest de kolom via een kolomrecht (`grant select (versie)`; `activiteiten` heeft alleen
kolomrechten met een expliciete lijst, `Datamodel-fase-1.md` punt 6); schrijven doet alleen de functie. De view
`mijn_activiteiten` noemt de kolom niet: een lid heeft hem niet nodig.

**Terug naar concept** blijft onmogelijk (BA-3): de trigger `activiteit_vangnet` houdt dat tegen (`vangnet_status`).

## 3. `activiteit_opslaan` in fase 2

```
activiteit_opslaan(
  p_activiteit_id    uuid    default null,
  p_velden           jsonb   default '{}',
  p_wijzigingen      jsonb   default '[]',
  p_publiceren       boolean default false,
  p_verwachte_versie int     default null
) returns jsonb
```

`security definer`, eigenaar `postgres`, `set search_path = ''`, `execute` alleen voor `authenticated`. Omdat de
parameterlijst verandert, wordt de oude functie verwijderd en de nieuwe aangemaakt, met dezelfde `revoke` en `grant`; twee
functies naast elkaar zouden bij een aanroep met drie of vier argumenten "niet uniek" geven. De rechtentest kijkt op
naam (`proname`) en blijft kloppen. Een aanroep met de vier oude argumenten werkt nog, want de vijfde heeft een
standaardwaarde; voor een bestaande activiteit is die waarde verplicht (hieronder).

**Volgorde in de functie** (één transactie; faalt één stap, dan gaat er niets door):

1. `intern.is_beheerder()`, anders `geen_admin` (ook voor een onbekend id: eerst wie belt).
2. **Aanmaken** (`p_activiteit_id` leeg): zoals in fase 1. Is `p_verwachte_versie` dan toch gevuld, dan `veld_ongeldig`
   (het id is vermoedelijk kwijtgeraakt; dat mag niet stil een nieuwe activiteit worden). **Wijzigen**: lock op de rij
   `activiteiten` (`for update`), daarna `v_nu := clock_timestamp()`. Bestaat de rij niet: `activiteit_onbekend`. Staat
   `p_verwachte_versie` niet in de aanroep: `veld_ontbreekt`. Is de versie niet gelijk aan `activiteiten.versie`:
   `versie_verouderd`, met de actuele versie in `detail`.
3. **Is de activiteit nog open?** Geannuleerd, of een **gepubliceerde** die al geweest is (`eindigt_om <= v_nu`, de stand
   vóór de wijziging): `activiteit_niet_open` (R15, R16). Een concept mag altijd worden gewijzigd.
4. `velden`: zoals in fase 1 (gedeeltelijke wijziging, elk veld gecontroleerd). Nieuw: bij een **gepubliceerde**
   activiteit mogen `starttijd`, `eindtijd` en `locatie` niet leeg worden gemaakt (`veld_ontbreekt` met de veldnaam in
   `detail.velden`); de `check` van fase 1 blijft het vangnet.
5. `groepen`: de volledige nieuwe lijst (leeg = iedereen), `groep_onbekend` zoals nu.
6. `wijzigingen` in de volgorde van de lijst (punt 4). De controles per handeling gebeuren op de stand op dat moment in de
   reeks; de controles van punt 3.1 en de volgende stap op de **eindtoestand**.
7. **Eindtoestand** (na alle wijzigingen), in deze volgorde: `doelgroep_conflict` (alleen als `groepen` in de aanroep
   staat), `lid_buiten_doelgroep` (alleen voor een lid dat in deze aanroep is toegewezen), `dubbelboeking`, en de regels
   voor een gepubliceerde activiteit (punt 3.2). Is de uitkomst een **gepubliceerde** activiteit waarvan het einde, op de
   nieuwe `datum`, `starttijd` en `eindtijd`, in het verleden ligt (`intern.activiteit_einde(...) <= v_nu`), dan
   `activiteit_niet_open` met `reden` `afgelopen`: dat dekt ook een afgelopen concept dat wordt gepubliceerd en een
   gepubliceerde activiteit die naar het verleden wordt verplaatst.
8. **Dubbelboeking** toetst de functie zelf, met een query die per lid telt hoeveel plekken hij heeft
   (`group by bezetter_id having count(*) > 1`); de `lid_id`'s komen in `detail`. De constraint `geen_dubbelboeking`
   (`deferrable initially deferred`) blijft het vangnet en wordt **niet** met `set constraints` op `immediate` gezet:
   dat geldt voor de rest van de transactie en zou een volgende aanroep in dezelfde transactie, zoals in de pgTAP-tests,
   halverwege een wissel laten stuklopen.
9. Eén regel per handeling in `wijzigingen_log` (punt 8), de versie met 1 omhoog als er iets is gewijzigd, `bijgewerkt`
   zoals in punt 2, en het resultaat.

**Geeft terug:** `{ "activiteit_id": …, "versie": <nieuw>, "plekken": { "<tijdelijk_id>": "<rol_slot_id>" } }`. De app neemt
de nieuwe versie over; de rest haalt hij opnieuw op. Bij **aanmaken** staat ook de plek eindverantwoordelijke in
`plekken`, onder de vaste sleutel `eindverantwoordelijke`.

### 3.1 Doelgroep en toegang (R22, review 05)

Een ingedeelde **interne** deelnemer (`leden.type = 'lid'`) hoort bij de doelgroep van de activiteit (leeg = iedereen).
Externe helpers vallen erbuiten. Drie regels, zodat de twee foutcodes elkaar niet overlappen:

- `doelgroep_conflict` geldt **alleen als de groepen in de aanroep veranderen** (een lijst die gelijk is aan de huidige
  telt niet): na de wijziging staat er een ingedeeld lid dat niet in de nieuwe doelgroep zit. Wie in dezelfde aanroep is
  toegewezen, valt onder `lid_buiten_doelgroep`, niet hieronder. De `lid_id`'s staan in `detail.lid_ids` (het scherm
  zoekt de namen op). Een lid dat in dezelfde aanroep is leeggemaakt, telt niet meer als ingedeeld; de beheerder kan het
  dus in één opslag oplossen.
- `lid_buiten_doelgroep` geldt **alleen voor een lid dat in deze aanroep wordt toegewezen** en niet in de doelgroep zit.
- Een schending die er **al was** vóór de aanroep (een lid dat uit een groep is gehaald) raakt de opslag niet: de toets
  kijkt alleen naar wat deze aanroep doet. Komen beide fouten voor, dan geldt `doelgroep_conflict` eerst.

### 3.2 Publiceren en een gepubliceerde activiteit bewaken (R21)

`p_publiceren = true` zet de status van `concept` op `gepubliceerd`, na alle wijzigingen in dezelfde aanroep. Is de
activiteit al gepubliceerd of geannuleerd, dan `alleen_concept` (zelfde code als bij verwijderen). Voorwaarden,
gecontroleerd op de eindtoestand:

| Voorwaarde | Waarde in `detail.ontbreekt` |
|---|---|
| `starttijd` ingevuld | `starttijd` |
| `eindtijd` ingevuld (R21) | `eindtijd` |
| `locatie` ingevuld | `locatie` |
| De plek eindverantwoordelijke is bezet (R21) | `eindverantwoordelijke` |
| Die persoon heeft een telefoonnummer: `nullif(btrim(telefoon), '')` is niet leeg (R10, R21) | `telefoon_eindverantwoordelijke` |

Ontbreekt er iets, dan `publiceren_niet_mogelijk` met **alle** ontbrekende dingen als lijst in `detail.ontbreekt`, zodat
het scherm precies kan tonen wat er mist (UC-004 AF-6). Lege gewone plekken blokkeren niet (AF-5). Een **al
gepubliceerde** activiteit houdt zijn eindverantwoordelijke: wie na de opslag geen bezette plek eindverantwoordelijke of
geen telefoonnummer heeft, krijgt `eindverantwoordelijke_verplicht` met `detail.reden` `leeg` of `telefoon` (R21: alleen
rechtstreeks vervangen).

## 4. De handelingen in `wijzigingen`

De regel heeft een `handeling`; elke handeling heeft de velden hieronder. Het blijft een lijst: een fout in de opbouw
(geen lijst, een onbekende `handeling`, een ontbrekend of verkeerd veld, een dubbele `tijdelijk_id`) is `wijziging_ongeldig`
met de regelindex in `detail`; een id-veld dat geen uuid is (`lid_id`, `rol_slot_id`, `verwachte_bezetter`) geeft
`wijziging_ongeldig` met `{ "veld": … }` en zonder regelindex.

**Verwijzen naar een plek:** met `rol_slot_id` (een bestaande plek) of met `tijdelijk_id` (een plek die eerder in dezelfde
lijst is toegevoegd). Bij het **aanmaken** bestaat de plek eindverantwoordelijke al; daar verwijst `tijdelijk_id =
'eindverantwoordelijke'` naar. Die naam is gereserveerd: `plek_toevoegen` mag hem niet gebruiken (`wijziging_ongeldig`).
Zo kan een nieuwe activiteit in één aanroep worden aangemaakt, ingedeeld en gepubliceerd.

| Handeling | Velden | Wat de functie controleert | Foutcodes |
|---|---|---|---|
| `plek_toevoegen` | `rol_type` (`werker`, `drankhaler`, `fotograaf`, `bob`), `tijdelijk_id` | Zoals fase 1; ook bij een gepubliceerde activiteit | `wijziging_ongeldig` |
| `plek_weghalen` | `rol_slot_id` | De plek hoort bij deze activiteit; is leeg **op dat moment in de reeks**; is geen eindverantwoordelijke; is geen plek in de bak | `plek_onbekend`, `plek_niet_leeg`, `eindverantwoordelijke_verplicht`, `niet_ondersteund` |
| `toewijzen` | `rol_slot_id` of `tijdelijk_id`, `lid_id`, `verwachte_bezetter` (uuid of `null`, verplicht) | Zie hieronder | zie hieronder |
| `leegmaken` | `rol_slot_id`, `verwachte_bezetter` (uuid, verplicht) | De plek hoort bij deze activiteit; de huidige bezetter is gelijk aan `verwachte_bezetter`; geen plek in de bak; eindverantwoordelijke leegmaken kan alleen bij een concept | `plek_onbekend`, `slot_gewijzigd`, `niet_ondersteund`, `eindverantwoordelijke_verplicht` |

**Een bezette plek "eraf halen".** Het keuzescherm van BA-2 biedt "Plek openlaten" en "Plek weghalen". Dat zijn twee
handelingen in dezelfde aanroep: `leegmaken` en daarna `plek_weghalen` (de volgorde van de lijst telt, dus de tweede ziet
al een lege plek).

**Een bezetter vervangen** (UC-005 AF-5) is één `toewijzen` op een bezette plek, met de oude bezetter als
`verwachte_bezetter`. Wisselen tussen twee plekken (AF-9) is twee `toewijzen`'s in één aanroep: de dubbelboeking wordt op
de eindtoestand getoetst.

**`toewijzen`** controleert, op de stand op dat moment, in deze volgorde:

1. De plek hoort bij deze activiteit, anders `plek_onbekend`. Een plek in de bak: `niet_ondersteund` (beslissing 2.4).
2. `verwachte_bezetter` is de huidige bezetter, anders `slot_gewijzigd` met de actuele bezetter in `detail`
   (UC-005 AF-8). Bij een plek die in dezelfde aanroep is toegevoegd, is de verwachting `null`.
3. Het lid bestaat en is actief, anders `lid_inactief` (R14, FO 8.1).
4. Een **externe helper** mag alleen op werker, drankhaler of fotograaf (R17); op BOB of eindverantwoordelijke:
   `extern_niet_toegestaan`.
5. Het lid is voor deze activiteit niet afgemeld (`afmeldingen`), anders `lid_afgemeld` (besluit BA-1: blokkeren).

De geschiktheidsvlaggen `mag_bob` en `mag_eindverantw` (R19) zijn een waarschuwing in het scherm, geen blokkade en geen
foutcode. De eindtoestand toetst daarna `lid_buiten_doelgroep` en `dubbelboeking` (punt 3).

## 5. Tijd: "geweest" op één plek (F1-10)

De regel staat al in de database: de gegenereerde kolom `eindigt_om` uit `intern.activiteit_einde(datum, starttijd,
eindtijd)`, met de tests rond middernacht en de zomertijd (`fase1_tijd.test.sql`). In fase 1 bepaalt de app "geweest" met
de datum (`a.datum < vandaag` in `src/lib/programma.ts`): de Bonte Avond staat na middernacht dan al als geweest. In fase 2
selecteert de app `eindigt_om` (het type `ProgrammaActiviteit` krijgt het veld) en vergelijkt dat met het moment van nu;
"komend" is `eindigt_om > nu`. De datumregel verdwijnt uit de app.

**Bewuste afwijking van `Bouwbesluiten` 4.5**, dat één databasefunctie vraagt: de kolom is die ene plek (één formule,
getest). De app vergelijkt met zijn eigen klok (de Worker); een verschil van seconden met de databaseklok is voor een
programma dat per dag werkt zonder gevolgen. Waar het wel telt, de toetsen in `activiteit_opslaan` (punt 3), gebruikt de
database zijn eigen klok (`clock_timestamp()`).

## 6. Twee kleine functies

**`public.huidig_seizoen() returns int`**: `intern.seizoen_van(intern.vandaag(now()))`, `stable`, **`security definer`**
met `set search_path = ''`. Niet `security invoker`: de functies in `intern` zijn alleen voor `service_role`, en de
rechtentest staat `authenticated` alleen `huidig_lid`, `is_beheerder` en `lid_mag_zien` in `intern` toe; de aanroeper zou
"permission denied" krijgen. Het programma filtert op `seizoen = huidig_seizoen()` in plaats van het seizoen van de eerste
rij te nemen. Op de lijst "bewust uit te voeren door ingelogd", met de reden.

**`public.contact_eindverantwoordelijke(p_activiteit uuid) returns table (voornaam text, achternaam text, telefoon
text)`**: `security definer`, `set search_path = ''`. Geeft een rij als `intern.lid_mag_zien(p_activiteit,
intern.huidig_lid())` waar is, de activiteit gepubliceerd en **nog niet geweest** is (`eindigt_om > now()`), de plek
eindverantwoordelijke bezet is door een **actief** lid, en dat lid een telefoonnummer heeft (`nullif(btrim(telefoon),
'')`); anders geen rij (onbekend en verborgen zien er hetzelfde uit). Het is de enige route waarlangs een lid een
telefoonnummer uit `leden_prive` van een ander leest (R10): niet voor afgelopen activiteiten, niet van een inactief lid.
Op de lijst voor ingelogd, met de reden.

## 7. Foutcodes van fase 2 en hun `detail`

Alle met SQLSTATE `BK001` en de foutcode als `message` (`Datamodel-fase-1.md`, uitgangspunt 6). De vorm van `detail`
per code, zodat de app er één keer op kan rekenen:

| Foutcode | Wanneer | `detail` | Scherm |
|---|---|---|---|
| `versie_verouderd` | `p_verwachte_versie` is niet de actuele | `{ "versie": <actueel> }` | **Ontwerpgat** |
| `veld_ontbreekt` | Naam of datum leeg; bij een gepubliceerde activiteit een verplicht veld leeg; geen `p_verwachte_versie` bij een bestaande activiteit | `{ "velden": [...] }` (zoals fase 1) | Veld gemarkeerd |
| `veld_ongeldig` | Zoals fase 1; ook `p_verwachte_versie` gevuld bij aanmaken | `{ "veld": … }` (één veld, zoals fase 1) | Idem |
| `activiteit_niet_open` | Geannuleerd, afgelopen, of na de opslag afgelopen | `{ "reden": "geannuleerd" \| "afgelopen" }` | **Ontwerpgat** |
| `doelgroep_conflict` | Een groepswijziging laat ingedeelden toegang verliezen | `{ "lid_ids": [...] }` | **Ontwerpgat** |
| `lid_buiten_doelgroep` | Een toegewezen lid zit niet in de doelgroep | `{ "lid_id": … }` | Geen: de keuzelijst toont ze niet |
| `publiceren_niet_mogelijk` | Een voorwaarde van R21 ontbreekt | `{ "ontbreekt": [...] }` | Statuspaneel (UC-004 AF-6) |
| `eindverantwoordelijke_verplicht` | Weghalen, leegmaken of vervangen laat een gepubliceerde activiteit zonder (bruikbare) eindverantwoordelijke | `{ "reden": "leeg" \| "telefoon" }` bij leegmaken en in de eindtoestand; `{ "regel": <index> }` bij het weghalen van de plek | Geen: de app laat het niet toe |
| `slot_gewijzigd` | De plek heeft een andere bezetter dan verwacht | `{ "rol_slot_id": …, "bezetter_id": … }` | `admin-fout-slot-gewijzigd` |
| `lid_inactief`, `lid_afgemeld`, `extern_niet_toegestaan` | Zie punt 4 | `{ "lid_id": … }` | Geen: de keuzelijst voorkomt het |
| `dubbelboeking` | Een lid staat op twee plekken | `{ "lid_ids": [...] }` | Geen: de keuzelijst voorkomt het |
| `alleen_concept` | Publiceren van een niet-concept (naast verwijderen, fase 1) | `{}` | **Ontwerpgat** (zeldzaam) |
| `plek_onbekend`, `plek_niet_leeg`, `wijziging_ongeldig`, `niet_ondersteund` | Zoals fase 1 | `{ "regel": <index> }` waar het een lijstregel is | Geen |

## 8. Auditspoor en berichten

Eén regel per handeling in `wijzigingen_log`, in dezelfde transactie, zonder privévelden (`Bouwbesluiten` 4.6). Alleen
een echte wijziging (punt 2) maakt een regel:

| `actie` | Wanneer | Omschrijving (voorbeeld) |
|---|---|---|
| `activiteit_gewijzigd` | velden gewijzigd | "Jeugdmiddag (za 6 februari 2027): locatie en starttijd gewijzigd" (veldnamen, geen waarden) |
| `doelgroep_gewijzigd` | `groepen` gewijzigd | "Jeugdmiddag: doelgroep gewijzigd" |
| `plek_toegewezen` | `toewijzen` | "Truus Janssen ingedeeld als werker bij Jeugdmiddag" |
| `plek_leeggemaakt` | `leegmaken` | "Truus Janssen van werker bij Jeugdmiddag af" |
| `plek_toegevoegd`, `plek_weggehaald` | zoals fase 1 | |
| `activiteit_gepubliceerd` | `p_publiceren` | "Jeugdmiddag (za 6 februari 2027) gepubliceerd" |

**Meldingen worden in fase 2 niet verstuurd:** er is nog geen tabel `meldingen` en geen taak (fase 7,
`Bouwbesluiten` 5.3). Het log legt vast wat er is gebeurd; wie er bericht over moet krijgen, volgt uit de gewijzigde
plekken. Zie open punt O-1.

## 9. Seed

`supabase/seed.sql` geeft de gepubliceerde activiteiten een eindverantwoordelijke zonder telefoonnummer. Met R21 geeft dan
elke opslag op die activiteiten `eindverantwoordelijke_verplicht` met reden `telefoon`, en toont het welkomscherm geen
nummer. De seed krijgt een verzonnen nummer (`06 12 34 56 78`, nooit een echt nummer) voor de eindverantwoordelijke,
met een test die de seed controleert. `docs/bouw/Programma-ontwikkelproject.sql` heeft alleen concepten met een lege
eindverantwoordelijke en geen leden; daar verandert niets.

## 10. Schermen en wat ze lezen

| Scherm (wireframe) | Wat het leest of doet | Hoe |
|---|---|---|
| `welkom`, `welkom-leeg`, `welkom-twee` | De activiteiten van nu, met de rolbezetting (alleen bezette plekken, R13) en het contact van de eindverantwoordelijke | View `mijn_activiteiten`; `rol_slots` met `leden`; `contact_eindverantwoordelijke()`; `verenigingsinstellingen` |
| Activiteitscherm voor leden | Eén activiteit, onbekend of verborgen geeft "niet gevonden" | `activiteiten` met RLS |
| `programma` | Seizoen van vandaag, komend en geweest via `eindigt_om` | `huidig_seizoen()`, `activiteiten` |
| `admin-activiteiten` | Tellers en taken (V8 5.6) | `beheeroverzicht()` |
| Activiteit aanmaken en bewerken, met de rolbezetting | Velden, plekken, keuzelijst met actieve leden en externe helpers (wie al is ingedeeld of afgemeld, staat er niet in), vlaggen, groepen met aantallen, afmeldingen met toelichting | `activiteiten`, `rol_slots`, `leden`, `leden_prive`, `groepen`, `lid_groep`, `afmeldingen` (allemaal alles-lezen voor de beheerder); opslaan via `activiteit_opslaan` |
| Bevestigingsstap bij opslaan, weggooien, `slot_gewijzigd`, concept verwijderen | Per wijziging wat er verandert | Uit het scherm zelf; `concept_verwijderen` zoals fase 1 |

**Regels voor de schermen (stap C).**
- **Eerst de activiteit lezen, dan de plekken.** De app neemt de `versie` mee uit de eerste query; verandert de bezetting
  daarna, dan is de versie ouder en geeft Opslaan `versie_verouderd` (veilig). Andersom zou een nieuwe versie met een
  oude bezetting kunnen slagen.
- **Aanmaken en bijwerken zijn twee paden** in de serveractie (twee schema's, Zod): een bewerkscherm dat zijn id kwijt is,
  maakt geen nieuwe activiteit; en de database weigert een gevulde `p_verwachte_versie` zonder id (punt 3, stap 2). Een
  dubbele klik op "aanmaken" geeft twee concepten; een sleutel per aanmaak (idempotentie) hoort bij fase 9 (`aanmaak_id`).

**Ontwerpgaten** (V8 14.3; beslissing 2.5): de wireframes ontbreken voor `versie_verouderd` ("Iemand anders heeft deze
activiteit net gewijzigd"), `doelgroep_conflict` (welke leden staan nog ingedeeld), `activiteit_niet_open` en
`alleen_concept`. Voor `publiceren_niet_mogelijk` beschrijft UC-004 AF-6 het scherm; de wireframe wordt nagelopen. De
ontwerper maakt de wireframes; Claude zet een eerste versie klaar in de stijl van de andere schermen.

## 11. Rechten in één overzicht (wat verandert)

| Object | Wijziging |
|---|---|
| `activiteiten.versie` | `grant select (versie)` voor `authenticated`; geen schrijfrecht |
| `activiteit_opslaan` | Nieuwe handtekening; `revoke` van `public` en `anon`, `grant execute` voor `authenticated`; op de lijst in de rechtentest |
| `huidig_seizoen`, `contact_eindverantwoordelijke` | Op de lijst "bewust uit te voeren door ingelogd", met de reden; beide `security definer`, `set search_path = ''` |
| `intern.activiteit_vangnet` | Vervangen (`versie` telt niet mee voor `bijgewerkt`); blijft een trigger, niet uit te voeren door ingelogd |
| `rol_slots`, `afmeldingen`, `activiteit_groep` | Ongewijzigd: alleen de functies schrijven |

De regels voor `rol_slots` (alleen bezette plekken voor een lid, R13) en voor `leden_prive` (eigen rij, behalve via
`contact_eindverantwoordelijke`) veranderen niet.

## 12. Tests

Elke regel krijgt een test die eerst rood is. De pgTAP-tests draaien als dezelfde gebruikers als in fase 1
(`Datamodel-fase-1.md` punt 9).

**Bestaande tests die meeveranderen** (de migratie breekt ze, en dat is bedoeld):
`fase1_functies.test.sql` kent nu `niet_ondersteund` voor toewijzen, leegmaken, publiceren en wijzigen van een
gepubliceerde activiteit; die cases worden de nieuwe tests. Aanroepen op een bestaande activiteit zonder versie geven nu
`veld_ontbreekt`; ze krijgen een versie. De `plan(n)`-tellingen volgen. `e2e/gelijktijdig.spec.ts` verwacht nu
`niet_ondersteund` en gaat over op de nieuwe uitkomsten (punt hieronder).

- **Versie:** een aanroep met de oude versie geeft `versie_verouderd` en laat alles ongewijzigd; één wijziging verhoogt
  de versie met 1, ook bij meerdere handelingen; een aanroep zonder echte wijziging (zelfde waarden, `toewijzen` van de
  zittende bezetter) laat versie, log en `bijgewerkt` staan; een bestaande activiteit zonder `p_verwachte_versie`
  geeft `veld_ontbreekt`; een gevulde versie bij aanmaken geeft `veld_ongeldig`; `bijgewerkt` verandert bij bezetting en
  veld, niet bij een lege plek erbij.
- **Bewaker:** de test op de functies die `rol_slots` en `activiteit_groep` schrijven (punt 2).
- **Toewijzen en leegmaken:** de controles van punt 4 elk met een bewuste fout (`slot_gewijzigd`, `lid_inactief`,
  `extern_niet_toegestaan`, `lid_afgemeld`, `plek_onbekend`, een plek in de bak = `niet_ondersteund`, ook bij leegmaken en
  weghalen); wisselen tussen twee plekken slaagt, ook twee keer in één transactie; vervangen door één `toewijzen`; "eraf
  halen" met `leegmaken` en `plek_weghalen` in één aanroep; alles of niets (een fout in de laatste regel laat de eerste
  ongedaan); een lid dat elke handeling aanroept geeft `geen_admin`.
- **Aanmaken in één keer:** aanmaken, de plek `eindverantwoordelijke` toewijzen en publiceren in één aanroep, en de plek
  staat in `plekken`.
- **Doelgroep:** `lid_buiten_doelgroep` alleen voor een nieuw toegewezen lid; `doelgroep_conflict` met de `lid_ids`; de
  doelgroep wijzigen na eerst leegmaken in dezelfde aanroep slaagt; een externe helper blijft buiten de toets; een
  schending die er al was blokkeert een opslag zonder groepen niet.
- **Publiceren:** elke ontbrekende voorwaarde apart en alle samen in `detail.ontbreekt`; telefoon alleen spaties telt als
  leeg; publiceren van een al gepubliceerde activiteit is `alleen_concept`; de eindverantwoordelijke van een
  gepubliceerde activiteit leegmaken of vervangen door iemand zonder telefoon is `eindverantwoordelijke_verplicht`; een
  gepubliceerde activiteit mag zijn `eindtijd` niet leegmaken.
- **Niet open:** een geannuleerde of afgelopen gepubliceerde activiteit geeft `activiteit_niet_open`; een afgelopen
  concept mag worden gewijzigd maar niet gepubliceerd; een gepubliceerde activiteit naar het verleden verplaatsen is
  `activiteit_niet_open`.
- **Contact en seizoen:** `contact_eindverantwoordelijke` geeft geen rij bij een concept, een verborgen activiteit, een
  andere groep, een afgelopen activiteit of een inactief lid, en wel naam en telefoon bij een zichtbare lopende; een lid
  leest nog steeds niet de rest van `leden_prive`; `huidig_seizoen()` rond 1 september, als `authenticated` aangeroepen.
- **Seed:** elke gepubliceerde activiteit in de seed heeft een eindverantwoordelijke met telefoon.
- **Gelijktijdig** (`e2e/gelijktijdig.spec.ts`, ook rood zonder de lock): twee opslagen met dezelfde `verwachte_versie`,
  de tweede krijgt `versie_verouderd`; publiceren tegen wijzigen; hetzelfde lid tegelijk op twee plekken.
- **Rechten:** de rechtentest en de lijsten kennen de nieuwe functies; `anon` niets; een lid zonder `aal2` geeft
  `geen_admin`.
- **Browser (stap C en D):** per scherm axe en 375 px; de dekkingsmatrix hieronder.

### Dekkingsmatrix fase 2

| Regel of foutcode | Servertest | Browsertest | Scherm |
|---|---|---|---|
| R2, R4 (BOB en eindverantwoordelijke alleen via de beheerder) | `toewijzen` op die rollen | Leden hebben geen knop | `welkom` |
| R10 (telefoon eindverantwoordelijke) | `contact_eindverantwoordelijke` | Welkom toont het nummer | `welkom` |
| R13 (lege plekken verborgen voor leden) | Rechten op `rol_slots` | Welkom toont geen lege plek | `welkom` |
| R14, R17 (alleen leden als vervanger, helpers door de beheerder) | `lid_inactief`, `extern_niet_toegestaan` | — | Keuzelijst |
| R16 (geweest op het eindmoment) | Tijd (fase 1) | Programma na middernacht | `programma` |
| R18 (geen meldingen bij een concept) | Alleen de vier tabellen veranderen (fase 1) | — | — |
| R19 (vlaggen zijn een waarschuwing) | `toewijzen` zonder vlag slaagt | Waarschuwing zichtbaar | Keuzelijst |
| R20 (dubbelboeking, ook voor de beheerder) | `dubbelboeking` | — | Keuzelijst (staat er niet in) |
| R21 (publiceren) | `publiceren_niet_mogelijk`, `eindverantwoordelijke_verplicht` | Publiceren geblokkeerd met reden | Statuspaneel |
| R22 (doelgroep) | `lid_buiten_doelgroep`, `doelgroep_conflict` | Programma als lid buiten de groep | `programma-raadslid` |
| V8 4.4 (alles of niets, `verwachte_bezetter`) | `slot_gewijzigd`, alles of niets | `slot_gewijzigd` geeft het foutscherm | `admin-fout-slot-gewijzigd` |
| Beslissing 2.1 | `versie_verouderd`, `bijgewerkt` | Tweede beheerder krijgt de melding | Ontwerpgat |
| BA-1 (afgemelde leden blokkeren) | `lid_afgemeld` | — | Keuzelijst |
| Beslissing 2.4 (de bak) | `niet_ondersteund` | — | Geen |
| V8 4.6 (concept verwijderen) | `concept_verwijderen` (fase 1) | Verwijderen als beheerder | `admin-concept-verwijderen` |
| V8 5.6 (teller = lijst, taken) | `beheeroverzicht()` (fase 1) | De taak per regel | `admin-activiteiten` |
| `activiteit_niet_open`, `alleen_concept` | Geannuleerd, afgelopen, al gepubliceerd | — | Ontwerpgat |

## 13. Besluiten van de bouwer (02-11-2026) en de review

**Besluiten** (de ontwerper heeft ze op 02-11-2026 bevestigd; open punt O-1 staat nog open)

1. **De versie wordt in de functie verhoogd, één keer per opslag, niet in een trigger.** Een pgTAP-bewaker vangt een
   nieuwe schrijver op. **De acties van een lid (fase 3) verhogen de versie niet**: de plek is al beschermd door
   `verwachte_bezetter`, en anders verliest een beheerder zijn openstaande wijzigingen bij elke ruil.
2. **`bijgewerkt` verandert alleen als leden iets zien veranderen**: velden, doelgroep, status en bezetting.
3. **Eén foutcode `publiceren_niet_mogelijk` met een lijst in `detail`**, niet één code per voorwaarde.
4. **Alle parameters van `activiteit_opslaan` hebben een standaardwaarde**, zodat de gegenereerde typen `p_activiteit_id`
   optioneel maken (F1-21). Een gevulde versie zonder id wordt geweigerd tegen een kwijtgeraakt id.
5. **"Geweest" via `eindigt_om` in de app**, geen nieuwe databasefunctie (punt 5).
6. **Dubbelboeking en de afgelopen-toets op de eindtoestand**, met een eigen query; `set constraints` wordt niet gebruikt.
7. **`doelgroep_conflict` alleen als `groepen` in de aanroep staat; `lid_buiten_doelgroep` alleen voor wie nu wordt
   toegewezen**; `detail` bevat id's, geen namen (het scherm zoekt ze op).

**De review** (een schone Claude-subagent, 02-11-2026, 17 bevindingen). Wat klopte aan het stuk en niet te breken was:
de handtekening en de lijst op naam, de `drop function`, de typen, de kolomrechten, de trigger tegen terug naar concept,
de lock-volgorde en `contact_eindverantwoordelijke` zonder lek tussen onbekend en verborgen. Afhandeling:

| ID | Ernst | Bevinding | Afhandeling |
|---|---|---|---|
| R2-01 | blokkerend | `huidig_seizoen()` als `security invoker` geeft "permission denied" op `intern` | Punt 6: `security definer` |
| R2-02 | belangrijk | Bij aanmaken is de plek eindverantwoordelijke niet aan te wijzen | Punt 4: gereserveerde `tijdelijk_id = 'eindverantwoordelijke'`, in het antwoord, met test |
| R2-03 | belangrijk | `set constraints immediate` blijft staan in de transactie | Punt 3 stap 8: eigen query, geen `set constraints` |
| R2-04 | belangrijk | Een afgelopen concept kan gepubliceerd worden; toets op de oude stand | Punt 3 stap 3 en 7: eindtoestand, `activiteit_niet_open` met reden |
| R2-05 | belangrijk | `versie` raakt `bijgewerkt` | Punt 2: `versie` telt niet mee, bezetting zet `bijgewerkt` zelf, tests |
| R2-06 | belangrijk | "De functies zijn de enige schrijvers" klopt niet | Punt 2: bewaker in pgTAP, de zwakke redenering is weg |
| R2-07 | belangrijk | Ophogen door fase 3 holt `verwachte_bezetter` uit | Besluit 1: ledenacties verhogen de versie niet |
| R2-08 | belangrijk | `doelgroep_conflict` en `lid_buiten_doelgroep` overlappen | Punt 3.1: drie regels, id's in `detail` |
| R2-09 | klein | De seed heeft geen telefoonnummers | Punt 9, met test |
| R2-10 | klein | `contact_eindverantwoordelijke` is ruimer dan R10 | Punt 6: actief lid, niet leeg na `btrim`, nog niet geweest |
| R2-11 | klein | Foutdetails inconsistent | Punt 7: één tabel |
| R2-12 | klein | Tests en matrix missen dingen; bestaande tests breken | Punt 12: aangevuld, bestaande tests benoemd, bevestiging voor de `drop function` |
| R2-13 | klein | Wat telt als "wijziging" | Punt 2: nieuwe waarde ongelijk aan de oude |
| R2-14 | klein | Een bewerking zonder id maakt stil een nieuwe activiteit | Punt 3 stap 2 en punt 10: gevulde versie zonder id geweigerd, twee paden in de app |
| R2-15 | klein | Versie en bezetting uit verschillende momenten | Punt 10: eerst de activiteit lezen, dan de plekken |
| R2-16 | klein | "Geweest" in de app wijkt af van `Bouwbesluiten` 4.5 | Punt 5: bewust, klokbron vastgelegd |
| R2-17 | klein, niet zeker | Een lid kan tegelijk inactief worden gezet | Voor `Datamodel-fase-4`: de functie die leden inactief zet, moet de activiteiten-lock nemen (of de toets op `actief` herhalen na de lock) |

**De review van de migratie** (stap B, PR 40; een schone Claude-subagent met eigen aanvalspogingen en mutatietests,
02-11-2026, 11 bevindingen, niets blokkerends). Wat de code doet, wijkt op een paar plekken af van het stuk hierboven;
dat is hier rechtgezet of vastgelegd.

| ID | Ernst | Bevinding | Afhandeling |
|---|---|---|---|
| R3-01 | belangrijk | Een plek van een andere activiteit bij `toewijzen` en `leegmaken` was niet getest | Tests toegevoegd, bewezen rood zonder de controle (PR 40) |
| R3-02 | belangrijk | De afgelopen-toets op de stand vóór de wijziging was niet getest | Test toegevoegd (datum van een afgelopen activiteit naar de toekomst), bewezen rood (PR 40) |
| R3-03 | klein | Zwakke tests bij contact, `bijgewerkt` en de bewaker | Aangevuld; de bewaker zoekt breed (PR 40). De test op `huidig_seizoen()` vergelijkt met dezelfde uitdrukking; de grens zelf (1 september) is getest in `fase1_tijd.test.sql` |
| R3-04 | klein | "Hetzelfde lid tegelijk op twee plekken" ontbreekt in de gelijktijdigheidstest | Bewust niet: de dubbelboeking is in pgTAP getest op de eindtoestand; de nieuwe e2e-test bewijst de lock voor de versie |
| R3-05 | klein | De vorm van `detail` wijkt op twee plekken af | Punt 4 en 7 aangepast aan de code |
| R3-06 | klein | `doelgroep_conflict` kijkt naar "veranderen", niet naar "staat in de aanroep" | Punt 3.1 aangepast: een gelijke lijst telt niet, wie nu is toegewezen valt onder `lid_buiten_doelgroep` |
| R3-07 | klein | De vormcontrole van `p_velden` en `p_wijzigingen` komt vóór de lock en de versie | Genoteerd: een foute vorm met een verouderde versie geeft `veld_ongeldig` of `wijziging_ongeldig`, geen `versie_verouderd`; onschuldig |
| R3-08, R3-09 | klein | Bestandsmodus; `drop function` zonder `if exists` | Hersteld in PR 40 |
| R3-10 | klein | Een aanroep zonder id maakt stil een nieuwe activiteit | Bekend; de serveractie in stap C dwingt twee paden af (punt 10) |
| R3-11 | klein | De opmerking in `20261029100000_fase1_schema.sql` ("zet hem aan het eind op immediate") is achterhaald; `service_role` houdt execute op de nieuwe functies | Een toegepaste migratie wijzig je niet; punt 3 stap 8 is de bron. `service_role` is gelijk aan fase 1 en onschadelijk (`geen_admin`, of geen rij zonder lid) |

## 14. Open punten

- **O-1: berichten in pilot A.** Het ontwerp belooft "betrokkenen krijgen bericht" bij publiceren en bij wijzigen van een
  gepubliceerde activiteit (R18, BA-4); fase 2 verstuurt niets. Pilot A (14 tot 22 november) kan zo met een klein
  testgroepje zonder mail. Is dat voor de pilot niet genoeg, dan komt een deel van `Bouwbesluiten` 5.3 (tabel `meldingen` en
  een verzendtaak) vóór de pilot en past het plan aan. **De bevestigingsstap mag dus niet zeggen dat iemand bericht krijgt**
  zolang er niets wordt verstuurd; de tekst volgt de wireframe pas als de berichten er zijn.
- **O-2: een gepubliceerde activiteit die al geweest is** bewerken (bijvoorbeeld een eindtijd corrigeren achteraf) geeft
  `activiteit_niet_open`. Is dat te streng voor de praktijk, dan een beperkte uitzondering voor velden zonder gevolgen
  (de notitie). Voorstel: nu niet, kijken in de pilot.
- **O-3: afmeldingen in de keuzelijst.** De beheerder ziet wie is afgemeld (`afmeldingen` met toelichting, V8 3.4). In
  fase 2 maakt niemand een afmelding (fase 3); de seed vult er enkele. De lijst werkt dus, maar de controle `lid_afgemeld`
  wordt in de pilot niet geraakt.
