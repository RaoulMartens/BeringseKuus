# Hosting: Cloudflare Workers met OpenNext

Stand 28-10-2026, fase 0 stap E. Hoort bij `Bouwbesluiten` punt 3 en bouwgids 14.6 punt 5. Dit bestand beschrijft
hoe de app online komt, met welke versies, en wat de bouwer eenmalig moet instellen.

## Hoe het werkt

1. `npm run build:worker` draait `next build` en zet het resultaat met de OpenNext-adapter om naar `.open-next/`:
   één Worker (`.open-next/worker.js`) en de vaste bestanden (`.open-next/assets/`).
2. `npm run deploy:worker` zet die met wrangler op Cloudflare. Dat gebeurt alleen in GitHub Actions
   (`.github/workflows/uitrol.yml`), nooit vanaf een laptop.
3. De uitrol start pas als de workflow `check` op `main` groen is, en bouwt precies die commit. Een pull request
   rolt nooit uit.
4. Na de uitrol vraagt de workflow de site op en controleert de beveiligingsheaders. Zonder die headers is de
   uitrol rood.

De **browsertests** (`npm run test:e2e`) draaien tegen dezelfde build in workerd, de runtime van Cloudflare
(`wrangler dev`), en niet tegen `next start`. Zo test de poort wat er online gaat. Inloggen met de link per mail
(stap D2) werkt daar: 34 van de 34 browsertests slagen.

## Versies

| Onderdeel | Versie | Opmerking |
|---|---|---|
| Next.js | 16.4.3 | Vast; OpenNext 1.20 ondersteunt `>=16.4.1` |
| `@opennextjs/cloudflare` | 1.20.13 | De adapter |
| wrangler | 4.154.0 | Met workerd 1.20261023.1 |
| `compatibility_date` | 2026-10-23 | Gelijk aan de workerd-versie; bij een update van wrangler bewust meeschuiven |
| `compatibility_flags` | `nodejs_compat`, `global_fetch_strictly_public` | Zoals OpenNext voorschrijft |

**`glob` vastgezet op 10.5.0** (`overrides` in `package.json`). De adapter gebruikt via `@node-minify/core` glob
10.3.3, met een lek van niveau hoog in de opdrachtregel van glob (GHSA-5j98-mcp5-4vw2). Wij gebruiken die
opdrachtregel niet, maar `npm audit` blokkeert terecht. 10.5.0 is dezelfde hoofdversie met de reparatie. Weghalen
zodra de adapter zelf een veilige versie meebrengt.

## Bewust (nog) niet

| Wat | Waarom |
|---|---|
| Incrementele cache in R2 | Pagina's met ledengegevens worden niet bewaard. R2 vraagt ook een betaalmethode bij Cloudflare |
| Beeldoptimalisatie (`images`) | Er zijn nog geen afbeeldingen |
| Workers Logs (`observability`) | Het log bewaart de volledige URL, en de inloglink en straks de agenda-feed hebben een token in de URL (bouwgids 7.4). De rekentijd staat ook zonder logs in de metrics van het dashboard |
| Eigen Worker met `scheduled` (geplande taak) | Komt met proefroute 3; dan een typebestand voor `.open-next/worker.js` in plaats van `@ts-ignore` (Fase-0-plan 1.3) |
| Proxy (middleware) die de sessie ververst, en een CSP met nonce | Proefroute 2. Tot dan staat `script-src 'unsafe-inline'` in de CSP (`src/lib/beveiligingsheaders.ts`) |

## Metingen

| Meting | Uitkomst | Drempel |
|---|---|---|
| Bundelgrootte (`wrangler deploy --dry-run`) | 4668 KiB, gecomprimeerd 970 KiB | Gratis plan: 3 MiB gecomprimeerd volgens OpenNext |
| Rekentijd per aanvraag | Nog te meten na de eerste uitrol (dashboard, Workers, Metrics, CPU time) | Gratis plan: 10 ms |

## Eenmalig instellen (de bouwer)

Claude maakt geen accounts aan en zet geen sleutels. De volgorde telt.

1. **Cloudflare:** account met tweestapsverificatie (gratis plan). Kies het `workers.dev`-subdomein (openbaar, houd
   het neutraal). Het adres wordt `https://ledenplatform.<subdomein>.workers.dev`.
2. **API-token** (My Profile, API Tokens, sjabloon *Edit Cloudflare Workers*), beperkt tot dit ene account en
   zonder zones. Niet in de chat, niet in een bestand.
3. **GitHub, omgeving `ontwikkel`** (Settings, Environments): bij *Deployment branches* alleen `main`. Daarin:
   - geheim `CLOUDFLARE_API_TOKEN`: het token uit stap 2;
   - variabele `CLOUDFLARE_ACCOUNT_ID`: het account-ID (rechts op de overzichtspagina van Workers);
   - variabele `SITE_URL`: het adres uit stap 1, zonder `/` aan het eind.
4. **Samenvoegen** van de pull request. De workflow `uitrol` zet de Worker online. De eerste keer is de controle
   op `/inloggen` rood, want de Worker heeft nog geen Supabase-gegevens: ga dan door met stap 5.
5. **Geheimen van de Worker** (dashboard, Workers, `ledenplatform`, Settings, Variables and Secrets, type
   *Secret*): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (van het project `ledenplatform-ontwikkel`) en `SITE_URL`
   (zelfde als in stap 3). Een uitrol laat deze staan.
6. **Supabase online** zoals in `docs/bouw/Inloggen.md`: aanmelden uit, Site URL en Redirect URL op het adres van
   stap 1, de mailtekst met `token_hash`.
7. **Opnieuw uitrollen:** Actions, `uitrol`, *Run workflow* op `main`. Groen = de site antwoordt met de headers.
8. **Met de hand:** inloggen met een verzonnen testlid, met de link geopend op een telefoon (proefroute 2 en
   bouwgids 14.6), en de rekentijd aflezen voor de tabel hierboven.

## Lokaal

```bash
npm run supabase:start                        # lokale Supabase in Docker
npm run env:lokaal                            # schrijft .env.local en .dev.vars (niet in git)
npm run build:worker && npm run preview:worker # de Worker in workerd op http://127.0.0.1:8787
```

OpenNext werkt niet volledig op Windows; gebruik WSL (Fase-0-plan 1.2).
