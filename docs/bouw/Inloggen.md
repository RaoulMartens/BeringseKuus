# Inloggen met een code per mail

Een lid vult zijn e-mailadres in, ontvangt een cijfercode en voert die op de website in. Een wachtwoord is niet nodig.
De code vervangt de normale inloglink: de mail bevat geen URL die Outlook kan blokkeren. Dit verandert de extra
beveiligingsstap voor het bestuur niet.

**Stand 13-11-2026: de inlogmail gaat via Postmark** (zie "Via Postmark" hieronder), niet meer via Gmail. De afzender is
tijdelijk een adres op het domein van het bedrijf van de begeleider; het besluit over een eigen afzenderdomein voor het platform
ligt nog open (voorstel van de begeleider: één domein voor het platform, met een eigen domein per vereniging als keuze).

**Besluit 30-10-2026 (voor de kijkproef, inmiddels vervangen door Postmark):** de bouwer kiest voor mailcodes en tijdelijk de
bestaande Gmail-mailbox als afzender, zodat een kijkproef zonder eigen verzenddomein mogelijk is. De geldigheid is op verzoek 24 uur voor het ontwikkelproject. Deze
Supabase-instelling geldt ook voor andere e-maillinks, zoals herstellen en bevestigen; het is geen uitzondering per lid.

## Hoe het werkt

1. `/inloggen`: de server normaliseert en controleert het adres en roept `signInWithOtp` aan met
   `shouldCreateUser: false`. Alleen bestaande accounts kunnen inloggen.
2. Een bekend en een onbekend adres krijgen dezelfde buitenkant: "Als dit e-mailadres bij ons bekend is ...".
   Een fout van de maildienst wordt met alleen de foutsoort gelogd. Adres, code en sleutels staan niet in het log.
3. Het formulier gaat naar de codestap en behoudt het ingevulde adres. Het adres staat in formulierstaat, niet in de URL.
   De mailtekst `supabase/templates/inloglink.html` gebruikt `{{ .Token }}` en bevat geen link.
4. De server controleert het adres en de code en roept `verifyOtp({ email, token, type: 'email' })` aan. Codes bestaan
   uit 6 tot 10 cijfers, afhankelijk van de instelling bij Supabase. Witruimte bij het kopieren wordt verwijderd;
   voorloopnullen blijven behouden.
5. Een goede code geeft een gewone sessie en stuurt altijd naar `/mijn`. Een foute, verlopen of gebruikte code geeft
   dezelfde melding en geen sessie. Te veel verificaties geven een melding om te wachten; Supabase bewaakt de limiet.
6. `/inloggen?code=1` laat een code op een ander apparaat invullen, met het bijbehorende e-mailadres.
7. Uitloggen geldt alleen voor dit apparaat (`scope: 'local'`). De middleware ververst geldige sessies. Beheer blijft
   de bestaande MFA- en rechtencontroles vragen.

De formulieren gebruiken dezelfde onderdelen en vormgeving als de rest van de app. De route werkt ook zonder
JavaScript. Bestaande handmatig gemaakte links blijven werken via `/auth/bevestigen?token_hash=...`; de GET verbruikt
zo'n link niet, alleen de bevestigingsknop.

## Nog niet (bewust)

- **Uitnodigen.** Een lid aanmaken kan tot fase 4 (ledenbeheer) alleen met SQL: zie `Beheerders.md`, "Een lid aanmaken".
  Lokaal doet `npm run lid:lokaal` het. Voor de pilot zet `npm run leden:zet` een lijst leden in het systeem (`Pilotleden.md`), zonder
  uitnodiging: de leden loggen zelf in met hun e-mailadres. In de tests maakt `maakLidMetRol` (`e2e/mfa-hulp.ts`) het lid aan.
- **MFA voor beheerders** (bouwgids 14.4): gebouwd in fase 1 (`Beheerders.md`).

## Online instellen

`supabase/config.toml` geldt lokaal. Controleer de instellingen in het online project afzonderlijk.

