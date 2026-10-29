# Afname fase 0

Stand 29-10-2026. Bewijs per afrondingscriterium (bouwgids 14.6, `Fase-0-plan.md` punt 5), de review van fase 0 als
geheel met wat ermee is gedaan, en de lijst "Van fase 0 naar fase 1". Wie fase 1 begint, leest dit bestand eerst.

**Stand (29-10-2026): fase 0 is af.** Alle vijf criteria zijn gehaald en alle vakjes in "Nog door de bouwer" zijn
afgevinkt. Wat nog moet gebeuren, staat in punt 4 "Van fase 0 naar fase 1". De techniek zelf staat: de review van fase 0 vond niets dat de hostingkeuze of de opzet ter
discussie stelt.

## 1. De vijf criteria

| # | Criterium | Bewijs | Stand |
|---|---|---|---|
| 1 | Alle controles uit stap C groen in GitHub, niet alleen lokaal | Workflow `check` groen op `main` (commit `75ae5f9`, run 40718577763) en op elke pull request; `main` is beschermd (pull request verplicht, ook voor de beheerder; verplichte controle `check`, gebonden aan de GitHub Actions-app). Databasetypen met controle erbij in PR 14 (review F0-02). De testopzet voor gelijktijdigheid schuift naar fase 1, met reden (`Bouwbesluiten` 11, besloten 29-10-2026) | Gehaald |
| 2 | Drie proefroutes geslaagd en gemeten; hostingkeuze in `Bouwbesluiten` | Route 1 (agenda-feed op een iPhone), route 2 (inloggen op een telefoon, na een uur nog ingelogd, uitloggen zonder cookie), route 3 (elke minuut één rij, één testbericht, gedwongen fout zichtbaar): `Fase-0-plan.md` punt 4. Metingen: `docs/hosting.md`, Metingen (mediaan 218 ms CPU per aanvraag, 0 fouten; taken-Worker 0,24 ms). Besluit: `Bouwbesluiten` 3.1 en 6 (OpenNext) | Gehaald |
| 3 | Een schone chat heeft de fase gereviewd tegen hoofdstuk 14, bevindingen in de pull request | Review van fase 0 als geheel (28-10-2026, een nieuwe Claude-subagent zonder het bouwgesprek): 21 bevindingen, oordeel "af na kleine punten". De afhandeling per bevinding staat in punt 3 hieronder en in de pull request van deze afronding. Daarnaast een eigen review per pull request: PR 1, 8, 10, 11, 12 en 14 (PR 14: 9 bevindingen, verwerkt in die pull request of hieronder op de lijst) | Gehaald |
| 4 | Het lege scherm met toetsenbord en op 375 px doorlopen | Geautomatiseerd: axe (WCAG 2.2 AA) op `/`, `/inloggen` (vier toestanden), `/auth/bevestigen` en `/mijn`, op 1200 en 375 px, zonder opzij scrollen; zichtbare focus op de eerste link. Met de hand (28-10-2026): toetsenbord, telefoon en VoiceOver, punt 2.1 | Gehaald |
| 5 | `docs/hosting.md` en de README beschrijven vorm, versies, adapter, geheimen, plek van de taak, lokaal draaien en uitrollen | `docs/hosting.md` (Hoe het werkt, Versies, Keuzes, Metingen, Eenmalig instellen, Geheimen, Als er iets misgaat, Lokaal); README (Lokaal draaien in de juiste volgorde, met een testlid; Uitrollen) | Gehaald |

## 2. Met de hand

### 2.1 Doorloop met alleen het toetsenbord en op 375 px

Door de bouwer, op de site online (`https://ledenplatform.<subdomein>.workers.dev`), met het eigen account van de
bouwer (zonder eigen domein stuurt Resend alleen naar het adres van het account). Per scherm: met Tab door alle links, velden en knoppen; de focus is steeds zichtbaar en de volgorde klopt;
Enter (en Spatie op een knop) doet wat je verwacht; op een telefoon (375 px of smaller) schuift niets opzij. Eén keer
met een schermlezer (VoiceOver op de iPhone of NVDA op Windows): wordt de melding na "Stuur inloglink" voorgelezen?

| Scherm | Toetsenbord | Focus zichtbaar | Telefoon | Schermlezer | Gevonden |
|---|---|---|---|---|---|
| `/` (start) | ☑ | ☑ | ☑ | — | Niets |
| `/inloggen`, leeg en met een fout adres | ☑ | ☑ | ☑ | ☑ | Niets |
| `/inloggen?verstuurd=1` (na versturen) | ☑ | ☑ | ☑ | ☑ | Niets |
| `/inloggen?fout=link` (verlopen link) | ☑ | ☑ | ☑ | — | Niets |
| `/auth/bevestigen` (knop "Inloggen") | ☑ | ☑ | ☑ | — | Niets |
| `/mijn` (knop "Uitloggen") | ☑ | ☑ | ☑ | — | Niets |
| Een pagina die niet bestaat (404) | ☑ | ☑ | ☑ | — | Engelse tekst van Next.js: bekend, fase-1-lijst |

