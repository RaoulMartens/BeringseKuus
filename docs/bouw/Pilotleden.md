# Pilotleden in het systeem zetten

Stand 03-11-2026. Voor pilot A (14 tot 22 november) staan de leden er niet via ledenbeheer of een import in (dat is fase 4):
de bouwer zet het testgroepje met een script. Dit bestand is de procedure. Het hoort bij review-bevinding F2-02
(`Afname-fase-2.md`): zonder telefoonnummer bij de eindverantwoordelijke kun je geen activiteit publiceren.

## Wat het script doet

`npm run leden:zet -- lijst.leden.csv` leest een lijst en zet per regel:

- het **lid**: een inlogaccount (zonder wachtwoord; het lid logt in met een code per mail, `Inloggen.md`), een rij in `leden` en een rij
  in `leden_prive`; of een **externe helper** (geen inlogaccount, geen groepen, geen BOB of eindverantwoordelijke, R17);
- het **telefoonnummer**;
- de **groepen** (bijvoorbeeld Bestuur, Raad van Elf, Dames, Overige leden): wie in welke groep zit, bepaalt wie een activiteit voor die groep ziet (R22);
- de **aanmerkingen** BOB en eindverantwoordelijke: een lid dat nog niet is aangemerkt, kun je wel indelen, maar het formulier toont er een hint bij (R19).

**Wat het bewust niet doet**

- Geen beheerders maken. Dat gaat met de procedure uit `Beheerders.md` (een app instellen, controleren, bevestigen).
- Geen leden inactief zetten, geen telefoonnummer wissen, geen type wijzigen (lid of extern). Dat kan een gepubliceerde
  activiteit stukmaken en is geen werk voor een lijst; doe het met SQL en kijk eerst wie er op staat.
- Geen mail sturen. De leden krijgen **geen uitnodiging**: je zegt ze zelf dat ze op de site kunnen inloggen met hun e-mailadres.
- Een **lege cel betekent "niet wijzigen"**, nooit "wissen". Staan er wel groepen in de cel, dan zijn dat alle groepen van dat lid.

Het script is veilig om opnieuw te draaien: wat er al staat, verandert niet, en een regel die mislukt stopt de rest niet. **Draai het nooit
twee keer tegelijk** (twee terminals): dan mislukt een deel van de regels met een melding zonder duidelijke reden. Draai het daarna gewoon opnieuw.

Een **groepswijziging** die een lid zijn eigen dienst zou laten kwijtraken, weigert het script: staat iemand ingedeeld bij een komende activiteit die alleen
voor zijn oude groep is, dan zou hij die activiteit na de wijziging niet meer zien terwijl zijn plek blijft staan (R22). De proef noemt de regel en het aantal activiteiten;
haal hem eerst uit die indeling (of laat de groepen zoals ze zijn) en draai opnieuw. Een groep **erbij** raakt niemand en mag altijd. Een **onderbroken run** laat soms een
lid met een inlogaccount maar zonder privégegevens achter; de proef meldt hoeveel dat er zijn, en staat zo'n lid in de lijst, dan maakt de volgende run het af
(zonder dubbele rij). Een inlogaccount dat al aan een ander lid met privégegevens hangt, neemt het script nooit over.

Een paar dingen die het script voor je afvangt: een **inactief lid** laat het met rust (de proef meldt het als fout: haal de regel uit de lijst); een
**beheerder** in de lijst werkt het wel bij (bijvoorbeeld het telefoonnummer van een bestuurslid dat eindverantwoordelijke is), zonder zijn beheerrechten
te wijzigen, en de proef zegt dat erbij; een **bestaand inlogaccount zonder lid** met hetzelfde adres koppelt het aan het lid, en de proef telt hoeveel dat er zijn, zodat je
ziet dat er iets niet nieuw is; en een bestand dat **niet als UTF-8** is bewaard (Excel, "CSV" in plaats van "CSV UTF-8") weigert het, omdat een naam met een accent anders
stuk in de database komt.

## De lijst

Een CSV uit Excel (Opslaan als: CSV UTF-8, met puntkomma of komma). Kolommen, in elke volgorde; de eerste drie zijn verplicht:

| Kolom | Inhoud |
|---|---|
| `voornaam`, `achternaam` | Eén voornaam en de rest als achternaam (`van Dijk`) |
| `email` | Het adres waarmee het lid inlogt (kleine letters worden het vanzelf) |
| `telefoon` | Optioneel. `0612345678` of `06 12 34 56 78` of `+31 6 12345678`. Het moet met een 0 of een + beginnen: Excel haalt de voorloopnul weg als het een getal is, zet de kolom dus op tekst. Alle leden zien dit nummer bij de eindverantwoordelijke (R10) |
| `groepen` | Optioneel. Namen van groepen, gescheiden door `\|`, zoals ze in het systeem heten. **Een lid zonder groep ziet alleen activiteiten die voor iedereen zijn.** |
| `bob`, `eindverantwoordelijke` | Optioneel. `ja` of `nee` |
| `type` | Optioneel. `lid` (standaard) of `extern` |

Voorbeeld (verzonnen):

```
voornaam;achternaam;email;telefoon;groepen;bob;eindverantwoordelijke;type
Anna;Voorbeeld;anna@example.com;0612345678;Bestuur|Dames;ja;ja;lid
Bert;Voorbeeld;bert@example.com;;Raad van Elf;;;lid
Carla;Helper;carla@example.com;06 87 65 43 21;;;;extern
```

