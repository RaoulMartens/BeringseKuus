# Beheerders: activeren, herstellen, intrekken

Wie beheer mag doen, bepaalt de database (`intern.is_beheerder()`, `Datamodel-fase-1.md` punt 3). Dit is de handleiding
voor wie dat regelt. Tot fase 4 (ledenbeheer) heeft een bestuurslid met beheerrechten **geen** schermen om dit voor een
ander te doen: "een andere beheerder" betekent in de praktijk iemand met toegang tot het Supabase-dashboard van het
project (de bouwer en de tweede persoon uit `Bouwbesluiten` 5.2 punt 5). Dat account is dus de echte sleutel: zet MFA
aan op elk Supabase-account met toegang, en geef die toegang aan niet meer dan twee mensen.

**Voer de stappen alleen uit na een controle van wie je voor je hebt**: wie dit doet, geeft iemand toegang tot alle
ledengegevens. De controle is persoonlijk, of via een telefoongesprek met iemand wiens stem je kent; niet via mail of
chat, want dat is precies het kanaal van de aanvaller die hier wordt tegengehouden.

## De regel in één zin

Beheer werkt voor wie `is_admin` heeft, een authenticator-app heeft ingesteld **vóór** het moment waarop `beheerder_sinds`
staat, en in deze sessie een code van die app heeft ingevoerd, niet langer dan 12 uur geleden en van ná het instellen van
de app.

De volgorde is bewust: een app die iemand ná `beheerder_sinds` instelt, telt pas als een beheerder dat bevestigt. Wat
die bevestiging waard is, hangt af van wat de beheerder controleert (hieronder, "Bevestigen: wat je controleert").

## Bevestigen: wat je controleert

Een aanvaller die de inloglink van een bestuurslid in handen heeft, kan zelf een app instellen. De bevestiging is het
moment waarop dat wordt gestopt, en dat werkt alleen als de beheerder iets controleert:

1. Laat het bestuurslid de pagina "Je app is ingesteld" openen (`/mfa/wacht`) en de **naam van de app** en het
   **moment waarop hij is ingesteld** voorlezen, of aan de telefoon vertellen. Heeft hij niet net zelf een app ingesteld,
   bevestig dan niet; ga naar "Een aanval vermoed" hieronder.
2. Vergelijk dat met wat Supabase heeft (SQL Editor):

   ```sql
   select f.id, f.friendly_name, f.status, f.created_at
     from auth.mfa_factors f
     join public.leden l on l.auth_user_id = f.user_id
     join public.leden_prive p on p.lid_id = l.id
    where p.email = '…';   -- het e-mailadres van het bestuurslid
   ```

   Er moet **precies één** bevestigde app (`verified`) staan, met dezelfde naam en (vrijwel) hetzelfde moment. Staat er
   een tweede of een onbekende, bevestig dan niet.
3. Pas dan bevestigen (`beheerder_sinds` ná de app):

   ```sql
   update public.leden_prive set beheerder_sinds = now() where email = '…';
   ```

Zoek een lid altijd op het e-mailadres uit `leden_prive`, niet op naam: twee leden kunnen dezelfde naam hebben.

## Een nieuwe beheerder activeren

1. Het bestuurslid is lid in het systeem (nu: via de seed of het script voor pilotleden; vanaf fase 4: ledenbeheer).
2. Voer de controle uit zoals hierboven (stap 2), ook als er nog geen app hoort te staan: `/mfa/instellen` is voor elk
   ingelogd lid te openen, en een app die er al staat, telt straks als "van vóór" en heeft dan **geen** bevestiging. Staat
   er een onbekende app, haal die weg (zie "Toestel kwijt", stap 3).
3. Zet het beheer aan. De trigger zet `beheerder_sinds` op het moment van nu:

   ```sql
   update public.leden_prive set is_admin = true where email = '…';
   ```

4. Het bestuurslid logt in met de link in de mail en opent Beheer. Het platform stuurt hem naar "Beheer beveiligen"
   (`/mfa/instellen`): een authenticator-app installeren, de QR-code scannen en de eerste code invoeren. Daarna staat er
   "Je app is ingesteld"; beheer is nog dicht, want deze app is van ná `beheerder_sinds`.
5. **Bevestigen**, zoals hierboven.
6. Het bestuurslid opent Beheer opnieuw en vult de code uit zijn app in.

## Toestel kwijt of nieuwe telefoon

Het bestuurslid kan zichzelf niet herstellen; dat is bewust (zelfde reden als hierboven). Wie dit uitvoert doet:

1. Controleer dat het echt dit bestuurslid is (bel, of spreek af).
2. **Beëindig alle sessies van dit lid.** Een gestolen telefoon kan een open sessie met een goede code hebben. Een code
   van vóór de nieuwe app telt sinds PR 23 niet meer, maar de sessie beëindigen is de betere maatregel. Dashboard:
   Authentication, Users, de gebruiker, *Sign out user*; of in SQL:

   ```sql
   delete from auth.sessions where user_id = (select l.auth_user_id from public.leden l
     join public.leden_prive p on p.lid_id = l.id where p.email = '…');
   ```