Datum: 28-10-2026 · Apparaat: laptop en iPhone (versies niet genoteerd) · Door: de bouwer · Uitkomst: alles in
orde, niets gevonden.

### 2.2 Supabase-adviseur (bouwgids 14.4)

Door de bouwer: Supabase, het project `ledenplatform-ontwikkel`, Advisors, **Security Advisor** en **Performance
Advisor**, de knop *Rerun linter*. Verwacht: alleen "RLS enabled, no policy" op `proef_taak` en `proef_taak_bericht`
(bewust: niemand anders dan de taak mag erbij).

| Adviseur | Datum | Meldingen | Verwacht? |
|---|---|---|---|
| Security | 28-10-2026 | 0 errors. 1 warning: *Leaked Password Protection Disabled* (Auth). 2 info: *RLS Enabled No Policy* op `public.proef_taak` en `public.proef_taak_bericht` | Info: ja. Warning: bekend, zie hieronder |
| Performance | 28-10-2026 | 0 errors, 0 warnings, 0 info | Ja |

**De warning over gelekte wachtwoorden.** Supabase kan nieuwe wachtwoorden toetsen aan lijsten met gelekte
wachtwoorden (HaveIBeenPwned). Het platform gebruikt geen wachtwoorden: leden loggen in met een link per mail,
aanmelden staat uit, en een lid krijgt geen wachtwoord (`Inloggen.md`). De controle beschermt hier dus niets. Volgens
de documentatie van Supabase kan hij bovendien pas aan vanaf het Pro-plan. Besluit: tot de pilot een bekende warning;
bij de overstap naar Pro zetten we hem aan (Authentication, Attack Protection), zodat de adviseur 0 waarschuwingen geeft
(bouwgids 14.4). Staat op de lijst "Vóór de pilot" hieronder.

### 2.3 Nog door de bouwer (online, niet in de code)

- [x] Doorloop 2.1 ingevuld (28-10-2026).
- [x] Adviseur 2.2 ingevuld (28-10-2026).
- [x] `Bouwbesluiten` 11 (gelijktijdigheid naar fase 1) bevestigd (29-10-2026).
- [x] `VERBODEN_WOORDEN` ook als **Dependabot-geheim** (GitHub, Settings, Secrets and variables, Dependabot), zodat een
      Dependabot-PR groen kan worden (review F0-04). Gezet 29-10-2026; de naam is nagekeken met de GitHub-API.
- [x] Bij de Worker `ledenplatform-taken` alle geheimen en variabelen weg (ook `PROEF_TAAK_FORCEER_FOUT`); in Supabase
      de secret key `proef_taak` weg; in Resend de sleutel van de proef weg (review F0-06, `docs/hosting.md` stap 12).
      Gedaan 29-10-2026.
- [x] Bij de Worker `ledenplatform` het geheim `PROEF_AGENDA_TOKEN` weg, en het abonnement op de telefoon (stap 11).
      Gedaan 29-10-2026; daarna werkt de site nog (inloggen, doorverwijzingen) en geeft de proef-feed 404.
- [x] In `proef_taak` geen nieuwe rijen na het stilzetten (28-10-2026, rond 15:47 UTC): de trigger is echt weg.
      Nagekeken 29-10-2026.

## 3. De review van fase 0: bevindingen en afhandeling

Ernst volgens de reviewer. "PR 14" is de technische afronding; "afronding" is de pull request met dit bestand.

