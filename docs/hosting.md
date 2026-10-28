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
   bundel zitten, en de bundel bewaren. Job **uitrol** (met het Cloudflare-token): alleen wrangler uit `uitrol/`,
   geïnstalleerd zonder installatiescripts, rolt die bundel uit. Zo draait de code van de app en van haar
   afhankelijkheden nooit naast het token.
5. Daarna wacht `scripts/controleer-online.ts` tot de site de nieuwe versie uitlevert (`/BUILD_ID`), en controleert
   de exacte beveiligingsheaders op `/` en op een vast bestand, of `/inloggen` antwoordt, en of `/mijn` een bezoeker
   zonder sessie doorstuurt naar `/inloggen`. Dat laatste lukt alleen als de Worker Supabase kan bereiken;
   `/inloggen` zelf toont het formulier ook zonder Supabase-gegevens.

De **browsertests** (`npm run test:e2e`) draaien tegen dezelfde build in workerd, de runtime van Cloudflare
(`wrangler dev`), en niet tegen `next start`. Zo test de poort wat er online gaat. Alle browsertests slagen daar,
ook het inloggen met de link per mail (stap D2).

**De middleware** (`src/middleware.ts`) draait vóór elke pagina. Hij zet de CSP met een nieuwe nonce per aanvraag
(alleen scripts met die nonce mogen draaien, geen `'unsafe-inline'`), en ververst een verlopen sessie, zodat een
lid niet na een uur uitgelogd raakt. Zonder sessiecookie roept hij Supabase niet aan. Omdat de nonce per aanvraag
is, worden alle pagina's per aanvraag gemaakt (`connection()` in `layout.tsx`).

**Vaste bestanden** (alles onder `/_next/static/` en uit `public/`) serveert Cloudflare zonder de Worker. Ze
krijgen hun headers uit `public/_headers`, met een CSP die niets toestaat; een unittest bewaakt dat het bestand
gelijk is aan `headersVasteBestanden()` in `beveiligingsheaders.ts`.

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
| Eigen Worker met `scheduled` (geplande taak) | Komt met proefroute 3; dan een typebestand voor `.open-next/worker.js` in plaats van `@ts-ignore` (Fase-0-plan 1.3) |
| `middleware.ts` (edge-runtime), niet `proxy.ts` (Node-runtime) | **Besluit 28-10-2026** (`Bouwbesluiten` 3.1). Beide slaagden lokaal in workerd voor alle browsertests. `proxy.ts` is de standaard van Next.js 16, maar draait altijd in de Node-runtime, en die noemt OpenNext op Workers "experimental, not officially maintained": hij gebruikt interne uitvoer van Next.js die per versie kan veranderen. `middleware.ts` is het pad dat OpenNext ondersteunt, met een kleinere bundel (1198 tegen 1397 KiB gecomprimeerd). Prijs: Next.js 16 noemt het "deprecated" en waarschuwt bij elke build. **Wat te doen** als een update van Next.js `middleware.ts` weghaalt of de browsertests rood worden: opnieuw beide varianten proberen, met dezelfde tests |
| Stijlen in de CSP | `style-src` houdt `'unsafe-inline'`: een nonce werkt niet voor style-attributen, en een stijl voert geen code uit. Scripts zijn wat telt |

## Metingen

| Meting | Uitkomst | Drempel |
|---|---|---|
| Bundelgrootte (`wrangler deploy --dry-run`) | Stap E: gecomprimeerd 970 KiB. Met de middleware (proefroute 2): 5717 KiB, gecomprimeerd 1198 KiB | Gratis plan: 3 MiB gecomprimeerd volgens OpenNext |
| Rekentijd per aanvraag (CPU) | **P50 198 ms, P90 472 ms, P99 506 ms** (28-10-2026, dashboard, Metrics, 24 uur, ±53 aanroepen) | Gratis plan: 10 ms |
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

Een lokale build neemt waarden uit `.env.local` op in de bundel (`.open-next/cloudflare/next-env.mjs`). Daarom rolt
alleen GitHub uit, en controleert de job **bouw** dat die bundel leeg is. Zet in `.env.local` nooit een sleutel die
online niet mag.

OpenNext werkt niet volledig op Windows; gebruik WSL (Fase-0-plan 1.2).
