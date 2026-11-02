# Afname fase 1

Stand 02-11-2026. Wat fase 1 heeft opgeleverd, de review van fase 1 als geheel met wat ermee is gedaan, de adviseurs van
Supabase, en de lijst "Van fase 1 naar fase 2". Wie fase 2 begint, leest dit bestand eerst.

**Stand (02-11-2026): fase 1 is af voor zover hij is versmald, op één onderdeel na: de doorloop met de hand (punt 2.1)
is nog niet gedaan.** De fase is op 30-10-2026 versmald (`Fase-1-plan.md`, F1-01): het welkomscherm, het beheeroverzicht,
activiteit aanmaken en concept verwijderen schuiven naar fase 2. De migratie van de afname (PR 35) staat in `main` maar
nog niet in het online project; wat daarvoor moet gebeuren, staat in punt 4 onder "Vóór de migratie online gaat".

## 1. Wat fase 1 heeft opgeleverd

| Onderdeel | Bewijs | Stand |
|---|---|---|
| Datamodel en rechten, eerst op papier en gereviewd | `Datamodel-fase-1.md`; review door een schone chat vóór de migraties (PR 22) | Gehaald |
| Migraties, rechten en negatieve tests | pgTAP (255 tests), `e2e/gelijktijdig.spec.ts` voor de rij-lock; de rechtentest bewijst dat hij rood wordt zonder de maatregel | Gehaald |
| MFA voor het bestuur | `e2e/mfa-gotrue.spec.ts` (echte GoTrue), `e2e/mfa.spec.ts`; `Beheerders.md`; online geprobeerd op 30-10-2026 | Gehaald |
| Inloggen met een code per mail | `Inloggen.md`, `e2e/inloggen.spec.ts` (PR 34) | Gehaald; zie punt 4 voor het afzenderadres |
| Seed met het programma 2026/2027 | `supabase/seed.sql`, lokaal en ontwikkeldatabase | Gehaald |
| Tokens en componentenset | `/ontwerp` (PR 25 en 26) | Deels: zie `Fase-1-plan.md` stap E |
| Schermen: programma, inlog- en beveiligingsschermen, 404, foutpagina, storing | `e2e/programma.spec.ts`, `e2e/inloggen.spec.ts`, `e2e/mfa.spec.ts`, `e2e/storing.spec.ts`, `e2e/niet-gevonden.spec.ts` | Gehaald |
| Alle controles groen in GitHub | Workflow `check` groen op `main` na PR 35 (squash-commit `8456956`) en op elke pull request | Gehaald |
| Review van fase 1 als geheel | Punt 3: 21 bevindingen | Gehaald |
| Doorloop met toetsenbord, telefoon en schermlezer | Punt 2.1 | **Open, door de bouwer** |
| Vergelijking met het visuele ontwerp per scherm (1200 en 375 px) | `Design-overdracht.md` 4 | **Open, door de bouwer** |

## 2. Met de hand

### 2.1 Doorloop met toetsenbord, telefoon en schermlezer

Door de bouwer, op de site online, met het eigen account van de bouwer. Per scherm: met Tab door alle links, velden en
knoppen; de focus is steeds zichtbaar en de volgorde klopt; Enter (en Spatie op een knop) doet wat je verwacht; op een
telefoon (375 px of smaller) schuift niets opzij. Eén keer met een schermlezer (VoiceOver of NVDA): worden de meldingen
voorgelezen?

| Scherm | Toetsenbord | Focus zichtbaar | Telefoon | Schermlezer | Gevonden |
|---|---|---|---|---|---|
| `/inloggen`: adres, code, fout, ander apparaat | ☐ | ☐ | ☐ | ☐ | |
| `/auth/bevestigen` (oude link) | ☐ | ☐ | ☐ | — | |
| `/mijn`, ook voor een account zonder lid | ☐ | ☐ | ☐ | — | |
| `/programma`, als lid en als beheerder | ☐ | ☐ | ☐ | ☐ | |
| `/mfa/instellen`, `/mfa/wacht`, `/mfa/code`, `/mfa/toestel-kwijt` | ☐ | ☐ | ☐ | ☐ | |
| `/geen-toegang` | ☐ | ☐ | ☐ | — | |
| `/beheer` (tijdelijk) | ☐ | ☐ | ☐ | — | |
| `/storing` | ☐ | ☐ | ☐ | — | |
| Een pagina die niet bestaat (404) en de foutpagina | ☐ | ☐ | ☐ | — | |