- **Authentication, Sign In / Providers, Email:** de emailprovider aan; geen openbare accountregistratie.
- **Email OTP expiration:** 86400 seconden (24 uur), zoals voor deze ontwikkelproef afgesproken. Kies voor productie
  de geldigheid opnieuw. De codestap kan de ingestelde lengte van 6 tot 10 cijfers verwerken.
- **Authentication, Emails, Templates, Magic link or OTP:** onderwerp `Je inlogcode voor het ledenplatform`, inhoud
  uit `supabase/templates/inloglink.html`. De oude bestandsnaam blijft behouden voor de bestaande configuratie.
- **Authentication, Emails, SMTP Settings:** een werkende SMTP-provider. De standaardmail van Supabase is alleen
  voor organisatieleden en is geen algemene verzending naar leden.

### Via Postmark (sinds 11-11-2026)

Supabase verstuurt de inlogmail via de SMTP-server van Postmark. De gegevens staan alleen in Supabase (Authentication, Emails,
SMTP Settings) en komen nooit in de repository, in logs of in een chat.

| Instelling | Waarde |
| --- | --- |
| Sender email address | Een adres op het geverifieerde afzenderdomein (tijdelijk dat van het bedrijf van de begeleider) |
| Sender name | Ledenplatform |
| Host | smtp.postmarkapp.com |
| Port | 587 |
| Username en password | De SMTP-gegevens van de Postmark-server (het server-token); het wachtwoord staat alleen in Supabase |
| Rate limit for sending emails | 100 per uur (Authentication, Rate Limits; de standaard van 30 is te laag als leden na een uitnodiging tegelijk inloggen) |

Op 11-11-2026 is gecontroleerd dat een inlogcode bij een Gmail-adres aankomt, in de inbox en niet in de spam, en dat de mail door
het afzenderdomein is ondertekend (DKIM) en via het bounce-adres van Postmark loopt. Het Postmark-token vervang je zoals in
`docs/hosting.md` ("Geheimen") staat: eerst het nieuwe in Supabase zetten, dán het oude intrekken.

Wat dit **niet** is: berichten aan leden (bij publiceren, wijzigen of verwijderen) bestaan nog niet; alleen de inlogmail gaat uit.
Het besluit daarover staat open (O-1).

### Eerder: een bestaande Gmail-mailbox (ontwikkelproef)

Een eigen domein is hiervoor niet nodig. De eigenaar van de Gmail-mailbox maakt zelf een Google-appwachtwoord aan
(tweestapsverificatie vereist) en vult dit rechtstreeks in Supabase in. Het wachtwoord komt nooit in de repository,
logs of chats.

| Instelling | Waarde |
| --- | --- |
| Sender email address | Het bestaande Gmail-adres |
| Sender name | Ledenplatform |
| Host | smtp.gmail.com |
| Port | 465 |
| Username | Het volledige Gmail-adres |
| Password | Het Google-appwachtwoord |

Gmail was bedoeld voor een kleine ontwikkelproef, met de verzendgrenzen en afleverbaarheid van die mailbox. Voor de pilot is
daarom Postmark gekozen (besluit van de begeleider, 05-11-2026); Resend is daarmee niet meer de bedoelde dienst.

## Controleren

De browsertests gaan tegen de lokale Supabase en Mailpit door de hele route: mail ontvangen, eenmalig gebruik,
verlopen en foute codes, een code bij een ander adres, een ander apparaat, zonder JavaScript, bestaande handmatige
links en axe op desktop en telefoonbreedte. De serveractietests controleren onder meer `shouldCreateUser: false`,
de vaste bestemming, invoercontrole, behoud van voorloopnullen en foutlogs zonder adres of code.

Na uitrol: vraag via de echte website een code voor een bestaand testaccount aan, controleer ontvangst van de mail
en log met die code in. Controleer ook de MFA-stap voor het bestuur; alleen het zien van het ontvangstscherm bewijst
niet dat de mail daadwerkelijk is afgeleverd.

Bronnen: [Supabase passwordless](https://supabase.com/docs/guides/auth/auth-email-passwordless),
[Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[Gmail SMTP](https://support.google.com/a/answer/176600),
[Google-appwachtwoorden](https://support.google.com/accounts/answer/185833).
