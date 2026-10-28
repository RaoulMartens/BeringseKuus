# Fase 0: plan

Stand 27-10-2026. **Er is nog niets aangemaakt of uitgevoerd.** Dit plan wacht op het akkoord van de bouwer
(punt 1). Bron: bouwgids V8 hoofdstuk 10 en 14, `Bouwbesluiten-2026-10-27.md` punt 3 en 4.

**Doel (V8 10, fase 0):** project opzetten (GitHub, Supabase, Cloudflare, Next.js), inloggen werkt, en de
poort uit hoofdstuk 14 is op een **lege app al groen**. Daarbovenop de drie proefroutes uit
`Bouwbesluiten` 3.1, die op echte Workers bewijzen dat de hostingkeuze werkt.

**Wat Claude niet doet.** Accounts aanmaken, wachtwoorden of sleutels invoeren, betalen, instellingen bij
leveranciers wijzigen: dat doet de bouwer zelf. Claude schrijft de code, de configuratie, de tests en de
handleiding, en zegt bij elk stap wat de bouwer zelf moet doen.

## 1. Beslissen vóór we beginnen

Tijdens het uitzoeken kwamen drie dingen naar boven die het plan veranderen. Elk heeft een keuze nodig.

### 1.1 Repository: publiek (besloten door de bouwer, 27-10-2026)

14.1 eist een beschermde `main`. Volgens GitHub's documentatie (27-10-2026) is dat op een **privé**
repository niet beschikbaar op het gratis plan; ook push protection voor geheimen en secret scanning
voor privé-repositories vragen een betaald plan. Op een **publieke** repository zijn ze gratis.

| Optie | Gevolg |
|---|---|
| **A. Publieke repository** | Gratis poort. Alles in de repo is openbaar: geen ledengegevens, geen sleutels, geen Central-iconen, geen foto's van de vereniging (14.7), geen `docs/visueel/` met die bestanden. Alleen fictieve testdata. Code is zichtbaar voor iedereen (voor een vereniging acceptabel, maar jij en het bestuur beslissen) |
| **B. Privé met betaald plan** | GitHub Pro of Team (prijs nog niet nagekeken, in de orde van enkele dollars per maand) |
| **C. Privé zonder bescherming** | **Niet toegestaan** door 14.1; zou een wijziging van hoofdstuk 14 vragen |

**Besluit: A, een publieke repository op GitHub**, zonder gelicentieerde bestanden, foto's of
ledengegevens (punt 1.4). Het houdt de kosten laag en de poort eerlijk. De bouwer legt het bij het bestuur neer
dat de code openbaar is; de eigen ontwikkelserver van de bouwer is geen vervanger voor GitHub (code en poort) en niet
voor Cloudflare Workers (de app), maar kan gelicentieerde bestanden en het prototype tonen, mits de licentie
dat toestaat (punt 1.4).

### 1.2 Windows wordt door OpenNext niet volledig ondersteund

De documentatie van de OpenNext-adapter zegt dat Windows niet volledig wordt ondersteund en raadt WSL, een
Linux-VM of bouwen in CI op Linux aan. Je werkt op Windows 11.

- **Advies:** bouwen en testen in **WSL2** (Ubuntu), met de repository in het Linux-bestandssysteem en niet in
  OneDrive. Deploy via GitHub Actions op Linux. Dit past ook bij de poort: dezelfde controles lokaal en in CI.
- Tegenstrijdig met de huidige projectmap in OneDrive: de repository komt **niet** in OneDrive te staan
  (synchronisatie van `node_modules` en `.git` geeft problemen).

### 1.3 `@ts-ignore` in het voorbeeld van OpenNext

Het voorbeeld voor een eigen worker met geplande taak gebruikt `@ts-ignore`. 14.1 verbiedt dat. Los het op met
een typebestand (`declare module` voor het gegenereerde `.open-next/worker.js`), niet met een uitzondering.

### 1.4 Wat nooit in de publieke repository komt

