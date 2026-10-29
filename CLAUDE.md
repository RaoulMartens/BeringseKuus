# Ledenplatform C.V. De Beringse Kuus — code

Ledenplatform voor carnavalsvereniging De Beringse Kuus. Leden zien het programma, dragen hun
dienst over en melden zich af; het bestuur maakt activiteiten aan, deelt mensen in en publiceert.
Het wordt onderhouden door vrijwilligers en bewaart persoonsgegevens. Schrijf in het Nederlands:
commentaar, commit-berichten, pull requests en uitleg. Leg uit wat je doet en waarom, zodat de
bouwer het kan volgen en later zelf kleine dingen kan aanpassen.

## Bronnen — lees deze eerst, ze gaan voor

| Document | Wat |
|---|---|
| `docs/FO_Beringse_Kuus_V4.docx` (of nieuwer) | Functioneel ontwerp: *wat* het platform doet |
| `docs/Bouwgids_Beringse_Kuus_V8.docx` (of nieuwer) | *Hoe* het gebouwd wordt. Hoofdstuk 14 is de bouwstandaard hieronder |
| `docs/bouw/Bouwbesluiten-2026-10-27.md` | Aanvulling op V8, **gaat voor bij tegenspraak**: hosting (Workers), kosten, datamodel en rechten vóór fase 1, `vereniging_id`, open besluiten, rechtzettingen in V8 |
| `docs/bouw/Design-overdracht.md` | Hoe het visuele ontwerp in de code komt: tokens, componenten, vergelijking per scherm |
| `docs/ux-flows/use-cases.md` | UC-001 t/m UC-008, regels R1–R24, servercontroles en foutcodes per use case |
| `docs/ux-flows/wireframes/` en `INDEX.md` | Per scherm de inhoud, de teksten en welke foutcode welk scherm geeft |
| `docs/visueel/stijl.css` en `INDEX.md` | **Het uiterlijk:** tokens en onderdelen. Gaat voor `code.txt`, dat verouderd is |
| `docs/ux-flows/UX-FLOWS.md` | Consistentieregels, woorden, en de dekkingsmatrix die de tests moeten afdekken |

Bij een tegenspraak tussen de bronnen: eerst `Bouwbesluiten`, dan de bouwgids, dan het FO. Meld het
verschil in plaats van zelf te kiezen (V8 15.3).

