# Ledenplatform C.V. De Beringse Kuus

Een ledenplatform voor een carnavalsvereniging: leden zien het programma, dragen hun dienst over en melden
zich af; het bestuur maakt activiteiten aan, deelt mensen in en publiceert.

**Status:** fase 0 (project opzetten). Er is een lege app met de kwaliteitspoort; er zijn nog geen functies.

Deze repository is **publiek**. Er staan geen ledengegevens, sleutels, foto's of gelicentieerde iconen in;
zie `CLAUDE.md` en `docs/licenties.md`. De bronnen staan in `docs/`, te beginnen bij
`docs/bouw/Bouwbesluiten-2026-10-27.md` en de bouwgids.

## Lokaal draaien

Nodig: Node.js 24 of nieuwer. Werk in Linux of WSL (op Windows niet in OneDrive).

```bash
npm ci                                  # afhankelijkheden, precies volgens package-lock.json
npx playwright install chromium         # eenmalig: de browser voor de browsertests
npm run dev                             # ontwikkelserver op http://localhost:3000
```

## Controles

```bash
npm run check   # alles, in dezelfde volgorde als de controle `check` in GitHub
```

Wat erin zit: types (strict), ESLint (0 waarschuwingen, uitzetten met commentaar kan niet), Prettier, een
controle op omwegen (`eslint-disable`, `@ts-ignore`, `.only`, `.skip`), een controle op wat niet in een
publieke repository hoort, unittests, de productiebuild en browsertests op 1200 en 375 px met axe en de
beveiligingsheaders. In GitHub komt daar `npm audit` (hoog of kritiek blokkeert) bij.

`main` is beschermd: elke wijziging gaat via een branch en een pull request, ook voor de beheerder.

Uitrollen (Cloudflare Workers) en de database (Supabase) komen in fase 0 stap D en E.