Alles wat in een publieke repository staat, blijft in de geschiedenis staan, ook na verwijderen. Dus vóór de
eerste `git push` controleert de bouwer de eerste commit met de hand.

| Hoort er niet in | Waarom | Waar wel |
|---|---|---|
| Ledengegevens: namen, e-mail, telefoon van echte leden; de ledenlijst; Excel-bestanden met leden | AVG | Alleen in Supabase. Testdata is fictief |
| Sleutels en wachtwoorden: service-role-sleutel, Resend-sleutel, `.env*` | Geheimen (14.4) | GitHub Secrets, `wrangler secret`, `.env.local` buiten git |
| De Central-iconen (set en losse bestanden) | Licentie Iconists: niet openbaar delen (V8 14.7) | Bij de bouwer; zie hieronder wat de app dan gebruikt |
| Foto's van de website van de vereniging, de afbeeldingen van prins en adjudant | Auteursrecht, geen toestemming (V8 14.7) | eigen ontwikkelserver van de bouwer, voor het prototype |
| `docs/visueel/` als geheel, `docs/uitrol/`, `docs/versies/` en de gegenereerde prototype-HTML | Bevatten iconen en foto's | Stage-map |
| De mails en statusupdates in `docs/communicatie/`, de reviews met naam en de gegevens over de begeleider | Persoonlijke en interne communicatie | Stage-map |
| Namen van de opdrachtgever, de developer-reviewer en de bouwer in de gekopieerde documenten | Derden zonder toestemming genoemd | Vervang door rollen ("de opdrachtgever", "de bouwer") in de kopieën die in de repo komen, of vraag toestemming |

**Wel in de repo:** code, tests, migraties, `CLAUDE.md`, `docs/hosting.md`, `docs/licenties.md`, de
gekopieerde en opgeschoonde bronnen uit stap A, `stijl.css` en de tokens (alleen CSS, geen lettertype- of
beeldbestanden), de Libron- en Nunito-bestanden met hun licentietekst (SIL OFL 1.1; Libron komt uit de
gebruikerslettertypen op deze computer, controleer de licentietekst in het bestand zelf), een eigen logo
alleen met toestemming van de vereniging.

**Open punten die dit raakt**

1. **Iconen.** De app heeft iconen nodig, maar de Central-set mag niet in de publieke repo. Beslis vóór fase 1
   (componenten): (a) een open iconenset (bijvoorbeeld Lucide, ISC-licentie, niet nagelopen) als vervanger,
   met als gevolg dat het uiterlijk afwijkt van het ontwerp; of (b) de iconen buiten de repo houden en in
   de build binnenhalen uit een privé bron. Lees eerst de Iconists-licentie: mag een site de iconen
   uitleveren en mag de vereniging dat na je stage blijven doen? In fase 0 zijn er geen iconen nodig.
2. **Het programma 2026/2027 als seed** (V8 13.5). Besloten (27-10-2026): het mag in de repo. De vereniging
   publiceert haar programma elk seizoen zelf op haar website; het bevat alleen data en namen van activiteiten.
3. **Foto's en logo.** Toestemming van de vereniging vóór gebruik in de echte app (V8 14.7).
4. **eigen ontwikkelserver van de bouwer.** Past alleen voor het prototype en gelicentieerde bestanden, en alleen als de
   licentie het toestaat. Of de server Node.js kan draaien is niet bekend; voor de app is dat niet nodig.

**Wat de poort hier aan toevoegt (stap C):** een controle die faalt op afbeeldingen, lettertypen en
iconen in de repo die niet in `docs/licenties.md` staan (V8 14.7: zonder vermelding komt het niet in de
hoofdcode), en een controle die faalt op `.env`-bestanden en op bestandsnamen uit de lijst hierboven.

## 2. Wat de bouwer zelf moet regelen