**Waar wijzig je een document?** Zie `docs/README.md`: technische afspraken (dit bestand, `docs/bouw/`,
`docs/licenties.md`) wijzig je hier, via een pull request. Ontwerpdocumenten (`docs/ux-flows/`,
`docs/visueel/`, de `.docx`'en) zijn opgeschoonde kopieën uit de ontwerpmap: niet hier wijzigen.

Wijkt de code af van deze bronnen, dan is de code fout, tenzij de bron aantoonbaar een gat heeft.
Meld een gat (een foutcode zonder scherm, een regel die elkaar tegenspreekt); verzin geen eigen
gedrag of eigen tekst.

## Stack

Next.js (App Router, TypeScript), Supabase (Postgres, RLS, RPC-functies, Auth met magic link,
MFA voor admins), **Cloudflare Workers met de OpenNext-adapter** (niet Pages: dat is alleen statisch),
Resend voor mail. Zie bouwgids hoofdstuk 2 en `Bouwbesluiten` punt 3. De drie proefroutes in
`Bouwbesluiten` 3.1 (`.ics`-route, magic-link-inlog, geplande taak) bewijzen fase 0 op echte Workers;
de Next.js-versie staat vast. Gratis plannen tijdens het bouwen, **nooit met echte ledengegevens**.

## De poort — geen uitzonderingen

Code die niet aan elke eis in dit bestand voldoet, komt niet in `main`. Ook niet "even snel", ook
niet vlak voor een activiteit.

- `main` is beschermd. Werk op een branch per fase of onderdeel; alles komt binnen via een pull request.
- Een pull request wordt pas samengevoegd als **alle** controles in GitHub Actions groen zijn en de
  review uit bouwgids hoofdstuk 11 is gedaan.
- **Verboden als oplossing:** `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `any`, een test
  overslaan (`.skip`, `.only`), een drempel verlagen, een controle uitzetten. Moet een regel echt
  anders, stel dan een wijziging van bouwgids hoofdstuk 14 voor, met reden, apart van de code.
- Is een controle rood, dan los je de oorzaak op. Nooit de controle.

## Deze repository is publiek

Alles wat je commit is voor iedereen leesbaar en blijft in de geschiedenis staan. Commit daarom **nooit**:

- ledengegevens of echte e-mailadressen en telefoonnummers (testdata is fictief);
- sleutels, wachtwoorden of `.env`-bestanden (service-role-sleutel, Resend-sleutel);
- de Central-iconen, foto's van de vereniging, het logo of een lettertype zonder vermelding in
  `docs/licenties.md` met bron en licentie;
- persoonsnamen van de opdrachtgever, de begeleider of anderen; gebruik rollen;
- bestanden uit de stage-map (`docs/visueel/`, `docs/communicatie/`, `docs/uitrol/`, `docs/versies/`).

Twijfel je of iets erin mag, vraag het. Een controle in de poort faalt op afbeeldingen, lettertypen en
iconen die niet in `docs/licenties.md` staan, en op `.env`-bestanden. Lekt er toch iets, zeg dat direct:
eerst de sleutel intrekken, dan pas opruimen.

## Commando's

```bash
npm run check                  # alles: check:basis en controle:repo (lokaal met .verboden-woorden)
npm run check:basis            # de poort zonder namenlijst; zo draait hij in GitHub
npm run typecheck              # next typegen + tsc, strict; alle code is TypeScript
npm run lint                   # ESLint met typebewuste regels, 0 waarschuwingen; uitzetten met commentaar kan niet
npm run format:check           # Prettier (npm run format zet het goed)
npm run controle:poort         # de instellingen van de poort zijn niet verzwakt
npm run controle:omwegen       # geen eslint-disable, @ts-ignore, .only, .skip in de code
npm run test                   # Vitest en de tests van de controles (met rapporten in testuitkomsten/)
npm run supabase:start         # lokale Supabase (Docker): database, inloggen, Mailpit
npm run env:lokaal             # schrijft .env.local voor npm run dev (niet in git)
npm run test:db                # lokale database (Docker): migraties opnieuw, pgTAP-tests op RLS en rechten
npm run build:worker           # productiebuild voor Cloudflare Workers (next build + OpenNext)
npm run test:e2e               # Playwright op 1200 en 375 px: axe, zichtbare focus, headers
npm run controle:overgeslagen  # geen enkele test overgeslagen of todo, volgens de rapporten van de testrunners
npm run controle:repo          # niets wat niet in een publieke repository hoort (vraagt de namenlijst)
```

De namenlijst staat lokaal in `.verboden-woorden` (niet in git) en in GitHub als geheim `VERBODEN_WOORDEN`. Druk
de namen nooit af, ook niet in een foutmelding of een pull request. Een document dat de controle niet kan lezen
(docx, pdf) mag alleen met een uitzondering voor precies die inhoud in `scripts/uitzonderingen.json`.
De database verandert alleen via migraties in `supabase/migrations/`; elke tabel en functie krijgt zijn rechten
expliciet, met een test in `supabase/tests/` op wat níet mag (standaardrechten staan dicht).
In GitHub draait daarna nog `npm audit --audit-level=high`.

Draai `npm run check` voordat je zegt dat iets af is. Meld de uitkomst eerlijk, ook als er iets rood is.

## Architectuur

- **Regels staan op één plek: in de databasefuncties.** `ruil_dienst`, `meld_af`, `trek_afmelding_in`
  en `activiteit_opslaan` (bouwgids 4, 4.4, 5). Het scherm mag een regel tonen, maar beslist nooit alleen.
- **Geen directe schrijfacties op tabellen vanuit de app.** Alleen via die functies. RLS houdt de rest tegen.
- **Alle functies nemen eerst dezelfde rij-lock** op `activiteiten` (`SELECT … FOR UPDATE`, bouwgids 4.1).
- **`activiteit_opslaan` is alles of niets:** één transactie, `verwachte_bezetter` per plek,
  dubbelboeking en eindverantwoordelijke gecontroleerd op de eindtoestand, meldingen klaargezet in de
  transactie en pas verstuurd na de commit (bouwgids 4.4).
- **Identiteit (`Bouwbesluiten` 4.1).** Elke rij in `leden` heeft een eigen uuid, ook externe helpers.
  `auth_user_id` is aparte, optionele kolom. Alle verwijzingen gaan naar `leden.id`; RLS en functies
  gebruiken `huidig_lid()`, niet rechtstreeks `auth.uid()`.
- **Privé gescheiden van publiek (4.2).** Telefoon, e-mail en `agenda_token` staan in `leden_prive`, niet
  in een tabel die andere leden kunnen lezen. Het nummer van de eindverantwoordelijke gaat via een functie.
- **Rechten vanaf het moment dat een tabel, view of functie bestaat (4.3),** met negatieve tests, ook op
  rechtstreekse selects en joins. Beheerfuncties vereisen de actuele adminstatus én `aal2` (MFA), vanaf
  de eerste beheerfunctie. Leden-functies controleren eerst de aanroeper en de toegang tot de activiteit,
  daarna pas wat er bestaat; onbekend en ontoegankelijk geven dezelfde buitenkant.
- **Eén tijdfunctie (4.5)** voor "bezig", "geweest" en deadlines in `Europe/Amsterdam`; een activiteit na
  middernacht blijft zichtbaar. Schrijffuncties toetsen met `clock_timestamp()` ná de lock, niet met `now()`
  (dat is het begin van de transactie).
- **Hulpfuncties van de rechten staan in het schema `intern`**, buiten de Data API (`[api] schemas` en
  `extra_search_path` blijven zonder `intern`; de poort bewaakt dat). Een `security definer`-functie in `public` is
  als `/rest/v1/rpc/…` aan te roepen en kan zo lekken wat een lid niet mag weten (`Datamodel-fase-1.md`, DM-01).
- **`leden` en `activiteiten` altijd met een kolomlijst lezen** (`.select('id, voornaam, achternaam, type, actief')`).
  Authenticated heeft op `leden` alleen die vijf kolommen en op `activiteiten` niet `bron_activiteit_id` en
  `vereniging_id`; `select *` en een embed `leden(*)` geven een fout. Zet nooit een tabelbrede `grant select` op deze
  tabellen: de rechtentest faalt dan.
- **Fouten van de databasefuncties** hebben SQLSTATE `BK001`, de foutcode als `message` en JSON in `detail`. Vertaal
  ze naar het scherm uit de wireframes; een foutcode zonder scherm is een ontwerpgat, meld het.
- **Elke beheerpagina en elke serveractie in beheer begint met `eisBeheer()`** (`src/lib/beheer.ts`). Dat vraagt de
  database wat deze sessie mag (`public.beheerstatus()`) en stuurt iedereen die niet `ok` is naar het scherm dat bij zijn
  situatie hoort (inloggen, app instellen, wachten, code invoeren). Is die controle vergeten, dan weigert de database
  nog steeds (`geen_admin`), maar de gebruiker ziet dan een foutmelding in plaats van het goede scherm. Beheer eist een
  code van hooguit 12 uur oud (`CODE_GELDIG_UUR` in `src/lib/mfa.ts` en `intern.code_recent()` in de database; een test
  houdt ze gelijk). Hoe iemand beheerder wordt of hersteld: `docs/bouw/Beheerders.md`.
- **`vereniging_id` op elke tabel met eigen verenigingsgegevens** (`Bouwbesluiten` 1), standaardwaarde De
  Beringse Kuus. RLS en functies houden er in de pilot nog geen rekening mee; bouw die scheiding niet half
  in, die komt in een eigen fase. Geen tweede vereniging in de database vóór die fase is geaccepteerd.
- **Het uiterlijk komt uit tokens** (`stijl.css`), niet uit losse waarden in componenten. Bouw eerst de
  componentenset, dan de schermen (`Design-overdracht.md`). Neem de HTML van het prototype niet over:
  die heeft geen semantische elementen.
- **De database verandert alleen via migraties** in de repository. Nooit met de hand in het dashboard
  van productie. Database-typen worden gegenereerd uit het schema.
- **Server Components waar het kan;** client-side code alleen waar interactie het vraagt.

## Strak

- TypeScript strict, plus `noUncheckedIndexedAccess`. Geen `any`.
- Saaie, leesbare code: standaardoplossingen, kleine onderdelen met één taak, geen slimme trucs, geen
  dode code, geen code in commentaar. Commentaar zegt waarom, niet wat.
- Namen volgen het domein, in dezelfde woorden als de bronnen en de schermen:

| Woord | Betekenis |
|---|---|
| activiteit | Alles is één activiteit (FO) |
| rol | Soort taak: werker, drankhaler, fotograaf, BOB, eindverantwoordelijke (FO 2.2) |
| plek / `rol_slot` | Eén regel in de rolbezetting, bezet of leeg |
| dienst | Wat een lid doet bij een activiteit ("Jouw dienst") |
| afmelding | Alleen afmeldingen worden opgeslagen; iedereen is standaard aanwezig |
| aanwezig | "27 aanwezig", "Minimaal aanwezig" — nooit "komen" of "ondergrens" in de interface |
| overdragen | De handeling in de interface ("Dienst overdragen"); in de database heet de functie `ruil_dienst` |

Namen en sfeer in de taal van de vereniging (Vastelaovend, het motto van het seizoen, de eigen
activiteitnamen); knoppen, rollen en meldingen in gewoon Nederlands. Zie "Taal en toon" in `UX-FLOWS.md`.
Het motto hoort in de gegevens (per seizoen), niet vast in de code.

## Semantisch en toegankelijk — WCAG 2.2 AA

- Echte elementen: `<button>` voor een handeling, `<a>` voor navigatie, `<ul>` voor een lijst,
  `<table>` alleen voor tabellen. Geen klikbare `<div>`. Eén `<h1>` per pagina, koppen in volgorde,
  landmarks (`<header>`, `<nav>`, `<main>`).
- Elk veld heeft een zichtbaar `<label>`. Een foutmelding staat bij het veld en is gekoppeld met
  `aria-describedby`. Verplicht = `*` bij het label, zoals in de wireframes.
- Alles werkt met alleen het toetsenbord, met zichtbare focus; een keuzelijst sluit met Escape.
- Kleur is nooit de enige drager van betekenis. Contrast minimaal 4,5:1.
- `lang="nl"`. Telefoonnummers als `tel:`-link.
- Teksten komen letterlijk uit de wireframes en `use-cases.md`. Elke foutcode heeft een scherm of
  melding; ontbreekt die, meld het.
- axe draait in de browsertests op elk scherm: 0 overtredingen. Werkt op desktop en op 375px, zonder
  horizontaal scrollen (zie de mobiele afspraken in `UX-FLOWS.md`).

## Beveiligd

- **RLS op elke tabel.** Er is een test die faalt zodra een tabel zonder RLS bestaat.
- **Tests per rol** (niet ingelogd, lid, admin) voor elke tabel en elke functie, vooral voor wat níet
  mag. Minimaal: een lid leest geen concept, ziet geen lege plek, wijzigt geen andermans afmelding,
  ziet alleen het telefoonnummer van de eindverantwoordelijke, en schrijft niet rechtstreeks in een
  tabel (bouwgids 7.1).
- **Functies met `security definer`** controleren zelf de aanroeper en hebben een vaste `search_path`.
  De app krijgt alleen `execute` op de functies die hij nodig heeft.
- **Geheimen:** de service-role-sleutel komt nooit in de browser en nooit in de repository. Alle
  sleutels in omgevingsvariabelen. Controleer vóór elke commit dat er geen sleutel in zit.
- **Invoer** wordt op de server gecontroleerd met een vast schema per aanroep, ook als het scherm al
  controleerde.
- **Headers:** Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options,
  Referrer-Policy, `frame-ancestors 'none'`.
- **Pakketten:** alleen gangbare, onderhouden pakketten, en alleen als het niet zonder kan. Vraag
  eerst voordat je een nieuw pakket toevoegt, en noem waarom. Een lek van niveau hoog of kritiek
  blokkeert. Installeer of draai nooit tools van onbekende bronnen.
- **Supabase:** de beveiligingsadviseur geeft 0 waarschuwingen. MFA voor admins (bouwgids 7.2).
  Logs bevatten geen persoonsgegevens en geen sleutels (AVG, bouwgids 7.4).

## Correct

- Elke regel R1–R24 en elke foutcode uit `use-cases.md` heeft minstens één test. Schrijf de test
  eerst en zie hem rood voordat je de code schrijft.
- Test gelijktijdigheid echt met twee sessies: twee afmeldingen tegelijk bij de ondergrens, vervanger
  worden terwijl je je afmeldt, twee bestuursleden die tegelijk opslaan (`slot_gewijzigd`, niets
  opgeslagen).
- De hoofdroutes worden van begin tot eind in de browser getest: welkom, overdragen, afmelden met en
  zonder dienst, intrekken, aanmaken, indelen, publiceren.

## Wanneer iets af is

Een fase (bouwgids hoofdstuk 10) of onderdeel is pas af als:

1. `npm run check` lokaal én in GitHub groen is;
2. elke nieuwe regel en foutcode een test heeft die eerst rood was;
3. de review uit bouwgids hoofdstuk 11 is gedaan tegen dit bestand, en de bevindingen plus wat ermee
   is gedaan in het pull request staan;
4. de schermen met alleen het toetsenbord en op 375px zijn doorlopen;
5. de schermen zijn vergeleken met het visuele ontwerp op 1200 en 375px, afwijkingen staan in het
   pull request (`Design-overdracht.md`, punt 4);
6. de README (bouwgids 8.4) bijgewerkt is.

Is één punt niet waar, zeg dan dat het niet af is, en wat er nog ontbreekt.

## Werkwijze

- Eén fase per keer, in de volgorde van bouwgids hoofdstuk 10. Fase 0 richt eerst deze poort in:
  alle controles groen op een lege app, vóór het eerste scherm.
- Database en rechten eerst, met uitleg, vóór er schermen komen.
- Kleine, samenhangende commits met een Nederlands bericht dat zegt waarom.
- **Eigen review vóór het samenvoegen** (review F0-08): een pull request die `supabase/migrations/`,
  `src/middleware.ts`, het inloggen (`src/app/inloggen/`, `src/app/auth/`, `src/lib/supabase/`),
  `.github/workflows/` of de poort (`scripts/controleer-*`, `eslint.config.mjs`, `tsconfig.json`, de
  testinstellingen) raakt, krijgt een eigen review door een schone chat, met de bevindingen en wat ermee is gedaan
  in de pull request. Het vakje "Review" mag dan niet leeg blijven. Andere pull requests vallen onder de review van
  de fase.
- Twijfel over wat het ontwerp bedoelt: kijk in de wireframes en `use-cases.md`, en vraag het als het
  daar niet staat. Neem geen ontwerpbeslissing zelf.

## Nog open

De actuele lijst met besluiten, deadlines en aannames staat in `Bouwbesluiten` punt 6; de ongestelde
vragen aan de opdrachtgever staan in bouwgids 15.1 (met aannames). Bouw er niet omheen; vraag de stand.
Wat uit fase 0 nog moet gebeuren, met wanneer en door wie: `docs/bouw/Afname-fase-0.md`, "Van fase 0 naar fase 1".

- Hosting: **besloten 28-10-2026, OpenNext** (alle drie proefroutes geslaagd; `Bouwbesluiten` 3.1 en 6).
- Pilotmoment, BA-6 (aanname: tabel `roltypen`), foutcode en scherm voor een versieconflict en een
  doelgroepconflict, akkoord van de opdrachtgever op de kosten.
- Komt oud papier dat het systeem aanmaakt binnen als concept of direct gepubliceerd?
- "Ruilen" of "overdragen" als term in de interface (aanname: ruilen in de database, overdragen in de interface).
- Moet er een BOB zijn als er een bus rijdt (aanname: geen verplichting)?