Datum: … · Apparaat: … · Door: … · Uitkomst: …

### 2.2 Supabase-adviseur (bouwgids 14.4)

Door de bouwer op 30-10-2026, project `ledenplatform-ontwikkel`, Advisors, *Rerun linter*.

| Adviseur | Meldingen | Verwacht? |
|---|---|---|
| Security | 0 errors. Warnings: *Signed-In Users Can Execute SECURITY DEFINER Function* voor vier functies (`activiteit_opslaan`, `beheeroverzicht`, `beheerstatus`, `concept_verwijderen`) en *Leaked Password Protection Disabled* | Ja, zie hieronder |
| Performance | 0 errors, 0 warnings, 11 info: *Unindexed foreign keys* en twee keer *Unused index* (op `lid_groep` en `activiteiten`) | Ja, zie hieronder |

**De vier functies met SECURITY DEFINER.** Het zijn de functies waarlangs een lid of beheerder bewust schrijft of leest.
Dat ze aanroepbaar zijn voor ingelogde gebruikers is de bedoeling (`Datamodel-fase-1.md`, punten 4 en 9); elke functie
controleert zelf wie belt en eist voor beheer `aal2`. De rechtentest (`rechten.test.sql`) bewaakt dat er geen functie
bijkomt die ingelogden mogen uitvoeren zonder dat hij op de lijst staat, met de reden.

**Leaked Password Protection.** Het platform gebruikt geen wachtwoorden (`Inloggen.md`), dus de controle beschermt hier
niets, en hij is pas beschikbaar op het Pro-plan. Besluit zoals in `Afname-fase-0.md`: tot de pilot een bekende
warning; op Pro zetten we hem aan.

**Unindexed foreign keys.** Opgelost in PR 35: negen indexen, met een pgTAP-bewaker die elke nieuwe vreemde sleutel zonder
index afkeurt. "Mijn diensten" (fase 3) zoekt op `rol_slots.bezetter_id` en `afmeldingen.lid_id`.

**Unused index.** Geen actie: op een database zonder verkeer is elke index "nooit gebruikt". Na de pilot kijken we opnieuw.

## 3. De review van fase 1: bevindingen en afhandeling

Een schone Claude-subagent zonder het bouwgesprek reviewde `main` op `549d11e` tegen hoofdstuk 14 (30-10-2026), draaide
de tests en probeerde zelf aanvallen op de lokale database. Oordeel: niet af, maar dichtbij; de kern (datamodel,
rechten, MFA, tests, poort) is sterk. Rechtstreeks via PostgREST, RPC en views kon een lid of beheerder zonder geldige
code niets lezen of schrijven wat niet mag. Ernst volgens de reviewer.