| Wat | Wie doet het | Opmerking |
|---|---|---|
| GitHub: account of organisatie, nieuwe **publieke** repository | De bouwer | Naam voorstel: `ledenplatform-beringse-kuus`; denk eraan dat een merknaam in een openbare repo-naam ook zichtbaar is voor iedereen. Voorkeur: een **organisatie**, zodat de overdracht (twee beheerders, V8 8.4) later niet aan van de bouwer persoonlijke account hangt |
| Supabase: nieuw project, gratis plan, regio EU | De bouwer | Alleen fictieve data. Wie is eigenaar van de organisatie? Ook dit moet overdraagbaar zijn |
| Cloudflare: account, Workers | De bouwer | Gratis plan. `workers.dev`-adres volstaat voor de proef |
| Resend | De bouwer | Voor de proef volstaat Supabase's ingebouwde mail (alleen naar teamleden, 2 per uur) of Resend naar je eigen adres. Een eigen domein is pas nodig voor de pilot |
| Docker Desktop of Docker in WSL | De bouwer | Nodig voor de lokale Supabase en de databasetests |
| Sleutels en wachtwoorden | De bouwer | In GitHub Secrets en in `.env.local` (niet in git). Claude vraagt er nooit om in de chat |

## 3. Stappen

Volgorde klopt met de afhankelijkheden; elke stap eindigt met iets dat je kunt controleren.

### Stap A: werkplek en repository

1. WSL2 met Ubuntu, Node.js (LTS), Docker, Git. Controle: `node -v`, `docker run hello-world`.
2. **Publieke** repository aanmaken, bij voorkeur onder een organisatie. Eerste commit met alleen `README.md`,
   `.gitignore` (met `.env*`, `node_modules`, `.open-next`, `.wrangler`), `.editorconfig`, een lege `docs/licenties.md`.
3. `CLAUDE.md` in de root: de inhoud van `docs/bouw/CLAUDE-code-repository.md`, commentaar weggehaald.
4. `docs/` in de repo: alleen opgeschoonde kopieën van wat de code nodig heeft, zonder persoonsnamen
   (punt 1.4): `Bouwbesluiten`, `Design-overdracht`, `use-cases.md`, `UX-FLOWS.md` (nodig voor de
   dekkingsmatrix; telt veel namen, dus eerst opschonen), de wireframes met `INDEX.md` (eerst controleren op
   namen en bestanden met een licentie), `stijl.css` en de `INDEX.md` van de visuele versie. De bouwgids en het FO als docx bevatten namen en blijven in de
   stage-map tot ze zijn opgeschoond. **De bouwer bekijkt deze kopieën voordat ze worden gepusht**; Claude
   maakt de opgeschoonde kopie en een lijst van wat is vervangen.
5. Beschermde `main`, secret scanning en push protection aanzetten (gratis op een publieke repo) voordat
   de eerste echte code erin gaat.
6. `docs/licenties.md` (14.7): bron en licentie per lettertype, icoon, logo en afbeelding.

### Stap B: de lege app

1. Next.js (laatste 16.x), TypeScript, App Router, `src/`-map. **Versie vastzetten** (exacte versie, geen `^`).
2. `tsconfig`: `strict`, `noUncheckedIndexedAccess`. Geen `any`, geen `@ts-ignore`.
3. ESLint (nul fouten en nul waarschuwingen) en Prettier.
4. `lang="nl"`, `<header>`, `<nav>`, `<main>`, één `<h1>` in het lege scherm.
5. Beveiligingsheaders: Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options,
   Referrer-Policy, `frame-ancestors 'none'`.
6. Scripts uit het sjabloon (`check`, `typecheck`, `lint`, `format:check`, `test`, `test:db`, `test:e2e`).

### Stap C: de poort (V8 14)

Controle: op de lege app is alles groen, lokaal én in GitHub.

