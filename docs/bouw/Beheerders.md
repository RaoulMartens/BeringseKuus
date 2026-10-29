# Beheerders: activeren, herstellen, intrekken

Wie beheer mag doen, bepaalt de database (`intern.is_beheerder()`, `Datamodel-fase-1.md` punt 3). Dit is de handleiding
voor wie dat regelt: de bouwer, later een tweede beheerder. In fase 4 (ledenbeheer) komen hier schermen voor; tot dan
gaat het met SQL in de Supabase SQL Editor van het project. **Voer ze alleen uit na een controle van wie je voor je
hebt**: wie dit doet, geeft iemand toegang tot alle ledengegevens.

## De regel in één zin

Beheer werkt voor wie `is_admin` heeft, een authenticator-app heeft ingesteld **vóór** het moment waarop `beheerder_sinds`
staat, en in deze sessie de code van die app heeft ingevoerd, niet langer dan 12 uur geleden.

De volgorde is bewust: een app die iemand ná `beheerder_sinds` instelt, telt pas als een beheerder dat bevestigt. Zo kan
niemand met alleen de inloglink uit een gekaapte mailbox zichzelf beheer geven.

## Een nieuwe beheerder activeren

1. Het bestuurslid is lid in het systeem (nu: via de seed of het script voor pilotleden; vanaf fase 4: ledenbeheer).
2. De beheerder zet het beheer aan. De trigger zet `beheerder_sinds` op het moment van nu:

   ```sql
   update public.leden_prive set is_admin = true
    where lid_id = (select id from public.leden where voornaam = '…' and achternaam = '…');
   ```

3. Het bestuurslid logt in met de link in de mail en opent Beheer. Het platform stuurt hem naar "Beheer beveiligen"
   (`/mfa/instellen`): een authenticator-app installeren, de QR-code scannen en de eerste code invoeren. Daarna staat er
   "Je app is ingesteld"; beheer is nog dicht, want deze app is van ná `beheerder_sinds`.
4. De beheerder bevestigt (let op: ná stap 3):

   ```sql
   update public.leden_prive set beheerder_sinds = now() where lid_id = '…';
   ```

5. Het bestuurslid opent Beheer opnieuw. Is zijn sessie nog geen 12 uur geleden met een code bevestigd, dan opent
   beheer direct; anders vraagt het platform eerst de code uit de app. Controleer met `select public.beheerstatus()` (als
   dat lid) of met het scherm.

Heeft een lid zijn app al ingesteld vóór hij beheerder werd (`/mfa/instellen` is voor elk ingelogd lid te openen), dan
is stap 4 niet nodig: de app is dan van vóór `beheerder_sinds`.

De eerste beheerder (de bouwer) doet dit voor zichzelf met de SQL Editor; daarna is het zijn taak om zo snel mogelijk een
tweede beheerder te activeren (pilotcheck, `Bouwbesluiten` 5.2).

## Toestel kwijt of nieuwe telefoon

Het bestuurslid kan zichzelf niet herstellen; dat is bewust (zelfde reden als hierboven). Een **andere** beheerder doet:

1. Controleer dat het echt dit bestuurslid is (bel, of spreek af).
2. Haal de oude app los:

   ```sql
   delete from auth.mfa_factors where user_id = (select auth_user_id from public.leden where id = '…');
   ```

3. Het bestuurslid logt in met de mail en stelt een nieuwe app in. Tot die bevestigd is, werkt alles als lid.
4. Bevestig met `update public.leden_prive set beheerder_sinds = now() where lid_id = '…';`

## Beheer intrekken

`update public.leden_prive set is_admin = false where lid_id = '…';` Dit werkt direct, ook in een lopende sessie (de
database leest het bij elke aanvraag). `beheerder_sinds` wordt dan leeg.

## Wat er in de database te zien is

`select public.beheerstatus();` als de ingelogde gebruiker geeft één van:

| Status | Betekent | Scherm |
|---|---|---|
| `geen_lid` | geen actief lid | inloggen |
| `geen_beheerder` | lid zonder `is_admin` | "Dit is alleen voor het bestuur" |
| `mfa_instellen` | beheerder zonder bevestigde app | app instellen |
| `wacht_op_bevestiging` | app van ná `beheerder_sinds` | wachten op een andere beheerder |
| `code_nodig` | app in orde, geen (recente) code | code invoeren |
| `ok` | beheer | beheer |