| ID | Ernst | Bevinding | Afhandeling |
|---|---|---|---|
| F1-01 | blokkerend | Welkomscherm, beheeroverzicht en aanmaken beloofd, maar niet gebouwd | Fase versmald (30-10-2026); de schermen naar fase 2, punt 4 |
| F1-02 | blokkerend | Een `beheerder_sinds` in de toekomst omzeilt de bevestiging door een tweede beheerder | PR 35: de database weigert het, bestaande waarden worden rechtgezet, de leeskant negeert het; handleiding in `Beheerders.md`. Nog te doen vóór de migratie online gaat (punt 4) |
| F1-03 | blokkerend | README verouderd; `lid:lokaal` maakte alleen een inlogaccount | PR 33: README, `lid:lokaal` maakt een volledig lid (optioneel beheerder), melding op `/mijn` |
| F1-04 | belangrijk | Een lid aanmaken kan niet met alleen de repo | PR 33: hetzelfde script, voorbeeld in `Beheerders.md`, test in de poort |
| F1-05 | belangrijk | Een netwerkfout lijkt op uitloggen | PR 33: onderscheid "geen sessie" en "Supabase onbereikbaar", scherm `/storing`, test |
| F1-06 | belangrijk | Een echt e-mailadres in de ontwikkeldatabase, tegen de eigen regel | **Open.** Bewuste uitzondering voor de demo aan de opdrachtgever; vastleggen met doel en einddatum (vóór de pilot) en opruimen. Zie punt 4 |
| F1-07 | belangrijk | Wijzigingen in `is_admin` en `beheerder_sinds` laten geen spoor na | PR 35: spoor in `wijzigingen_log`, zonder privévelden; grenzen in `Beheerders.md` |
| F1-08 | belangrijk | Teksten en handleiding bij "toestel kwijt" zijn te optimistisch over wie kan helpen | PR 33: teksten en `Beheerders.md` |
| F1-09 | belangrijk | Tweede beheerder, repository naar een organisatie, licentie van de code | **Uitgesteld tot vóór de pilot** (voorstel van de bouwer, te bevestigen), met reden: er is nu één bouwer, en een tweede beheerder en een organisatie vragen het bestuur. Zie punt 4 |
| F1-10 | belangrijk | "Geweest" wordt in de app op datum bepaald, niet met de tijdfunctie van de database (R16) | **Naar fase 2**, in de migratie die fase 2 toch nodig heeft |
| F1-11 | belangrijk | Twee dekkingsmatrices | Eén matrix: `Datamodel-fase-1.md` punt 11. Wat nog aan fase 2 hangt, staat in punt 5 |
| F1-12 | klein | Review is niet mechanisch af te dwingen | **Bewust risico:** met één bouwer kan een verplichte goedkeuring niet. Afgedwongen wordt wat wel kan: de poort en een eigen review voor gevoelige pull requests (`CLAUDE.md`) |
| F1-13 | klein | Zod nog niet toegevoegd | **Uitstel tot fase 2**, de eerste actie met echte invoer; dan eerst voorleggen (nieuw pakket) |
| F1-14 | klein | `/mfa/instellen` wijzigt gegevens bij een GET | **Open, klein.** Zonder gevolg voor `is_beheerder`; overwegen een knop |
| F1-15 | klein | Documenten spreken elkaar tegen | PR 33 en deze afronding |
| F1-16 | klein | Gaten in de browsertests (axe op `/beheer`, CSP, `prefers-reduced-motion`, `route.ts`) | PR 33 |
| F1-17 | klein | `getUser()` drie keer per pagina | PR 33: `cache()` per aanvraag |
| F1-18 | klein | De startpagina kent een ingelogd lid niet | PR 33: een lid gaat naar `/programma`, een account zonder lid naar `/mijn` |
| F1-19 | klein | Een numerieke code kan te raden zijn, begrensd door de rem | **Open, moet gemeten worden.** Sinds PR 34 is een code van 6 tot 10 cijfers de gewone route, geen randgeval meer. Meten online (`hosting.md` stap 14), vóór de pilot |
| F1-20 | klein | Resten: lege taken-Worker, `/ontwerp` openbaar, tijdelijk inlogscript | **Open.** Weghalen of afschermen vóór de pilot |
| F1-21 | belangrijk | Eén lijst "Van fase 1 naar fase 2" ontbreekt | Punt 4 |

## 4. Van fase 1 naar fase 2

**Vóór de migratie van de afname online gaat** (`supabase db push`, PR 35)

| Wat | Bron | Wie |
|---|---|---|
| Nagaan welke apps het lid heeft dat online een `beheerder_sinds` in 2099 heeft. Na de migratie wordt dat het moment van de migratie, en een app die er dan staat telt als bevestigd. Precies één app, door dat lid zelf ingesteld; haal een onbekende of niet-bevestigde weg | `Beheerders.md`, "Bevestigen: wat je controleert" (F1-02) | Bouwer |