**Waar het bestand staat.** Het bevat persoonsgegevens: bewaar het **buiten de repository** (bijvoorbeeld in je eigen map in Ubuntu). Staat
het toch in de map van de repository, dan moet het `*.leden.csv` heten (dat negeert git), anders weigert het script (ook via een symlink). Verwijder het bestand
als de pilot klaar is. Zet het nooit in een pull request, een chat of een mail. Het Excel-bestand waaruit je de CSV maakt, bevat dezelfde gegevens: laat dat
niet in OneDrive, in Downloads of in de map van de stage staan, en ruim het ook op.

**Vóór je begint: toestemming.** Elk lid weet dat zijn naam en e-mailadres in het platform staan (AVG). Een eindverantwoordelijke weet bovendien dat zijn
telefoonnummer zichtbaar is voor alle leden die de activiteit zien (R10): dat is het doel van de rol, maar het moet bekend zijn.

## Stappen

1. **Oefen lokaal**, met een verzonnen lijst: `npm run leden:zet -- ~/pilot-oefen.leden.csv` (een proef) en daarna met `--ja`. Kijk het resultaat na in de app.
2. **Proef online.** Zet de gegevens van het project in je eigen terminal (nooit in een bestand, een chat of de repository):

   Het liefst in een **subshell**, zodat de sleutel niet in je terminal blijft staan als je klaar bent:

   ```bash
   (
     export SUPABASE_URL=https://<project>.supabase.co
     read -rs SUPABASE_SECRET_KEY && export SUPABASE_SECRET_KEY    # plak de secret key (Project Settings, API Keys); er verschijnt niets op het scherm
     npm run leden:zet -- ~/pilot.leden.csv --online
   )
   ```

   Het script laat het project zien en per regel wat het zou doen (met alleen het regelnummer, geen namen of adressen). Controleer dat de **projectnaam** die het toont het
   project is dat je bedoelt (de eerste woorden van het adres in het dashboard van Supabase). Klopt iets niet, dan wijzig je de lijst en probeer je opnieuw.
3. **Doorvoeren.** Dezelfde opdracht met `--ja` erbij (in dezelfde subshell). Het script vraagt je de projectnaam te typen die het zelf toont. Dat beschermt je tegen
   een vergissing van jezelf, niet tegen een verkeerde `SUPABASE_URL`: de controle op het goede project is dus stap 2.
4. **Opruimen.** In een subshell is de sleutel weg zodra je klaar bent; anders `unset SUPABASE_SECRET_KEY`. Is de sleutel ooit ergens beland waar hij niet hoort (een chat, een bestand, de geschiedenis van je terminal), maak er dan in Supabase een nieuwe van en verwijder de oude.
5. **Controleren** in de SQL Editor (alleen tellingen, geen namen):

   ```sql
   select count(*) filter (where l.type = 'lid') as leden,
          count(*) filter (where l.type = 'extern') as externen,
          count(*) filter (where l.type = 'lid' and l.auth_user_id is null) as zonder_account,
          count(*) filter (where p.is_admin) as beheerders,
          count(*) filter (where l.type = 'lid' and not exists (select 1 from public.lid_groep k where k.lid_id = l.id)) as zonder_groep
     from public.leden l join public.leden_prive p on p.lid_id = l.id;
   ```

   `zonder_account` hoort 0 te zijn. `zonder_groep` zijn leden die alleen activiteiten voor iedereen zien: klopt dat zo? Controleer ook dat elke geplande eindverantwoordelijke een nummer heeft:
   `select count(*) from public.leden_prive where mag_eindverantw and coalesce(btrim(telefoon), '') = '';` geeft 0.
6. **Zeg de leden dat ze kunnen inloggen**: ga naar de site, vul het e-mailadres in en voer de code uit de mail in. Een lid dat niet in het systeem staat, krijgt geen mail
   (de melding is voor iedereen hetzelfde, `Inloggen.md`).

## Als het misgaat

- **Een regel mislukt** (bijvoorbeeld een e-mailadres dat al bij een ander lid hoort): het script noemt het regelnummer en de soort fout, nooit een adres of nummer. Pas de lijst aan en draai opnieuw.
- **Een fout in de lijst** (onbekende groep, ongeldig nummer, dubbel adres): het script schrijft dan niets en noemt per regel wat er niet klopt.
- **Verkeerde gegevens gezet:** pas de lijst aan en draai opnieuw voor telefoon, aanmerkingen en groepen. Een lid weghalen kan alleen met SQL; wissen op verzoek staat bij de punten
  "Vóór de pilot" in `Afname-fase-0.md`.
- **Het script logt** alleen regelnummers, aantallen en foutsoorten. Er komt geen adres, nummer, naam of sleutel in.

## Waar het staat

`scripts/zet-leden.ts` (het commando en de uitvoering), `scripts/leden-invoer.ts` (de lijst lezen en vergelijken, met tests) en `e2e/zet-leden.spec.ts`
(het geheel tegen de lokale Supabase). Het script gebruikt de secret key van het project (`service_role`): die omzeilt de rechten van de database, dus alleen de bouwer draait dit, vanaf zijn eigen computer.