3. Haal de oude app los. Het dashboard (Authentication, Users, de gebruiker, MFA-factoren, verwijderen) is de
   voorkeursroute en beëindigt de sessies van die app zelf. In SQL kan het ook en dat is online geprobeerd en werkt
   (30-10-2026, `hosting.md` stap 14):

   ```sql
   delete from auth.mfa_factors where user_id = (select l.auth_user_id from public.leden l
     join public.leden_prive p on p.lid_id = l.id where p.email = '…');
   ```

4. Het bestuurslid logt in met de mail en stelt een nieuwe app in. Tot die bevestigd is, werkt alles als lid.
5. **Bevestigen**, zoals hierboven.

## Een aanval vermoed

Krijgt een bestuurslid mails met inloglinks die hij niet heeft aangevraagd, of staat er een app die hij niet kent:
beëindig alle sessies van het lid, haal alle apps weg (stappen 2 en 3 hierboven), zet `is_admin` uit tot hij zijn
mailbox heeft beveiligd, en begin dan opnieuw. Een bestuurslid meldt zulke mails altijd bij de beheerder; zet dat in de
afspraken met het bestuur.

## Iemand laten inloggen zonder mailserver (tijdelijk)

Zolang Resend geen eigen domein heeft, mailt het alleen naar het adres van het eigen account: een lid dat zich aanvraagt
krijgt dan geen mail. Voor een kijkdag met de opdrachtgever kan de beheerder een eenmalige inloglink maken en privé
doorsturen. **Alleen voor het ontwikkelproject en alleen voor een lid dat je kent; dit is geen vervanging van de mail.**

1. Het lid bestaat: Supabase, Authentication, Users, *Add user* (met *Auto Confirm*) en de rij in `leden` en `leden_prive`
   (zie "Een nieuwe beheerder activeren", stap 1 en 3).
2. In Ubuntu, in de map van de repository: `node scripts/maak-inloglink.ts naam@voorbeeld.nl`. Het programma vraagt om
   het adres van het project, het adres van de site en de geheime sleutel (*API Keys* in Supabase). De sleutel typ je
   verborgen in; hij komt nergens terecht. Sluit het venster daarna.
3. Het toont een link die één keer en een uur werkt. Stuur hem **privé** aan dat ene lid (een berichtje, geen groep en geen
   mail). Wie de link opent, is dat lid; een mailprogramma of chat dat de link vooraf opent, verbruikt hem niet (de pagina
   wacht op een klik op **Inloggen**).
4. Na het inloggen blijft het lid op dat apparaat ingelogd. Voor een nieuw apparaat, of na uitloggen, maak je een nieuwe
   link. Bevestig de beheerder zoals hierboven (de app instellen en daarna `beheerder_sinds`).

De sleutel geeft volledige toegang tot het project: bewaar hem alleen in je wachtwoordmanager, plak hem niet in chats of
bestanden, en vervang hem (Supabase, API Keys) als hij ooit ergens verkeerd terechtkomt. Zodra de mail naar leden werkt
(`Fase-1-plan` 2.7: eigen domein), vervalt deze route.

## Beheer intrekken

`update public.leden_prive set is_admin = false where email = '…';` Dit werkt direct, ook in een lopende sessie (de
database leest het bij elke aanvraag). `beheerder_sinds` wordt dan leeg. Beëindig ook de sessies als iemand het bestuur
verlaat.

## Wat er in de database te zien is

`public.beheerstatus()` is bedoeld voor de app: het leest de sessie van wie belt. In de SQL Editor ben je `postgres` en
geeft het `geen_lid`; controleer dus met de pagina zelf. De statussen:

| Status | Betekent | Scherm |
|---|---|---|
| `geen_lid` | geen actief lid | inloggen |
| `geen_beheerder` | lid zonder `is_admin` | "Dit is alleen voor het bestuur" |
| `mfa_instellen` | beheerder zonder bevestigde app | app instellen |
| `wacht_op_bevestiging` | app van ná `beheerder_sinds` | wachten op bevestiging |
| `code_nodig` | app in orde, geen (recente) code | code invoeren |
| `ok` | beheer | beheer |

## Bekende grenzen (pilot)

- **Codes raden.** De rem van Supabase op foute codes is per IP-adres, en een uitdaging blijft na een foute code bruikbaar
  (de app maakt per poging een nieuwe). Wie de inloglink van een bestuurslid heeft, kan buiten de app om gokken, met
  meerdere adressen sneller. Geaccepteerd voor de pilot: de aanvaller heeft de mailbox al nodig, het doelwit is klein, en
  de afweging staat in `Datamodel-fase-1.md` punt 3. Vóór de pilot meten we online wat de rem is (`hosting.md` stap 14).
- **Eén beheerder.** Zolang er één beheerder is, kan die zichzelf niet laten bevestigen door een tweede. De bouwer doet
  het met het dashboard; dat is de afspraak tot er een tweede beheerder is (pilotcheck, `Bouwbesluiten` 5.2).