| ID | Ernst | Bevinding | Afhandeling |
|---|---|---|---|
| F0-01 | blokkerend | Geen afnamebewijs; toetsenbord-doorloop niet vastgelegd | Dit bestand; de doorloop en de adviseur in punt 2 (bouwer) |
| F0-02 | blokkerend | Databasetypen en de testopzet voor gelijktijdigheid ontbreken | Typen met controle: PR 14. Gelijktijdigheid: naar fase 1, `Bouwbesluiten` 11 (besloten 29-10-2026) |
| F0-03 | blokkerend | Hostingkeuze en metingen niet afgesloten in de documenten | Afronding: `Bouwbesluiten` 3.1 en 6, `hosting.md` Metingen, `CLAUDE.md`, `Fase-0-plan.md` |
| F0-04 | belangrijk | Dependabot-PR's worden nooit groen | Bouwer zet het Dependabot-geheim (2.3); `hosting.md` beschrijft hoe een Dependabot-PR wordt beoordeeld |
| F0-05 | belangrijk | De site antwoordt over http | PR 14: 308 naar https in de middleware, gecontroleerd na elke uitrol |
| F0-06 | belangrijk | Wegwerpcode en geheimen blijven actief | Geheimen weg door de bouwer (2.3); `hosting.md` spreekt zichzelf niet meer tegen; de code gaat weg in fase 1 (punt 4) |
| F0-07 | belangrijk | Wat naar fase 1 moet staat op zeven plekken | Punt 4 hieronder, ook de punten die alleen in pull requests stonden |
| F0-08 | belangrijk | Review niet afgedwongen voor gevoelige pull requests | Regel in `CLAUDE.md` (Werkwijze): eigen review bij migraties, middleware, inloggen, workflows en poort. PR 14 kreeg die al |
| F0-09 | belangrijk | De controle op omwegen mist `test.fail` en de databasetests | PR 14 |
| F0-10 | belangrijk | De rechtentest dekt alleen objecten van `postgres` | PR 14; vastgelegd in `Bouwbesluiten` 10 |
| F0-11 | belangrijk | Migraties en Auth-instellingen online buiten de pijplijn | Open besluit met deadline: vóór de eerste migratie van fase 1 (`Bouwbesluiten` 3.1 en 6) |
| F0-12 | belangrijk | Overdracht hangt aan één persoon; geen register van geheimen | Register in `hosting.md`, Geheimen. Tweede beheerder: besluit vóór fase 1 (`Bouwbesluiten` 6) |
| F0-13 | belangrijk | Geen licentie voor de code, geen controle op pakketlicenties | Deadline in `Bouwbesluiten` 6; licentiecontrole op de fase-1-lijst |
| F0-14 | klein | De controle na de uitrol bewijst minder dan ze zegt | PR 14 (commentaar en melding) en `hosting.md`. Een gezondheidsroute: fase-1-lijst |
| F0-15 | klein | axe niet op alle schermen; Engelse 404 en foutpagina | axe op `/auth/bevestigen` en `/mijn`: PR 14. 404 en foutpagina: ontwerpgat, fase-1-lijst |
| F0-16 | klein | "Lokaal draaien" in de README klopt niet | PR 14, met `npm run lid:lokaal` |
| F0-17 | klein | Verouderde teksten en kleine resten | PR 14 (script `start`, seed, README) en afronding (`Fase-0-plan.md`, `hosting.md`) |
| F0-18 | klein | Inloggen heeft geen wireframe of use case | Gemeld als ontwerpgat; fase-1-lijst |
| F0-19 | klein | De poortcontrole op de taken-Worker is niet transitief | PR 14 |
| F0-20 | klein | Het draaiboek mist twee storingen | `hosting.md`: project gepauzeerd, geen inlogmails meer |
| F0-21 | klein | De stap met de namenlijst draait code uit de pull request | PR 14: het script komt uit `main` en draait vóór alle code uit de pull request |

## 4. Van fase 0 naar fase 1

Alles wat uit fase 0 nog moet gebeuren, op één plek (review F0-07). De bron staat erbij; daar staat de uitleg.

**Vóór de eerste migratie van fase 1**

| Wat | Bron | Wie |
|---|---|---|
| Datamodel en rechten uitgewerkt en gereviewd (identiteit, privé en publiek, rechten, rolstructuur) | `Bouwbesluiten` 4 | Bouwer, review door een schone chat |
| Besluit: migraties en Auth-instellingen online via een job in `uitrol`, of met de hand met een regel in het PR-sjabloon | `Bouwbesluiten` 3.1 en 6 (F0-11) | Bouwer |
| Proefcode opruimen: `src/app/proef/`, `PROEF_AGENDA_TOKEN` in de code en `scripts/schrijf-env-lokaal.ts`, `scripts/agenda-testtoken.ts` en die controle in `controleer-online.ts`, `src/taken/proef-taak.ts` met zijn tests (`e2e/geplande-taak.spec.ts`, `supabase/tests/database/proef_taak.test.sql`), en een migratie die `proef_taak` en `proef_taak_bericht` verwijdert. `taken/worker.ts` blijft als lege taken-Worker tot fase 7 | `Fase-0-plan.md` 4 (F0-06) | Bouwer |
| Pilotmoment kiezen | `Bouwbesluiten` 6 | Bouwer |

**Vóór fase 1 (of bij het begin)**

