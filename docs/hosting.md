# Hosting: Cloudflare Workers met OpenNext

Stand 28-10-2026, fase 0 stap E, bijgewerkt na de review van PR 8. Hoort bij `Bouwbesluiten` punt 3 en bouwgids
14.6 punt 5. Dit bestand beschrijft hoe de app online komt, met welke versies, wat je eenmalig instelt, en wat je
doet als er iets misgaat.

## Hoe het werkt

1. `npm run build:worker` draait `next build` en zet het resultaat met de OpenNext-adapter om naar `.open-next/`:
   één Worker (`.open-next/worker.js`) en de vaste bestanden (`.open-next/assets/`).
2. Uitrollen gebeurt **alleen** in GitHub Actions (`.github/workflows/uitrol.yml`). Er is geen script om vanaf een
   laptop uit te rollen, en `controle:poort` faalt als er een bijkomt.
3. De uitrol start pas als de workflow `check` groen is na een push op `main` van deze repository, en alleen als
   die commit nog de nieuwste `main` is. Een pull request rolt nooit uit; met de hand starten kan niet.
4. Job **bouw** (zonder geheimen): installeren, bouwen, controleren dat er geen waarden uit een `.env`-bestand in de
   bundel zitten, en alleen `.open-next/` bewaren. Job **uitrol** (met het Cloudflare-token): alleen wrangler uit
   `uitrol/`, geïnstalleerd zonder installatiescripts. Die rolt twee Workers uit: de app (`.open-next/` uit de job
   bouw) en de taken-Worker (`taken/`). De configuratie (`wrangler.jsonc`, `taken/wrangler.jsonc`) en de code van de
   taken-Worker komen uit git, niet uit de job bouw: een aangepaste configuratie zou anders een build-commando naast
   het token kunnen draaien (review PR12-05). `controle:poort` eist dat het artefact alleen `.open-next/` bevat, dat
   geen configuratie een `build` heeft, en dat de taken-Worker geen pakketten importeert.
5. Daarna wacht `scripts/controleer-online.ts` tot de site de nieuwe versie uitlevert (`/BUILD_ID`), en controleert
   de exacte beveiligingsheaders op `/` en op een vast bestand, of `/inloggen` antwoordt, en of `/mijn` een bezoeker
   zonder sessie doorstuurt naar `/inloggen`. Dat laatste lukt alleen als de Worker Supabase kan bereiken;
   `/inloggen` zelf toont het formulier ook zonder Supabase-gegevens. Ook: het publieke testtoken van de agenda-feed
   geeft het kale "Niet gevonden" van de route. Dat de feed met het echte token werkt, bewijst alleen stap 11 (met de
   hand): het echte token hoort niet in GitHub.

De **browsertests** (`npm run test:e2e`) draaien tegen dezelfde build in workerd, de runtime van Cloudflare
(`wrangler dev`), en niet tegen `next start`. Zo test de poort wat er online gaat. Alle browsertests slagen daar,
ook het inloggen met de link per mail (stap D2).

**De middleware** (`src/middleware.ts`) draait vóór alles wat bij de Worker komt: pagina's, 404's, het vooraf
ophalen van links. Niet vóór bestaande vaste bestanden; die serveert Cloudflare zelf. Hij doet twee dingen:

- **CSP met een nieuwe nonce per aanvraag.** Alleen scripts met die nonce mogen draaien, geen `'unsafe-inline'`.
  Omdat de nonce per aanvraag is, worden alle pagina's per aanvraag gemaakt (`connection()` in `layout.tsx`).
- **Een verlopen sessie verversen**, zodat een lid niet na een uur uitgelogd raakt. Niet zonder sessiecookie (dan
  geen aanroep naar Supabase), niet bij een serveractie (die regelt zijn eigen cookies; anders bleef bij uitloggen
  een nieuwe sessie staan), en hooguit 3 seconden: antwoordt Supabase niet, dan gaat de pagina zonder verversen door.

De sessiecookie is `HttpOnly`, `Secure` en `SameSite=Lax` (`src/lib/supabase/cookies.ts`): JavaScript in de
pagina kan hem niet lezen.

**Vaste bestanden** (alles onder `/_next/static/` en uit `public/`) serveert Cloudflare zonder de Worker. Ze
krijgen hun headers uit `public/_headers`, met een CSP die niets toestaat; een unittest bewaakt dat het bestand
gelijk is aan `headersVasteBestanden()` in `beveiligingsheaders.ts`. Let op: een SVG of PDF die later in `public/`
komt en rechtstreeks wordt geopend, mag daardoor zelf ook geen stijlen of scripts laden; pas de CSP voor dat ene
pad aan als dat nodig is.

