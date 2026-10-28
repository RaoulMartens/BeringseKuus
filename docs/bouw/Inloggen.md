# Inloggen met een link per mail (fase 0 stap D2)

Leden loggen in zonder wachtwoord: ze vullen hun e-mailadres in en krijgen een link (bouwgids 2 en 3).
Dit bestand legt vast hoe dat werkt, waarom zo, en wat online nog moet worden ingesteld.

## Hoe het werkt

1. `/inloggen`: het lid vult het adres in. De server controleert de vorm en vraagt Supabase een link te sturen,
   met `shouldCreateUser: false`: alleen wie het bestuur heeft uitgenodigd, kan inloggen.
2. Het antwoord is altijd hetzelfde ("Als dit e-mailadres bij ons bekend is …"), ook bij een onbekend adres. Zo
   verraadt de pagina niet wie lid is. Het adres komt niet in de URL en niet in het log.
3. De link in de mail gaat naar `/auth/bevestigen?token_hash=…`. Die pagina toont een knop **Inloggen**; pas de
   klik logt in (`verifyOtp`) en stuurt naar `/mijn`.
4. Uitloggen geldt alleen voor dit apparaat (`scope: 'local'`).

## Waarom zo

| Keuze | Reden |
|---|---|
| Link met `token_hash` naar de eigen site, niet de standaardlink van Supabase | De standaardlink (PKCE) werkt alleen in de browser waar hij is aangevraagd. Leden vragen hem op de laptop aan en openen de mail op de telefoon. |
| Eerst een knop, dan pas inloggen | Mailprogramma's (bijvoorbeeld de linkcontrole van Outlook) openen links vooraf. Een link die één keer werkt, zou dan al op zijn. Een knop drukt zo'n controle niet in. |
| Vaste `SITE_URL` voor de link in de mail | Het adres uit de aanvraag halen (Host-header) laat een aanvaller een inloglink naar zijn eigen site sturen. |
| Na inloggen altijd naar `/mijn` | Een doeladres uit de link volgen is een open doorverwijzing. |
| `getUser()` op `/mijn`, niet alleen de cookie lezen | `getUser` vraagt Supabase of de sessie echt geldig is. |
| Geen Supabase-client in de browser | Alle aanroepen gaan via de server; de sleutels staan alleen in de serveromgeving. |

## Nog niet (bewust)

- **Sessie verversen bij elke aanvraag.** Dat hoort in een proxy (middleware). Of die op Cloudflare Workers werkt,
  bewijst proefroute 2. Tot dan ververst de sessie bij een serveractie; na een uur zonder actie kan een lid opnieuw
  moeten inloggen.
- **Uitnodigen.** Leden aanmaken en uitnodigen is fase 1. In de tests maakt de beheer-API het lid aan.
- **MFA voor beheerders** (bouwgids 14.4): fase 1, met de rollen.

## Online instellen (na stap E, in het Supabase-dashboard of met `supabase config push`; zie `docs/hosting.md`)

`supabase/config.toml` geldt alleen lokaal. In het online project moet hetzelfde staan. Zo ingesteld op
28-10-2026; inloggen werkte daarna online.

1. **Authentication → Sign In / Providers:** *Allow new users to sign up* **uit** (`enable_signup = false` onder
   `[auth]`). De provider **Email** zelf blijft aan, anders werkt inloggen per mail niet.
2. **URL Configuration:** Site URL = het adres op Workers; Redirect URLs = precies `<site>/auth/bevestigen`.
3. **Mailserver (SMTP), vóór de mailtekst.** Zonder eigen SMTP laat Supabase de mailtekst niet aanpassen (gezien
   28-10-2026: "Set up custom SMTP to edit templates"), en de standaardmail gebruikt een link via Supabase die
   `/auth/bevestigen` niet kent en die een linkscanner opmaakt. Dus eerst Resend (bouwgids 2):
   - Resend: een API-sleutel met alleen *Sending access*.
   - Supabase, Authentication → Emails → *Set up SMTP*: host `smtp.resend.com`, poort `465`, gebruiker `resend`,
     wachtwoord = die sleutel, afzendernaam `Ledenplatform`.
   - **Zonder eigen domein** is de afzender het testadres dat Resend zelf aanbiedt (`onboarding` op het domein
     `resend.dev`), en stuurt Resend alleen naar het adres van het Resend-account. Genoeg voor de proef (de bouwer logt in als zichzelf), niet voor de pilot: dan een domein van
     de vereniging, geverifieerd in Resend, en een afzender op dat domein.
4. **Emails → Templates → Magic Link:** onderwerp `Je inloglink voor het ledenplatform`, tekst uit
   `supabase/templates/inloglink.html` (de link met `token_hash`).
5. **Users:** één testaccount, het eigen adres van de bouwer (zie 3). Er staan geen gegevens van leden in.
6. De standaardgrenzen voor aantallen (rate limits) laten staan; de hoge waarden in `config.toml` zijn voor de
   browsertests.

## Lokaal proberen

```bash
npm run supabase:start   # database, inloggen en Mailpit in Docker
npm run env:lokaal       # schrijft .env.local (niet in git)
npm run dev              # http://127.0.0.1:3000/inloggen
```

Inloggen kan alleen met een bestaand (verzonnen) testlid. Zo'n lid maak je met de beheer-API, zoals
`e2e/inloggen.spec.ts` doet; Studio staat bij `supabase:start` uit om geheugen te sparen. De mail komt aan in
Mailpit: <http://127.0.0.1:54324>.