| Wat | Bron | Wie |
|---|---|---|
| Wie de tweede beheerder wordt, en de repository naar een organisatie | `Bouwbesluiten` 5.2 en 6 (F0-12) | Bouwer met het bestuur |
| Licentie van de code bekijken; een controle op de licenties van pakketten (kleine eigen controle op `node_modules/*/package.json`, geen nieuw pakket) | `Bouwbesluiten` 6 en 8 (F0-13) | Bouwer met de stagebegeleider en de vereniging |
| Iconen voor de app: open set of buiten de repo | `Bouwbesluiten` 6, `Fase-0-plan.md` 1.4 | Bouwer |
| Grote update van TypeScript en ESLint bekijken | `Bouwbesluiten` 9 | Bouwer |
| Dekkingsmatrix (regels en foutcodes naar tests) | `Bouwbesluiten` 4.7 | Bouwer |
| Hoe "invoer met een vast schema per aanroep" (14.4) wordt gedaan: een schemabibliotheek (nieuw pakket: eerst voorleggen) of een eigen patroon, vóór de eerste serveractie met invoer | Review F0-07 | Bouwer |
| Seed met het programma 2026/2027 | Bouwgids 13.5 | Bouwer |

**Ontwerpgaten (de ontwerper maakt de wireframe, de code neemt de tekst over; bouwgids 14.3)**

| Wat | Bron |
|---|---|
| De inlogschermen: `/inloggen` met zijn meldingen, `/auth/bevestigen`, de inlogmail en "Mijn account". De teksten nu zijn zelf bedacht | Review F0-18 |
| Een 404 en een foutpagina in het Nederlands (nu de Engelse standaard van Next.js, op een pagina met `lang="nl"`) | Review F0-15 |
| Een melding bij een storing van Supabase (nu eindigt `/mijn` op `/inloggen`, alsof het lid is uitgelogd) | Review PR10-03, `hosting.md` |

**Bij de eerste schrijffunctie met een rij-lock (fase 1 of 2)**

| Wat | Bron |
|---|---|
| De testopzet voor twee gelijktijdige sessies | `Bouwbesluiten` 11 (F0-02) |
| Functies of tabellen die bewust een recht krijgen, op de lijst in `rechten.test.sql` | `Bouwbesluiten` 10 (F0-10) |

**Vóór de eerste tabel van fase 1** (uit de review van PR 14)

| Wat | Bron |
|---|---|
| Leesrechten van `authenticated` per tabel toetsen, met een lijst van bewust toegestane tabellen, en de tests per rol uit 14.4 (een beleid `using (true)` valt nu nergens op) | Review PR14-02 |
| De rechtentests lopen alleen over `public`: in `controle:poort` eisen dat `[api] schemas` in `supabase/config.toml` niet verandert, of de tests over die lijst laten lopen | Review PR14-02 |
| Eén fabriek per soort Supabase-client in `src/lib/supabase/`, en een ESLint-regel die `createClient` en `createServerClient` daarbuiten verbiedt, zodat elke client de databasetypen gebruikt | Review PR14-08 |

**Vóór de pilot (echte leden)**

| Wat | Bron |
|---|---|
| De pilotcheck: veilig inloggen, MFA voor beheer, berichten binnen de mailgrens, een teruggezette back-up, twee beheerders | `Bouwbesluiten` 5.2 |
| Workers betaald ($5), en Supabase Pro in Frankfurt | `Bouwbesluiten` 3.1, 3.2, 10 |
| Op Pro: bescherming tegen gelekte wachtwoorden aanzetten, zodat de Security Advisor 0 waarschuwingen geeft | Punt 2.2 |
| Looptijd van de sessiecookie: nu blijft een lid tot ±400 dagen ingelogd, ook op een gedeelde computer. Ontwerpkeuze | Review PR10-02 |
| Logs: een tussenvorm (alleen eigen meldingen), zodat een mislukte verzending zichtbaar is | `hosting.md`, Keuzes |
| De mailgrens beschermen (Turnstile of een eigen limiet) | `hosting.md` (F0-20) |
| Lokaal ook een asymmetrische JWT-sleutel; de oude gedeelde sleutel online intrekken | `hosting.md` stap 10 |
| Eventueel een route `/gezond` die Supabase echt aanroept, zodat de controle na de uitrol een fout adres of sleutel ziet | Review F0-14 |

**Doorlopend**

| Wat | Bron |
|---|---|
| De override van `glob` weghalen zodra de adapter het zelf goed heeft | `hosting.md`, Versies |
| Een droge bundel van de taken-Worker in de poort (`wrangler deploy --dry-run` vanuit alleen de sparse paden), als de importcontrole te krap blijkt | Review F0-19 en PR14-04 |
| Bij een update van Next.js of OpenNext: "Als een update de middleware breekt" | `hosting.md` |
| De echte agenda-feed (fase 7) en de dagmelding (fase 7): de lessen uit de proef | `Fase-0-plan.md` 4, route 1 en 3; `Bouwbesluiten` 5.4 |
| Bouwgids V9, bij voorkeur na fase 1 | `Bouwbesluiten` 7 |

**Al gedaan, uit eerdere reviews:** de bron van de verplichte controle `check` staat vast op de GitHub Actions-app
(review PR8-02); een eigen review voor gevoelige pull requests staat in `CLAUDE.md` (review F0-08).