## Versies

| Onderdeel | Versie | Opmerking |
|---|---|---|
| Next.js | 16.4.3 | Vast; OpenNext 1.20 ondersteunt `>=16.4.1` |
| `@opennextjs/cloudflare` | 1.20.13 | De adapter |
| wrangler | 4.154.0 | Met workerd 1.20261023.1. Staat ook in `uitrol/package.json`: altijd dezelfde versie (de poort controleert dat) |
| `compatibility_date` | 2026-10-23 | Gelijk aan de workerd-versie; bij een update van wrangler bewust meeschuiven |
| `compatibility_flags` | `nodejs_compat`, `global_fetch_strictly_public` | Zoals OpenNext voorschrijft |

**`glob` op `^10.5.0`** (`overrides` in `package.json`). De adapter brengt via `@node-minify/core` glob 10.3.3 mee,
met een lek van niveau hoog in de opdrachtregel van glob (GHSA-5j98-mcp5-4vw2). Wij gebruiken die opdrachtregel
niet, maar `npm audit` blokkeert terecht. 10.5.0 is dezelfde hoofdversie met de reparatie. **Weghalen** zodra
`npm ls glob` zonder de override geen 10.3.x meer laat zien (bij elke update van de adapter nakijken).

## Keuzes

| Wat | Keuze en reden |
|---|---|
| Version URLs (`preview_urls`) | **Uit.** Anders krijgt elke versie een eigen openbare URL, en blijft een oude versie met een gerepareerde fout bereikbaar |
| Workers Logs (`observability`) | **Uit.** Het log bewaart de URL van elke aanvraag, en de inloglink en straks de agenda-feed hebben een token in de URL (bouwgids 7.4). Een tussenvorm (`invocation_logs: false`, alleen eigen meldingen) is een keuze vóór de pilot, want dan moet een mislukte verzending zichtbaar zijn |
| Incrementele cache in R2 | Niet. Pagina's met ledengegevens worden niet bewaard. R2 vraagt ook een betaalmethode |
| Beeldoptimalisatie (`images`) | Niet. Er zijn nog geen afbeeldingen |
| Geplande taken | **Een eigen Worker `ledenplatform-taken` (`taken/`) met een Cron Trigger, niet `pg_cron` en niet in de app** (proefroute 3, `Bouwbesluiten` 3.1). In één Worker met de app zou de hele app de geheime Supabase-sleutel via `process.env` kunnen lezen (review PR12-01). De taken-Worker heeft geen adres (`workers_dev: false`) en geen route, dus niets dat iemand van buiten kan starten. Hij gebruikt geen pakketten (gewone `fetch` naar Supabase en Resend), zodat de uitrolstap hem zonder installatie bundelt; `controle:poort` dwingt dat af. Logs staan voor deze Worker aan (geen tokens in URL's, wel de reden van een mislukte run) |
| `middleware.ts` (edge-runtime), niet `proxy.ts` (Node-runtime) | **Besluit 28-10-2026** (`Bouwbesluiten` 3.1). Beide slaagden lokaal in workerd voor alle browsertests. `proxy.ts` is de standaard van Next.js 16, maar draait altijd in de Node-runtime, en die noemt OpenNext op Workers "experimental, not officially maintained": hij gebruikt interne uitvoer van Next.js die per versie kan veranderen. `middleware.ts` is het pad dat OpenNext ondersteunt, met een kleinere bundel (1198 tegen 1397 KiB gecomprimeerd). Prijs: Next.js 16 noemt het "deprecated" en waarschuwt bij elke build; die waarschuwing is verwacht en hoeft niet weg. Wat te doen bij een update: zie "Als een update de middleware breekt" hieronder |
| Stijlen in de CSP | `style-src` houdt `'unsafe-inline'`: een nonce werkt niet voor style-attributen, en een stijl voert geen code uit. Scripts zijn wat telt |

## Metingen

| Meting | Uitkomst | Drempel |
|---|---|---|
| Bundelgrootte (`wrangler deploy --dry-run`) | Stap E: gecomprimeerd 970 KiB. Met de middleware (proefroute 2): 5717 KiB, gecomprimeerd 1198 KiB | Gratis plan: 3 MiB gecomprimeerd volgens OpenNext |
| Rekentijd per aanvraag (CPU) | **P50 198 ms, P90 472 ms, P99 506 ms** (28-10-2026, dashboard, Metrics, 24 uur, ±53 aanroepen). Gemeten **vóór** de middleware; daarna draait ook `/` via de Worker en krijgt elke pagina een nonce. Opnieuw meten na de uitrol van proefroute 1 en 2, ook voor `/proef/agenda/…` apart | Gratis plan: 10 ms |
| Totale tijd per aanvraag (wall) | P50 209 ms. Van buiten, 30 aanvragen achter elkaar op `/inloggen`: mediaan 188 ms tot de eerste byte, dus niet alleen een koude start | — |
| Geheugen | P50 18 MB | 128 MB |
| Fouten, waaronder "Exceeded CPU Time Limits" | 0 | — |

**Uitkomst rekentijd.** De app gebruikt ongeveer 20 keer de 10 ms van het gratis plan; Next.js met inloggen kost per
aanvraag zoveel rekenwerk. Toch gaf Cloudflare nog geen enkele fout. Volgens `Bouwbesluiten` 3.1 is het betaalde
Workers-plan ($5 per maand) dus nodig; zie daar het besluit. Houd tot dan in Metrics de grafiek *Errors by invocation
status* in de gaten: verschijnt "Exceeded CPU Time Limits", dan direct overstappen.

## Eenmalig instellen

Claude maakt geen accounts aan en zet geen sleutels. De volgorde telt.

1. **Cloudflare:** account met tweestapsverificatie (gratis plan), en een `workers.dev`-subdomein. Het adres wordt
   `https://ledenplatform.<subdomein>.workers.dev`.
2. **API-token** (My Profile, API Tokens, *Create Token*, onderaan **Create Custom Token**; niet het sjabloon
   *Edit Cloudflare Workers*, dat geeft ook Workers Tail, KV, R2 en routes):
   - Permissions: **Account, Workers Scripts, Edit**. Meer niet.
   - Account Resources: alleen dit account. Geen zones.
   - TTL: een einddatum, bijvoorbeeld het einde van de stage.
   - Dit was genoeg voor de eerste uitrol (28-10-2026). Faalt een uitrol later toch met een fout over rechten
     (code 10000 of "Authentication error"), voeg dan alleen **Account, Account Settings, Read** toe.
3. **GitHub, omgeving `ontwikkel`** (Settings, Environments), bij *Deployment branches* alleen `main`:
   - geheim `CLOUDFLARE_API_TOKEN`: het token uit stap 2;
   - variabele `CLOUDFLARE_ACCOUNT_ID`: het account-ID (staat in de adresbalk van het dashboard);
   - variabele `SITE_URL`: het adres uit stap 1, zonder `/` aan het eind.
4. **Samenvoegen** van de pull request. De workflow `uitrol` zet de Worker online. De eerste keer is de controle
   op `/mijn` rood, want de Worker heeft nog geen Supabase-gegevens: ga door met stap 5.
5. **Geheimen van de Worker** (dashboard, Workers, `ledenplatform`, Settings, Variables and Secrets): `SUPABASE_URL`,
   `SUPABASE_PUBLISHABLE_KEY` (van het project `ledenplatform-ontwikkel`) en `SITE_URL` (zelfde als in stap 3).
   **Kies het type *Secret*, niet *Text*.** Een uitrol haalt waarden van het type *Text* die alleen in het
   dashboard staan weer weg; geheimen blijven staan. Met *Text* breekt de volgende uitrol het inloggen.
   Waar vind je de waarden: Supabase, het project, knop **Connect**, tabblad *.env.local*. Neem alleen de waarden
   over; de namen daar beginnen met `NEXT_PUBLIC_`, en die gebruikt deze app bewust niet (alles met `NEXT_PUBLIC_`
   gaat mee naar de browser). Neem de *publishable key* (`sb_publishable_…`), nooit de *secret key*.
6. **Supabase online**, met de mailserver (Resend) eerst: zie `docs/bouw/Inloggen.md`, "Online instellen". Zonder
   eigen mailserver laat Supabase de mailtekst niet aanpassen, en zonder de eigen tekst (met `token_hash`) werkt
   inloggen niet.
7. **Opnieuw uitrollen:** Actions, `uitrol`, de laatste run, **Re-run all jobs**. Groen = de nieuwe versie antwoordt
   met de headers en `/inloggen` werkt.
8. **Met de hand:** inloggen met een verzonnen testlid, met de link geopend op een telefoon (proefroute 2 en
   bouwgids 14.6), en de rekentijd aflezen voor de tabel hierboven.
9. **Na een uur** (de sessie verloopt na een uur): de pagina "Mijn account" opnieuw openen; je hoort ingelogd te
   blijven. Daarna uitloggen, en in de ontwikkelhulpmiddelen van de browser (Application, Cookies) controleren dat er
   geen cookie `sb-…-auth-token` meer staat. Zo is het verversen ook online bewezen, niet alleen in de tests.
   **Gedaan 28-10-2026:** na ruim een uur nog ingelogd, na uitloggen geen sessiecookie meer; de cookie was
   `HttpOnly`, `Secure`, `SameSite=Lax`.
10. **Type JWT-sleutel** in Supabase (Project Settings, JWT Keys). Bij een gedeeld geheim (HS256) vraagt de
    middleware Supabase bij elke pagina van een ingelogd lid om het token te controleren; met een asymmetrische
    sleutel gebeurt dat in de Worker zelf. **Nagekeken 28-10-2026:** *current* is ECC (P-256), dus asymmetrisch;
    *previous* is het oude gedeelde geheim (HS256), dat alleen nog oudere tokens controleert. Lokaal is het nog
    HS256, dus de tests doen per pagina één aanroep meer dan online. Later bekijken: lokaal ook ECC, en of de oude
    sleutel kan worden ingetrokken (eerst nagaan dat niets hem nog gebruikt).
11. **Agenda-feed (proefroute 1).**
    - **Token maken:** `openssl rand -hex 32` in de Ubuntu-terminal (64 tekens). Gebruik nooit het testtoken uit
      `scripts/agenda-testtoken.ts`: dat staat in de publieke repository, en de controle na de uitrol wordt rood als
      het online werkt. Zet het als geheim `PROEF_AGENDA_TOKEN` bij de Worker, type *Secret*, zoals in stap 5, en
      bewaar het in je wachtwoordmanager. Wie het token kent, ziet de agenda.
    - **Adres:** `https://<site>/proef/agenda/<token>.ics`, altijd met `https://`. Over `http://` of `webcal://`
      (dat sommige apps als http ophalen) geeft de feed bewust een 404: dan reist het token onversleuteld.
    - **Zonder telefoon controleren:** in de Ubuntu-terminal, met het token in een variabele (dan staat het niet
      letterlijk in de geschiedenis): `read -rs TOKEN`, token plakken, Enter, en dan
      `curl -s "https://<site>/proef/agenda/$TOKEN.ics" | head -5`. Je hoort `BEGIN:VCALENDAR` te zien.
    - **iPhone** (iOS 18 en nieuwer): Instellingen, Apps, Agenda, Agenda-accounts, Voeg account toe, Andere, Voeg
      agenda-abonnement toe. Oudere iOS: Instellingen, Agenda, Accounts, en verder hetzelfde.
    - **Google Agenda:** op de computer (calendar.google.com), Andere agenda's, +, Via URL. Op een Android-telefoon
      verschijnt de agenda vaak pas als je in de Google Agenda-app bij die agenda **Synchroniseren** aanzet. Google
      haalt de feed zelf op, soms pas na uren, en bewaart het adres (dus het token) op zijn servers.
    - **Outlook** (outlook.com of Outlook-app): Agenda toevoegen, Abonneren vanaf internet.
    - **Wat je hoort te zien:** "Bonte Avond (proef)" op vrijdag 15 januari 2027, van 20:11 tot 01:11.
    - **Rekentijd van de feed:** de Metrics tonen geen cijfers per route. Doe op een rustig moment 50 aanvragen in één
      minuut (`for i in $(seq 50); do curl -s -o /dev/null "https://<site>/proef/agenda/$TOKEN.ics"; done`) en lees
      de Metrics van die minuut af.
    - **Token gelekt:** zet een nieuw token als geheim (het oude adres werkt dan meteen niet meer) en maak de
      abonnementen opnieuw. **Proef klaar:** verwijder het geheim; de feed geeft dan voor elk token een 404.
12. **Geplande taak (proefroute 3).** De taak draait in een eigen Worker, `ledenplatform-taken` (`taken/`), niet
    in de app: alleen die krijgt de geheime sleutel van Supabase. Cloudflare start hem elke minuut (`triggers` in
    `taken/wrangler.jsonc`). Hij schrijft per minuut de uitkomst in `proef_taak` en verstuurt hooguit één keer een
    testbericht. De Worker heeft geen adres; niemand kan hem van buiten aanroepen.
    **Volgorde: stap A vóór het samenvoegen, B en C erna.**
    - **A. De migraties online, met `supabase db push`** (nooit met de hand in de SQL Editor: dat komt niet in de
      migratiegeschiedenis, en zonder de eerste migratie zijn de standaardrechten online niet dicht). In de
      Ubuntu-terminal, op `main`, in de repository:
      1. `npx supabase login` (opent de browser; inloggen met je Supabase-account).
      2. `npx supabase link --project-ref <ref>`: de *ref* is het stuk tussen `https://` en `.supabase.co` van je
         project-URL. Hij vraagt het databasewachtwoord (in je wachtwoordmanager).
      3. `npx supabase db push --dry-run`: toont welke migraties hij zou uitvoeren. Controleer dat het precies de
         bestanden uit `supabase/migrations/` zijn die nog niet online staan, en niets anders.
      4. `npx supabase db push`, en bevestig met `y`.
      5. Controleer in Supabase: Table Editor (bij `proef_taak` en `proef_taak_bericht` staat het slotje: RLS aan),
         en Advisors, Security Advisor. "RLS enabled, no policy" op deze twee tabellen is verwacht (niemand anders
         mag erbij); andere meldingen niet.
    - **B. Na het samenvoegen staat de Worker `ledenplatform-taken` er.** Zonder geheimen doet hij niets en meldt hij
      in zijn logs "niet ingesteld" (geen fout elke minuut). Zet dan bij **die** Worker (niet bij `ledenplatform`)
      de geheimen, type *Secret*:
      - `SUPABASE_URL`: dezelfde project-URL als bij de app.
      - `SUPABASE_SECRET_KEY`: maak in Supabase (Project Settings, API Keys) een **nieuwe, eigen** secret key voor
        deze taak, met een herkenbare naam zoals `proef-taak`. Die gaat om alle rechten heen; gebruik hem nergens
        anders, en zet hem nooit bij de app-Worker.
      - Voor het testbericht (mag ook weg; dan draait de taak zonder bericht): `RESEND_API_KEY` (een eigen sleutel
        met *Sending access*), `RESEND_AFZENDER` (zonder eigen domein het testadres van Resend, `onboarding` op
        `resend.dev`, met een naam ervoor: `Ledenplatform <…>`), en `PROEF_TAAK_ONTVANGER` (het adres van je
        Resend-account: zonder eigen domein kan Resend alleen daarheen sturen).
    - **C. Controleren:** na tien minuten in Supabase, Table Editor, `proef_taak`: tien rijen, één per minuut, status
      `gelukt`; in `proef_taak_bericht` één rij met status `verstuurd`, en het bericht in je mailbox. In Cloudflare:
      Workers, `ledenplatform-taken`, Settings, Trigger Events, **View events** (de laatste 100 runs; bij een nieuwe
      Worker kan het tot een half uur duren voor ze verschijnen). De reden van een mislukte run staat in de logs van
      die Worker (Observability; hier staan geen tokens in). Lees ook de rekentijd van de runs af (Metrics).
    - **Gedwongen fout:** zet bij `ledenplatform-taken` tijdelijk `PROEF_TAAK_FORCEER_FOUT` = `1` (type *Text*; een
      volgende uitrol haalt dat weer weg). Binnen een minuut staat er een rij met status `mislukt`, en de run staat
      in View events als mislukt. Haal de variabele daarna weg.
    - **Testbericht mislukt** (status `mislukt` in `proef_taak_bericht`, met de fout): los de oorzaak op (meestal de
      Resend-sleutel) en verwijder die ene rij in de Table Editor; de volgende run probeert het opnieuw, zonder dubbel
      bericht (vaste Idempotency-Key bij Resend).
    - **Proef klaar:** zet in `taken/wrangler.jsonc` `"crons": []` (pull request; het `triggers`-blok weghalen laat de
      bestaande trigger staan). Verwijder de geheimen bij `ledenplatform-taken` en de secret key `proef-taak` in
      Supabase. De tabellen mogen weg in fase 1 (met een migratie).

**Het adres van de site staat op vier plekken.** Bij een nieuw adres (eigen domein, ander subdomein) alle vier
aanpassen: de GitHub-variabele `SITE_URL`, het Worker-geheim `SITE_URL`, en in Supabase de Site URL en de Redirect
URL.

## Als er iets misgaat

**De uitrol is rood bij "Alleen de nieuwste main".** Niets aan de hand: er is intussen een nieuwere commit op
`main`, die rolt zelf uit.

**De uitrol is rood bij "Uitrollen".** Er is niets veranderd online. Lees de foutmelding in de log: meestal het token
(verlopen of te weinig rechten, zie stap 2).

**De uitrol is rood bij "Controle op de uitgerolde Worker".** De nieuwe versie **staat online maar klopt niet**. Rol
eerst terug, zoek daarna de oorzaak.

**Terugrollen** naar de vorige versie: dashboard, Workers, `ledenplatform`, **Deployments**, bij de vorige versie
**Rollback**, met een korte reden. Dat werkt binnen een minuut. Herstel daarna de fout via een pull request; de
volgende uitrol zet dan weer de nieuwste `main` online. Draai niet een oude uitrol opnieuw: die stopt bij "Alleen
de nieuwste main".

**Fouten zoeken.** Workers Logs staan uit. Bij een fout (bijvoorbeeld status 500): dashboard, Workers,
`ledenplatform`, **Live logs** (of `npx wrangler tail ledenplatform` met je eigen login), en de fout opnieuw
uitlokken. **Let op:** daar komen URL's met een token voorbij, ook inloglinks van leden. Alleen kort aanzetten,
alleen bij een storing, niets kopiëren of bewaren.

**Supabase heeft een storing.** De middleware wacht hooguit 3 seconden en laat de pagina dan zonder verversen
door. `/mijn` vraagt Supabase zelf wie er is ingelogd; dat kan tot ±25 seconden duren en eindigt dan op
`/inloggen`, alsof het lid is uitgelogd. Een eigen foutmelding voor een storing staat nog niet in het ontwerp
(open punt voor fase 1).

**Als een update de middleware breekt** (Next.js of OpenNext bijgewerkt en de browsertests worden rood):

1. Zoek in de changelog van Next.js en van `@opennextjs/cloudflare` op "middleware" en "proxy".
2. Draai lokaal `npm run build:worker` en `npx playwright test e2e/sessie-en-csp.spec.ts e2e/inloggen.spec.ts`, en
   `npx vitest run src/middleware.test.ts`.
3. Werkt `middleware.ts` niet meer, probeer `proxy.ts`: hernoem `src/middleware.ts` naar `src/proxy.ts`, hernoem de
   functie `middleware` naar `proxy`, bouw opnieuw. Die draait in de Node-runtime; OpenNext waarschuwt dan dat dat
   experimenteel is.
4. Slagen alle tests uit stap 2 met één van beide, neem die en leg het vast in `Bouwbesluiten` 3.1. Slaagt geen van
   beide, zet de update terug (niet samenvoegen) en meld het in het pull request.
5. De waarschuwing "The middleware file convention is deprecated" bij de build is verwacht zolang `middleware.ts` in
   gebruik is; die hoeft niet weg.

**Token vervangen** (verlopen, of misschien gelekt): maak een nieuw token zoals in stap 2, zet het in GitHub
(omgeving `ontwikkel`, geheim `CLOUDFLARE_API_TOKEN`), en trek het oude in (My Profile, API Tokens, *Roll* of
*Delete*). Eigenaar van het token is de beheerder van het Cloudflare-account; bij de overdracht aan het bestuur
maakt de nieuwe beheerder een eigen token.

## Lokaal

```bash
npm run supabase:start                        # lokale Supabase in Docker
npm run env:lokaal                            # schrijft .env.local en .dev.vars (niet in git)
npm run build:worker && npm run preview:worker # de Worker in workerd op http://127.0.0.1:8787
```

Lokaal werkt de agenda-feed met het testtoken uit `scripts/agenda-testtoken.ts` (`env:lokaal` zet het):
`http://127.0.0.1:8787/proef/agenda/<testtoken>.ics`. Http mag alleen op de eigen computer.

De geplande taak start je lokaal met de hand in de taken-Worker: `npx wrangler dev -c taken/wrangler.jsonc --port
8788 --test-scheduled` (leest `taken/.dev.vars`, die `env:lokaal` schrijft) en dan
`curl "http://127.0.0.1:8788/__scheduled?cron=*+*+*+*+*"`. Online bestaat `/__scheduled` niet, en de taken-Worker
heeft geen adres.

Een lokale build neemt waarden uit `.env.local` op in de bundel (`.open-next/cloudflare/next-env.mjs`). Daarom rolt
alleen GitHub uit, en controleert de job **bouw** dat die bundel leeg is. Zet in `.env.local` nooit een sleutel die
online niet mag.

OpenNext werkt niet volledig op Windows; gebruik WSL (Fase-0-plan 1.2).