| Eis (V8) | Hoe |
|---|---|
| 14.1 Beschermde `main`, pull request, alle controles groen, review | Branch protection of ruleset; verplichte controles; PR-sjabloon met een kopje "Review" en een regel dat de bouwgids (V4 t/m V8) niet door een developer is beoordeeld, alleen door een AI-review (zonder namen: de repo is publiek) |
| 14.1 Geen omwegen | Een eigen controle die faalt op `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `.skip` en `.only` |
| 14.2 Strak | `tsc`, ESLint met `--max-warnings 0`, Prettier `--check`; databasetypen gegenereerd met `supabase gen types` en gecontroleerd op wijzigingen |
| 14.3 Toegankelijk | Playwright met axe op elk scherm, 1200 en 375 px, nul overtredingen; handmatig toetsenbord en telefoon per fase |
| 14.4 RLS overal | Een databasetest die faalt zodra een tabel zonder RLS bestaat (bestaat nog niet: de test wordt eerst geschreven en moet slagen op de lege database) |
| 14.4 Geheimen | Secret scanning en push protection aan (gratis, publieke repo); `.env*` in `.gitignore`; sleutels alleen in GitHub Secrets; controle op `.env`-bestanden in de repo |
| 14.7 Licenties, publieke repo | `scripts/controleer-repo.mjs` (geschreven, met tests): faalt op afbeeldingen, svg-iconen, lettertypen, pdf, media en spreadsheets die niet volledig in `docs/licenties.md` staan, op `.env`-bestanden en sleutels, op de bestanden uit punt 1.4 (iconenset, foto's, communicatie, archieven, ledenbestanden), en op echte e-mailadressen, mobiele nummers en woorden uit de lijst `VERBODEN_WOORDEN`. Draait in `npm run check` zodra fase 0 stap C er is |
| 14.4 Afhankelijkheden | `npm audit --audit-level=high` in CI; Dependabot aan |
| 14.4 Supabase | De beveiligingsadviseur geeft nul waarschuwingen; handmatige controle in fase 0 |
| 14.4 Headers | Een test die de headers van stap B controleert |
| 14.5 Gelijktijdigheid | Pas relevant vanaf fase 2; in fase 0 alleen de testopzet voor twee gelijktijdige sessies |

Workflow `check`: typecheck, lint, format, unit, `test:db` (lokale Supabase in Docker), `test:e2e`, audit.
Eén workflow die ook lokaal met `npm run check` hetzelfde doet.

### Stap D: Supabase en inloggen

1. `supabase init`, map `supabase/migrations/`. **Alleen migraties, nooit met de hand in het dashboard.**
2. Auth: magic link aan; wachtwoordinlog uit; MFA (TOTP) aan voor het project; omleidings-URL's
   (lokaal, `workers.dev`) toevoegen.
3. Nog **geen** tabellen met ledengegevens: die komen in fase 1 volgens `Bouwbesluiten` 4. Wel één
   migratie voor de proeftabel van route 3.
4. Een inlogpagina (e-mailadres, "stuur link"), een beschermde pagina "Ingelogd als …" en uitloggen.
5. Controle: inloggen en uitloggen werkt lokaal en op de gedeployde Worker.

### Stap E: Cloudflare Workers met OpenNext

1. `@opennextjs/cloudflare` en `wrangler`; `wrangler.jsonc` met `nodejs_compat` en `compatibility_date`
   van de dag van opzetten; `open-next.config.ts`.
2. Eigen worker met een `scheduled`-methode, zodat route 3 kan draaien. Typebestand in plaats van
   `@ts-ignore` (punt 1.3). **Verschoven naar proefroute 3** (28-10-2026, PR 8): zonder geplande taak zou het
   dode code zijn, en `Bouwbesluiten` 3.1 laat `pg_cron` als alternatief open. Uitvoering van stap E:
   `docs/hosting.md`.
3. Deploy via GitHub Actions op Linux, alleen vanaf `main` na groene controles. Secrets in GitHub en
   `wrangler secret`, niet in de repository.
4. Controle: de lege app staat op een `workers.dev`-adres, met de headers van stap B.

## 4. De drie proefroutes (`Bouwbesluiten` 3.1)

Elke route is wegwerpcode onder `/proef/`, met een test, en wordt na de beslissing verwijderd of omgebouwd.
**Beoordeeld op de gedeployde Worker, niet alleen lokaal.**

### Route 1: de `.ics`-route (agenda-feed)

- `GET /proef/agenda/[token].ics` geeft een geldig iCalendar-bestand met één afspraak (tijdzone
  `Europe/Amsterdam`, eindtijd na middernacht, CRLF, escaping, stabiele UID).
- Headers: `Content-Type: text/calendar`, `Cache-Control: private, no-store`. Onbekend of ongeldig token:
  uniform foutantwoord zonder gegevens. Het token komt **niet** in een log.
- **Klaar als:** een onafhankelijke iCal-parser leest het bestand zonder fouten; het antwoord komt van de
  Worker; de rekentijd per aanvraag is gemeten.
- **Uitkomst (28-10-2026, lokaal):** `src/app/proef/agenda/[bestand]/route.ts`, geschreven bestand in
  `src/lib/agenda/ics.ts`. ical.js (Mozilla, alleen in de tests) leest het goed terug, ook de tijdzone en de eindtijd na
  middernacht; de browsertests op de Worker in workerd slagen. `Cache-Control`: de agenda (200) houdt
  `private, no-store` zoals gezet; alleen de 404 maakt Next.js strenger (`private, no-cache, no-store, …`). Alleen
  over https (behalve op de eigen computer). Review: `docs/bouw/Review-PR11` in de stage-map, 10 punten verwerkt.
  Online te bevestigen: `docs/hosting.md` stap 11 (abonneren op een telefoon) en de rekentijd.
- **Voor de echte feed in fase 1** (uit de review van PR 11):
  - de UID afleiden van `activiteiten.id` (uuid), zonder naam of datum: anders staat een verschoven activiteit
    dubbel in de agenda; `SEQUENCE` en `LAST-MODIFIED` toevoegen (Bouwbesluiten 5.4);
  - het token opzoeken via een RPC met POST, nooit in de query-string van de API (dan staat het in de logs van
    Supabase), en in de database een hash van het token bewaren, niet het token zelf;
  - bij een storing van de database 503 geven, niet dezelfde 404 (anders gooit een agenda-app de afspraken weg);
  - de middleware slaat de feed al over (geen sessie); het pad in `src/middleware.ts` meenemen als het verandert.

### Route 2: inloggen met een magic link

- `@supabase/ssr` met cookies, `/auth/callback`, middleware die de sessie ververst, beschermde pagina,
  uitloggen, een verlopen of ongeldige link met een begrijpelijke melding en "stuur opnieuw".
- **Klaar als:** inloggen via de link in de mailapp op een telefoon, sessie blijft na herladen, een tweede
  keer dezelfde link wordt geweigerd, en uitloggen werkt. Alles op de gedeployde Worker.
- **Let op, nog niet bewezen:** Next.js 16 noemt middleware nu *proxy*, en OpenNext ondersteunt volgens zijn
  documentatie geen Node.js-middleware. Controleer in deze proef welke bestandsnaam en welke runtime werken
  (een gewone `middleware`, of een andere Next-versie). Dit is de grootste onzekerheid.
- **Uitkomst (28-10-2026):** beide werken lokaal in workerd; gekozen is `middleware.ts` met de edge-runtime
  (`Bouwbesluiten` 3.1, `docs/hosting.md`). **Online bevestigd (28-10-2026):** inloggen met de link op een telefoon,
  na herladen en na ruim een uur nog ingelogd, een gebruikte link geweigerd, uitloggen (ook met een verlopen
  sessie) laat geen sessiecookie achter, CSP met nonce op elke pagina. Route 2 is geslaagd.

### Route 3: een geplande taak

- Een Worker-cron (`scheduled`) of Supabase `pg_cron` die elke minuut een route aanroept; de route
  schrijft een rij in `proef_taak` met een vaste sleutel per minuut, zodat een dubbele start niet dubbel
  telt, en verstuurt hooguit één testbericht naar de bouwer.
- Beveiliging: de route accepteert alleen een geheime header, nooit een openbare aanroep.
- **Klaar als:** na tien minuten staan er tien rijen, zonder dubbele, en een geforceerde fout laat een
  zichtbare mislukte status achter.
- **Uitkomst (28-10-2026, lokaal):** gekozen is een **Workers Cron Trigger in een eigen taken-Worker**
  (`taken/`, `ledenplatform-taken`), zonder route en zonder adres; de taak in `src/taken/proef-taak.ts`. Alleen die
  Worker krijgt de geheime sleutel (review PR12-01). De minuut is de sleutel in `proef_taak`, met de uitkomst van de
  laatste poging; het testbericht wordt eerst geclaimd, dan verstuurd, en krijgt een status. Lokaal bewezen in workerd
  (`/__scheduled` twee keer: één rij), met databasetests en unittests (ook de gedwongen fout en de aanroepen naar
  Supabase en Resend). Review: `docs/bouw/Review-PR12` in de stage-map. Online te bevestigen: `docs/hosting.md`
  stap 12.
- **Voor fase 7** (uit de review van PR 12): een dagmelding rekent met een dag in `Europe/Amsterdam`, met een sleutel
  per lid per dag; per bericht een rij met status, poging en fout, en de claim en statuswissel in een
  databasefunctie; een Idempotency-Key per bericht bij Resend. Cloudflare belooft geen "precies één keer": ontwerp op
  "minstens één keer".

### Metingen en beslissing

| Meting | Waar | Drempel |
|---|---|---|
| Rekentijd per aanvraag (route 1 en 2) | Cloudflare observability | Gratis plan: 10 ms; boven: betaald ($5) |
| Gecomprimeerde bundelgrootte | uitvoer van `wrangler` | OpenNext noemt 3 MiB op het gratis plan; een Cloudflare-changelog zegt dat die grens is verdwenen. Meet en leg vast |
| Alle drie routes slagen | gedeployde Worker | Ja → OpenNext blijft |

Slaagt een route niet, dan dezelfde drie tests met **vinext**, en daarna beslissen. Leg de uitkomst met reden
vast in `Bouwbesluiten`.

## 5. Afronding (V8 14.6)

Fase 0 is af als:

1. alle controles uit stap C groen zijn in GitHub, niet alleen lokaal;
2. de drie proefroutes zijn geslaagd en gemeten, en de hostingkeuze staat in `Bouwbesluiten`;
3. een schone chat de fase heeft gereviewd tegen hoofdstuk 14, met de bevindingen in het pull request;
4. het lege scherm met toetsenbord en op 375 px is doorlopen;
5. `docs/hosting.md` beschrijft deploymentvorm, versies, adapter, secrets en de plek van de geplande taak,
   en de README beschrijft hoe je het lokaal draait en deployt.

## 6. Risico's en onbekenden

| Risico | Wat dan |
|---|---|
| Next.js 16 *proxy* tegen OpenNext zonder Node-middleware | Route 2 faalt. Probeer `middleware.ts` (Edge), of Next 15, of vinext |
| Cron met een eigen worker is niet bewezen | Terugval: `pg_cron` in Supabase met een beveiligde route |
| Gratis plan: 10 ms rekentijd of bundelgrootte | Betaald plan ($5), of kleiner bouwen |
| Iets gevoeligs belandt per ongeluk in de publieke repo | Eerste commit met de hand bekijken; controles uit punt 1.4; secret scanning aan. Lekt er toch iets (sleutel of lid), dan eerst de sleutel intrekken of de gegevens als gelekt behandelen: de geschiedenis wissen is geen oplossing |
| Iconen voor de app (punt 1.4) | Open iconenset of build-injectie; beslissen vóór fase 1 |
| Windows (punt 1.2) | WSL2 en CI op Linux |
| Eigenaarschap van accounts | Eerst op naam van de bouwer is een risico voor de overdracht; kies waar mogelijk een organisatie van de vereniging |
| Lokale Supabase vraagt Docker | Controleer geheugen en WSL-instellingen vóór stap C |

## 7. Wat dit plan níet doet

- Geen tabellen met ledengegevens (fase 1).
- Geen schermen uit het ontwerp en geen componenten uit `Design-overdracht` (begin fase 1).
- Geen echte leden, geen echte e-mailadressen, geen Resend-domein.
