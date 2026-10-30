# Ledenplatform C.V. De Beringse Kuus

Een ledenplatform voor een carnavalsvereniging: leden zien het programma, dragen hun dienst over en melden
zich af; het bestuur maakt activiteiten aan, deelt mensen in en publiceert.

**Status:** fase 0 (project opzetten) is af (29-10-2026, `docs/bouw/Afname-fase-0.md`); fase 1 is bijna af
(`docs/bouw/Fase-1-plan.md`). Er is een app met de kwaliteitspoort, de uitrol naar Cloudflare Workers, het datamodel met
de rechten (RLS, kolomrechten, vangnet-triggers), de seed met het programma 2026/2027, inloggen met een link per mail,
een tweede factor voor het bestuur (MFA, `docs/bouw/Beheerders.md`), een componentenset in het ontwerp van de vereniging
(`/ontwerp`) en twee echte schermen: het programma (`/programma`) en de inlog- en beveiligingsschermen. Indelen,
publiceren, het welkomscherm en het beheeroverzicht komen in fase 2, afmelden en ruilen in fase 3. De taken-Worker
(`taken/`) staat klaar zonder taken.

Deze repository is **publiek**. Er staan geen ledengegevens, sleutels, foto's of gelicentieerde iconen in;
zie `CLAUDE.md` en `docs/licenties.md`. De bronnen staan in `docs/`, te beginnen bij
`docs/bouw/Bouwbesluiten-2026-10-27.md` en de bouwgids.

## Lokaal draaien

Nodig: Node.js 24 of nieuwer, Docker (voor de lokale database), en Linux of WSL (op Windows niet in OneDrive).

```bash
npm ci                                  # afhankelijkheden, precies volgens package-lock.json; zet ook de pre-push-controle aan
npx playwright install chromium         # eenmalig: de browser voor de browsertests
npm run supabase:start                  # lokale database en inlog in Docker (Docker moet draaien)
npm run env:lokaal                      # schrijft .env.local en .dev.vars met de lokale adressen en sleutels
npm run dev                             # ontwikkelserver: open http://127.0.0.1:3000 (de inloglink wijst daarheen)
```

Inloggen kan alleen als lid; aanmelden bestaat niet. Maak lokaal een verzonnen lid aan en vraag op `/inloggen`
een link aan. De mail komt in Mailpit, de lokale postbus (het adres staat in `npx supabase status`). Het script maakt
een inlogaccount **en** de rijen in `leden` en `leden_prive`: zonder die rijen kent het platform je niet, en `/mijn` zegt
dat dit adres nog niet bij de leden staat.

```bash
npm run lid:lokaal -- iemand@example.com                                    # een gewoon lid (Test Lid)
npm run lid:lokaal -- iemand@example.com --naam "Jan van Dijk" --beheerder  # met beheerrechten, zonder app
```

Wie bestuurslid is, volgt voor beheer de procedure uit `docs/bouw/Beheerders.md`: een app instellen en bevestigen. Het
script slaat die stappen niet over. De seed (`supabase/seed.sql`, na `npm run test:db`) bevat al verzonnen leden en een
beheerder voor de tests; die inlogt niemand met de hand.

Wijzig je een migratie in `supabase/migrations/`, draai dan `npm run test:db` en `npm run types:db`: de poort
keurt databasetypen af die niet bij de migraties passen.

**Eenmalig: de namenlijst.** De controle op de publieke repository zoekt naar namen die er niet in mogen (van
mensen die bij het project betrokken zijn). Die lijst staat niet in de repository. Vraag hem aan de beheerder
en zet hem in een bestand `.verboden-woorden` in de root, één naam per regel. Dat bestand staat in `.gitignore`.
Zonder lijst faalt de controle: dan is hij niet volledig. In GitHub staat dezelfde lijst als geheim
`VERBODEN_WOORDEN`.

## Controles

```bash
npm run check   # alles: de poort en de controle op de publieke repository
```

Wat erin zit: types (strict, alle code is TypeScript), ESLint met typebewuste regels (0 waarschuwingen, uitzetten
met commentaar kan niet), Prettier, een controle dat de poort zelf niet is verzwakt, een controle op omwegen
(`eslint-disable`, `@ts-ignore`, `.only`, `.skip`, `.fail`, en `skip` in de databasetests), unittests, de
databasetests, een controle dat de databasetypen bij de migraties passen, de productiebuild voor Cloudflare Workers,
browsertests op 1200 en 375 px tegen die build in workerd (axe, zichtbare focus, de beveiligingsheaders, inloggen),
een controle dat geen enkele test is overgeslagen, en de
controle op wat niet in een publieke repository hoort. In GitHub komt daar `npm audit` (hoog of kritiek
blokkeert) bij.

Vóór elke `git push` draaien de controle op de publieke repository en die op omwegen automatisch: wat gepusht
is, is openbaar.

`main` is beschermd: elke wijziging gaat via een branch en een pull request, ook voor de beheerder.

De database (Supabase) draait lokaal in Docker; `npm run test:db` zet hem schoon op uit de migraties en de seed
(`supabase/seed.sql`: het programma 2026/2027 en verzonnen leden, alleen lokaal) en draait
de databasetests. Inloggen werkt met een link per mail (`docs/bouw/Inloggen.md`).

## Uitrollen

De app draait op Cloudflare Workers met de OpenNext-adapter. Uitrollen gebeurt alleen door GitHub Actions
(workflow `uitrol`), vanaf `main` en pas nadat `check` op die commit groen is. Lokaal de Worker proberen:

```bash
npm run env:lokaal && npm run build:worker && npm run preview:worker   # http://127.0.0.1:8787
```

Versies, keuzes, metingen en wat je eenmalig instelt bij Cloudflare en GitHub: `docs/hosting.md`.
