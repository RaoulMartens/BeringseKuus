# Inloggen met een code per mail

Een lid vult zijn e-mailadres in, ontvangt een cijfercode en voert die op de website in. Een wachtwoord is niet nodig.
De code vervangt de normale inloglink: de mail bevat geen URL die Outlook kan blokkeren. Dit verandert de extra
beveiligingsstap voor het bestuur niet.

**Besluit 30-10-2026:** de bouwer kiest voor mailcodes en tijdelijk de bestaande Gmail-mailbox als afzender, zodat een
kijkproef zonder eigen verzenddomein mogelijk is. De geldigheid is op verzoek 24 uur voor het ontwikkelproject. Deze
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

## Online instellen

`supabase/config.toml` geldt lokaal. Controleer de instellingen in het online project afzonderlijk.

- **Authentication, Sign In / Providers, Email:** de emailprovider aan; geen openbare accountregistratie.
- **Email OTP expiration:** 86400 seconden (24 uur), zoals voor deze ontwikkelproef afgesproken. Kies voor productie
  de geldigheid opnieuw. De codestap kan de ingestelde lengte van 6 tot 10 cijfers verwerken.
- **Authentication, Emails, Templates, Magic link or OTP:** onderwerp `Je inlogcode voor het ledenplatform`, inhoud
  uit `supabase/templates/inloglink.html`. De oude bestandsnaam blijft behouden voor de bestaande configuratie.
- **Authentication, Emails, SMTP Settings:** een werkende SMTP-provider. De standaardmail van Supabase is alleen
  voor organisatieleden en is geen algemene verzending naar leden.

### Tijdelijk via een bestaande Gmail-mailbox

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

Gmail is hier voor een kleine ontwikkelproef, met de verzendgrenzen en afleverbaarheid van die mailbox. Voor breder
gebruik wordt de verzenddienst opnieuw gekozen. Resend blijft ook mogelijk: de testafzender op `resend.dev` mag
alleen naar het eigen account mailen; voor andere ontvangers vraagt Resend een geverifieerd verzenddomein.

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