**Vóór de eerste migratie van fase 2**

| Wat | Bron | Wie |
|---|---|---|
| Het type van `p_activiteit_id` in de databasetypen: `null` toestaan (aanmaken zonder id) | F1-21 | Bouwer |
| `versie` op activiteiten (vóór de bewerkschermen van fase 2) | `Datamodel-fase-1.md` 2.9 | Bouwer |
| `bijgewerkt` op de tabellen waar het nodig is | F1-21 | Bouwer |
| "Geweest" met de tijdfunctie van de database, op één plek (R16) | F1-10 | Bouwer |
| Seizoenfilter voor het programma | F1-21 | Bouwer |
| `contact_eindverantwoordelijke()` voor de blokkadetekst | F1-21, UX-FLOWS | Bouwer |

**In fase 2 (de schermen die uit fase 1 zijn verschoven)**

| Wat | Bron |
|---|---|
| Welkomscherm (`welkom`, `welkom-leeg`, `welkom-twee`) en het activiteitscherm voor leden | `Fase-1-plan.md` stap B en F |
| Beheeroverzicht met tellers en taken (V8 5.6), activiteit aanmaken als concept en concept verwijderen (V8 4.6), als één beheerscherm met indelen en publiceren | `Fase-1-plan.md`, versmald op 30-10-2026 |
| De browsertests voor wat nu alleen met pgTAP is bewezen: verwijderen als beheerder (V8 4.6), de taak per regel (V8 5.6), het welkomscherm van een lopende activiteit (R16) | `Datamodel-fase-1.md` punt 11 |
| Invoer met een vast schema per aanroep (14.4), vóór de eerste serveractie met invoer | F1-13 |
| De componenten die de schermen nodig hebben: Tijdlijnkaartje, Statuspaneel, Keuzelijst met aankruisvakjes, Stappenbalk, Schakelaar | `Fase-1-plan.md` stap E |

**Vóór de pilot (echte leden, 14 november)**

| Wat | Bron |
|---|---|
| Een eigen afzenderdomein voor de inlogmail (SPF, DKIM, DMARC); tot dan komt de mail soms niet aan bij werkmailsystemen. Wie het domein bezit, is nog te beslissen | `Fase-1-plan.md` 2.7, `Inloggen.md` |
| Het echte e-mailadres in de ontwikkeldatabase: uitzondering vastleggen met doel en einddatum, en opruimen | F1-06 |
| Tweede beheerder, repository naar een organisatie, en een licentie voor de code | F1-09, `Bouwbesluiten` 5.2 en 6 |
| De rem op foute codes meten (een code van 6 tot 10 cijfers is nu de gewone route) | F1-19 |
| Weghalen of afschermen: de lege taken-Worker, `/ontwerp`, `scripts/maak-inloglink.ts` | F1-20 |
| Op Pro: bescherming tegen gelekte wachtwoorden aanzetten | Punt 2.2 |
| De pilotcheck: veilig inloggen, MFA voor beheer, berichten binnen de mailgrens, een teruggezette back-up, twee beheerders | `Bouwbesluiten` 5.2 |
| De overige lijst "Vóór de pilot" uit fase 0 (wissen op verzoek, `drop`-migraties, sessielooptijd, logs, mailgrens) | `Afname-fase-0.md` punt 4 |

**Na de pilot**

| Wat | Bron |
|---|---|
| Kijken welke indexen echt gebruikt worden (de adviseur meldt nu twee ongebruikte) | Punt 2.2 |
| De bevestiging door een tweede beheerder in een scherm, en het herstel zonder dashboard (fase 4) | `Beheerders.md` |
| Grote update van TypeScript en ESLint | `Fase-1-plan.md` 2.6 |

## 5. Dekking

De dekkingsmatrix van fase 1 staat op één plek: `Datamodel-fase-1.md` punt 11, met per regel en foutcode de servertest,
de browsertest en het scherm. Wat de matrix aan browsertests belooft maar nog niet heeft, hangt aan de schermen van
fase 2 en staat in punt 4 hierboven.
