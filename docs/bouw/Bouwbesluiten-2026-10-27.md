# Bouwbesluiten — 27-10-2026

Aanvulling op `Bouwgids_Beringse_Kuus_V8.docx`. **Bij een tegenspraak met V8 gaat dit bestand voor.**
V8 blijft staan; een volgende bouwgids (V9) neemt dit over, bij voorkeur na fase 1 (zie punt 7).

**Herkomst.** Punt 1 en 2 zijn besluiten van de bouwer. Punt 3 t/m 6 volgen uit de ChatGPT-review van
27-10-2026 (`Review-bouwgids-chatgpt.md`, 26 bevindingen) en de beoordeling daarvan
(`Beoordeling-review-chatgpt.md`, die per bevinding zegt of ze klopt en wanneer ze moet zijn
opgelost). De bouwer heeft gevraagd ze vast te leggen. Wat nog een keuze van de bouwer vraagt, staat als
**Bevestig** gemarkeerd; wat nog open staat, staat in punt 6.

## 1. Meerdere verenigingen: kolom nu, beveiliging later

**Besluit (de bouwer, 27-10-2026).** In fase 1 krijgt het schema een tabel `verenigingen` met één rij
(De Beringse Kuus) en krijgt elke tabel met eigen verenigingsgegevens een kolom `vereniging_id`. RLS en
databasefuncties houden er in de pilot **nog geen rekening mee**.

**Wat dat precies is**

- `verenigingen`: `id`, `naam`. `verenigingsinstellingen` (V8 3.8) verwijst ernaar met `vereniging_id`.
- `vereniging_id uuid not null references verenigingen(id)`, standaardwaarde het id van Beringse, op
  `leden`, `activiteiten`, `groepen`, `meldingen` en `wijzigingen_log`.
- `wijzigingen_log` krijgt een **eigen** kolom, ook al lijkt het een kindtabel: na het hard verwijderen
  van een concept (V8 4.6) bestaat de activiteit niet meer, en de logregel moet dan nog bij een
  vereniging horen.
- Tabellen die via een ouderrij bij een vereniging horen krijgen geen eigen kolom: `leden_prive`
  (via `leden`), `rol_slots` en `afmeldingen` (via `activiteiten`), `lid_groep` en `activiteit_groep`
  (via `groepen`/`activiteiten`). Leg per tabel in de migratie vast hoe de vereniging wordt afgeleid.
- Een test controleert dat elke tabel óf de kolom heeft óf op de lijst "afgeleid via ouder" staat.

**Wat nog niet gebeurt (de latere ombouw, een eigen fase met eigen review)**

1. RLS: "je ziet alleen rijen van je eigen vereniging".
2. Alle databasefuncties controleren de vereniging.
3. Tests per rol uitbreiden: "een lid van vereniging A ziet niets van vereniging B".
4. Inlog: een lid hoort bij één vereniging, e-mailadres en token zijn uniek per vereniging in plaats van
   overal, en het vervangt de standaardwaarde.
5. Agenda-tokens, meldingen, auditlog, instellingen en seed per vereniging.

**Harde grens.** Er komt **geen tweede verenigingsdataset in de database vóór de ombouwfase is
geaccepteerd.** De kolom is voorbereiding, geen gegevensisolatie.

**Onderbouwing voor de begeleider.** Schaalbaarheid was uitgangspunt (02-10). Volledig inbouwen vraagt
extra werk in alle pilotfasen zonder dat een gebruiker er iets van merkt. Niets inbouwen maakt de
ombouw duurder. De kolom is het goedkoopste deel dat de ombouw **kleiner** maakt. De ombouw blijft
wel substantieel (de punten hierboven): "kleiner", niet "klein".

## 2. Review: De developer-reviewer valt af, ChatGPT heeft gereviewd, de bouwer beslist

**Besluit (de bouwer, 27-10-2026).** De developer-reviewer beoordeelt V4 t/m V8 niet. De bouwgids is door ChatGPT nagelopen
(`Review-bouwgids-chatgpt.md`) en door Claude beoordeeld (`Beoordeling-review-chatgpt.md`).

- **De zes vragen uit V8 15.2 zijn nu beantwoord door ChatGPT, niet door een mens met ervaring in dit
  stack.** Zet dat eerlijk in het eerste pull request en in het overdrachtsdocument (bouwgids 11.4):
  *V4 t/m V8 zijn niet door een developer beoordeeld.* Noem in de **publieke** repository geen namen;
  de naam van de begeleider hoort daar niet in.
- **De bouwer beslist over techniek** en legt elk technisch besluit met reden vast in dit bestand.
- Bij beveiliging (punt 4.2 tot en met 4.4) is een **tweede review van de uitgewerkte tekst** door een
  schone chat verplicht vóór fase 1 wordt afgerond.
- Technische claims over Supabase, Cloudflare en Resend zijn nagelopen in hun documentatie (27-10-2026)
  en kunnen veranderen. Controleer ze vóór je betaalt of uitrolt.

## 3. Hosting en kosten

### 3.1 Hosting: Cloudflare Workers, niet Pages

Cloudflare Pages draait alleen statische Next.js. De agenda-route (`.ics`), de inlog-callback met
cookies en de geplande meldingen vragen serveruitvoering. V8 2.1 ("Cloudflare Pages") klopt daarom niet.

- **Keuze (de bouwer, 27-10-2026): Cloudflare Workers met de OpenNext-adapter.** Echte Next.js, dezelfde code
  als met `next dev`, standaardoplossing waar documentatie en Claude Code goed mee overweg kunnen.
- **Terugval: vinext** (Cloudflares eigen herbouw van Next.js, door hen aanbevolen voor nieuwe apps, nog
  beta). Alleen als OpenNext de fase-0-test niet haalt.
- **De Next.js-versie staat vast** en wordt bijgewerkt zodra er een beveiligingsupdate is (14.4).
- **Fase-0-test (afronding fase 0 hangt hieraan), op echte Workers, niet alleen lokaal:**
  1. een route die een `.ics`-bestand teruggeeft (zoals `/agenda/[token].ics`);
     - **Uitkomst (28-10-2026):** geslaagd op de echte Worker; op een iPhone geabonneerd, de afspraak staat in de
       agenda met de juiste tijden (`Fase-0-plan.md` punt 4).
  2. inloggen met een magic link, met de callback en sessiecookies via Supabase;
     - **Uitkomst (28-10-2026):** werkt op de echte Worker, ook op een telefoon (`docs/bouw/Inloggen.md`). Voor
       het verversen van de sessie en de CSP met nonce is een middleware nodig. **Besluit (de bouwer):
       `middleware.ts` met de edge-runtime**, niet `proxy.ts`. Beide slaagden lokaal in workerd voor alle
       browsertests; `proxy.ts` (de standaard van Next.js 16) draait altijd in de Node-runtime, en die noemt
       OpenNext op Workers experimenteel en niet onderhouden. `middleware.ts` is wat OpenNext ondersteunt, met een
       kleinere bundel; Next.js 16 noemt het "deprecated". Reden en wat te doen bij een update: `docs/hosting.md`.
  3. een geplande taak die één bericht verstuurt (Workers Cron Trigger, of `pg_cron` in Supabase die een
     route aanroept: kies wat werkt en leg het vast).
     - **Keuze (de bouwer, 28-10-2026): Workers Cron Trigger in een eigen taken-Worker** (`taken/`,
       `ledenplatform-taken`), zonder route, zonder adres en zonder de Next-app. Redenen: (1) alleen deze Worker krijgt
       de geheime sleutel van Supabase; in de app-Worker zou de hele app hem via `process.env` kunnen lezen, en hij
       gaat om alle rechten heen (review PR12-01); (2) geen openbaar adres, dus geen geheime header nodig; (3) voor
       fase 7 (de dagmelding) hetzelfde patroon. **Beperking:** de taken-Worker gebruikt geen pakketten (gewone
       `fetch`), omdat de uitrolstap niets installeert (review PR8-03); `controle:poort` dwingt dat af (review PR12-06).
       Vraagt fase 7 toch een pakket, dan bundelen in de bouwjob en uitrollen met `--no-bundle`. `pg_cron` blijft de
       terugval. **Online geslaagd (28-10-2026):** elke minuut één rij, geen dubbele, precies één testbericht, en een
       gedwongen fout als `mislukt` zichtbaar; daarna stilgezet (`docs/hosting.md` stap 12).
     - **Migraties online (open, besluit vóór de eerste migratie van fase 1; review F0-11).** In fase 0 zette de
       beheerder ze met de hand online met `supabase db push` (eerst `--dry-run`), vanaf `main`, nooit los in de SQL
       Editor (`docs/hosting.md` stap 12). Voor twee proeftabellen was dat genoeg. In fase 1 rolt de pijplijn code uit
       die een nieuwe tabel of functie verwacht; staat de migratie dan nog niet online, dan geeft de app fouten tot
       iemand `db push` doet. En een wijziging in het dashboard (14.2 verbiedt dat) valt nergens op. Twee opties:
       (a) een job `migraties` in de workflow `uitrol`, met een eigen omgeving en een eigen Supabase-token, die vóór
       `wrangler deploy` draait en `db push --dry-run` in de log zet; (b) minimaal een regel in het PR-sjabloon: "deze
       pull request bevat een migratie: eerst `db push`, dan samenvoegen". De Auth-instellingen (redirect-URL's,
       mailtekst, aanmelden uit) gaan dan met `supabase config push`, zodat het pilotproject (punt 10) ze niet met de
       hand hoeft te krijgen.
- **Uitkomst fase-0-test (28-10-2026): alle drie geslaagd op de echte Workers. OpenNext blijft; vinext is niet
  nodig** (punt 6). Wat gekozen is en waarom: `docs/hosting.md`.
- Leg in `docs/` vast: gekozen deploymentvorm, frameworkversie, adapter, hoe secrets staan en waar de
  geplande taak draait. Slaagt één van de drie niet, probeer dan vinext met dezelfde drie tests.
- **Rekentijd.** Het gratis Workers-plan geeft 10 ms rekentijd per aanvraag (wachten op de database telt
  niet mee). Meet dit in de test; is het te krap voor Next.js met inlog, neem dan het betaalde plan
  ($5 per maand).
  - **Gemeten (28-10-2026, na de eerste uitrol):** CPU-tijd P50 198 ms, P99 506 ms; ook warm (30 aanvragen achter
    elkaar) blijft het rond de 190 ms. Dat is ongeveer 20 keer de grens. Er was nog geen enkele fout ("Exceeded CPU
    Time Limits": 0). **Opnieuw gemeten** na de middleware en de agenda-feed: mediaan 218 ms per aanvraag, nog
    steeds 0 fouten; de taken-Worker 0,24 ms per run. Details: `docs/hosting.md`, Metingen.
  - **Uitkomst:** te krap, dus het betaalde plan ($5 per maand) volgens deze regel.
  - **Besluit (de bouwer, 28-10-2026):** tijdens het bouwen gratis houden zolang er geen CPU-fouten zijn (alleen
    verzonnen gegevens, één gebruiker), direct overstappen bij de eerste fout, en in elk geval vóór de pilot.
    Opnemen in de kostenvraag aan de opdrachtgever (3.2).

### 3.2 Kosten

V8 2.1 en 2.2 ("circa €25 per maand, volledig voorspelbaar") kloppen niet. Duurste scenario ±€50 per
maand; goedkoper kan.

| Post | Plan |
|---|---|
| Supabase | **Gratis tijdens het bouwen, met uitsluitend fictieve gegevens. Pro ($25) vanaf het moment dat echte leden erin staan** (uiterlijk vóór de pilot). Gratis plan: geen back-ups en pauzeert na 7 dagen zonder activiteit. Nooit echte persoonsgegevens op het gratis plan |
| E-mail | **Resend gratis** (100 mails per dag, 3.000 per maand) door de dagmelding te **bundelen: één mail per lid per dag**, ook bij meerdere diensten. Op de drukste dag blijft dat ongeveer 42 mails. Telt per dag mee: inloglinks en wijzigingsmeldingen. Haalt het project de 100 toch, dan Resend Pro (prijs nog niet nagekeken) of een andere dienst (Brevo gratis geeft 300 per dag, vendorclaim, account moet worden goedgekeurd) |
| Cloudflare Workers | **Betaald ($5) vanaf de pilot**: de rekentijdtest uit 3.1 (28-10-2026) liet ±200 ms per aanvraag zien, tegen 10 ms op het gratis plan. Tijdens het bouwen gratis zolang er geen CPU-fouten zijn (besluit 28-10-2026, zie 3.1) |
| Domeinnaam | Komt erbij, niet doorgerekend |
| Point-in-time recovery | **Niet.** Zit niet in Pro (extra optie, ±$100 per maand). V8 2.1 en 7.3 beweren het wel en kloppen niet |

**Verwacht:** €0 tijdens het bouwen; ongeveer €25 tot €30 per maand vanaf de pilot (Supabase Pro $25 en Workers
$5, samen $30; omgerekend afhankelijk van de koers). De opdrachtgever moet vóór de
pilot akkoord geven op dit bedrag. Een eerder akkoord op kosten is nergens vastgelegd (niet in
`docs/communicatie`); is dat mondeling gebeurd, schrijf het dan op. Neem het anders mee in de
eerstvolgende vrijdag-update.

### 3.3 Repository: publiek op GitHub

**Besluit (de bouwer, 27-10-2026).** De code staat in een **publieke** GitHub-repository. Beschermde `main`,
secret scanning en push protection zijn op een privé-repository niet gratis; op een publieke wel. De app
draait op Cloudflare Workers (3.1). De eigen ontwikkelserver van de bouwer is geen vervanger voor GitHub of Cloudflare,
maar kan het prototype en gelicentieerde bestanden tonen, mits de licentie dat toestaat.

**Wat nooit in de repo komt:** ledengegevens, sleutels, de Central-iconen, de foto's van de vereniging,
`docs/visueel/`, de communicatie met de opdrachtgever en persoonsnamen van derden in de gekopieerde
documenten (zie `Fase-0-plan.md` punt 1.4). De eerste commit wordt met de hand gecontroleerd vóór de
eerste push: wat openbaar is geweest, blijft in de geschiedenis. De poort krijgt een controle op
bestanden zonder vermelding in `docs/licenties.md`.

**Gevolg voor V8 14.7:** de Central-iconen mogen niet in de repo (licentie Iconists). Beslis vóór fase 1
welke iconen de app gebruikt (zie punt 6).

### 3.4 Back-ups

Pro maakt dagelijks een back-up en bewaart er zeven. **Aanname (de bouwer bevestigt): het bestuur accepteert
dat bij een ramp hooguit ongeveer één dag aan wijzigingen verloren gaat.** Vóór de pilot is één
terugzet-oefening gedaan (V8 7.3, die daar nu pas in fase 8 staat), inclusief de vraag of Auth, rechten
en klaargezette meldingen goed terugkomen, en of een herstel geen oude mails opnieuw verstuurt.

## 4. Datamodel en rechten vóór fase 1

Deze punten moeten **vóór** de migraties van fase 1 zijn uitgewerkt en gereviewd (4.2 t/m 4.4: tweede
review, punt 2).

### 4.1 Identiteit (review 01)

V8 3.1 zegt dat het `id` van een externe helper leeg blijft, terwijl een primaire sleutel niet leeg kan
zijn en `rol_slots.bezetter_id` ernaar verwijst. Dat is niet te bouwen.

- Elke rij in `leden` krijgt een **eigen uuid** (`id`, gegenereerd), óók externe helpers.
- Het inlogaccount staat in een aparte kolom `auth_user_id` (uuid, uniek, **mag leeg**, verwijst naar
  `auth.users`). Externe helpers hebben die niet.
- Alle verwijzingen (`bezetter_id`, `lid_id`, enzovoort) gaan naar `leden.id`.
- Eén functie `huidig_lid()` vertaalt `auth.uid()` naar het actieve lid. Alle RLS-regels en functies
  gebruiken die, niet rechtstreeks `auth.uid()`.

### 4.2 Privé en publiek scheiden (review 04)

RLS werkt per rij, niet per kolom. Staan telefoon, e-mail en agenda-token in dezelfde rij als de naam,
dan geeft een leesrecht op de naam ook die velden vrij.

- Nieuwe tabel `leden_prive` (één rij per lid): `lid_id`, `email` (uniek), `telefoon`, `agenda_token`,
  `agenda_token_versie`, `agenda_laatst_opgehaald`. Alleen het lid zelf en de admin lezen die rij.
- Het telefoonnummer van de eindverantwoordelijke gaat via een eigen functie
  (`contact_eindverantwoordelijke(activiteit_id)`), alleen bij een activiteit die het lid mag zien.
- `leden` bevat wat andere leden mogen zien (naam, type, actief).
- `beschikbare_vervangers()` geeft alleen id, naam en beschikbaarheidsreden terug; nooit een
  `toelichting` of privéveld.
- Tests: ook **rechtstreekse selects en joins** op de tabellen, niet alleen wat het scherm toont.

### 4.3 Rechten vanaf het eerste gegeven (review 03, 07)

V8 zet RLS en MFA in fase 3 (10, 7.2), terwijl fase 1 en 2 al gegevens en beheerschermen opleveren.

- **Elke tabel, view en functie krijgt zijn toegangsregels en negatieve tests op het moment dat hij
  wordt aangemaakt** (fase 1). Fase 3 breidt uit met ruilen en afmelden.
- **Admin-MFA (`aal2`) geldt vanaf de eerste bereikbare beheerfunctie**, niet pas in fase 3. Een
  beheerfunctie controleert de actuele adminstatus én `aal2`, ook als hij `security definer` is.
- Per functie vastleggen: wie hem mag aanroepen (`EXECUTE`-rechten, standaardrechten ingetrokken), eigenaar
  en een vaste `search_path`.
- **Leden-RPC's: eerst wie belt, dan pas wat er bestaat.** Controleer eerst of de aanroeper een actief
  intern lid is met toegang tot de activiteit, daarna pas objectdetails of foutredenen. Voor een
  onbekende en een ontoegankelijke activiteit is de buitenkant gelijk, zodat een foutcode het bestaan
  van een verborgen activiteit niet verraadt (R22). Dit geldt ook voor `trek_afmelding_in()` en
  `beschikbare_vervangers()`, die in de use-case-tabellen nog geen volledig rechtencontract hebben.
- Ook `groepen`, `lid_groep`, `activiteit_groep`, `verenigingsinstellingen` en `meldingen` krijgen
  eigen rechten. Een ontbrekende `activiteit_groep`-rij betekent "iedereen", maar een voor het lid
  verborgen rij mag daar niet voor worden aangezien.
- **Pilotvoorwaarde.** Tot 4.3 en 14.4 voor een tabel zijn voldaan, staan er alleen fictieve gegevens in
  die omgeving. Echte leden komen er pas in als dat klopt.

### 4.4 Aanmaken en rolstructuur (review 10)

`activiteit_opslaan` gaat in V8 uit van een bestaande activiteit; het aanmaken zelf (fase 1) is niet
beschreven.

- **`activiteit_opslaan` met een lege `activiteit_id` maakt een nieuwe activiteit**: de server
  genereert het id, vult de standaardwaarden (status concept, type seizoen, minimaal aanwezig 13) en
  maakt **precies één** plek eindverantwoordelijke (leeg). Daarna gelden dezelfde controles en dezelfde
  transactie. Op een nieuwe rij is geen lock nodig.
- `plek_toevoegen` krijgt `plek_label` (nodig voor een nieuwe bakplek). Toegestane velden, roltypen,
  baklabels en unieke tijdelijke ID's per handeling staan in de migratie en de test.
- De gecombineerde UI-actie "persoon eraf en plek weg" wordt in de opslag vertaald naar leegmaken plus
  verwijderen; de melding komt uit het verschil tussen begin- en eindtoestand.
- **Iedere meegestuurde `rol_slot_id` moet bij de vergrendelde activiteit horen**; anders kan een
  verzoek voor activiteit A een plek van B raken (review 09).

### 4.5 Eén tijdfunctie (review 19)

De Bonte Avond loopt tot 01:00. Eén databasefunctie bepaalt "bezig", "geweest" en deadline in
`Europe/Amsterdam`, en wordt overal gebruikt: welkomscherm, afmelden, tellers, agenda-feed.

- Een activiteit die gisteren begon en nog loopt, blijft op het welkomscherm.
- Deadlines en einde worden getoetst op het moment **na** het verkrijgen van de lock, niet op het
  moment dat de transactie begon.
- Tests rond 00:00, rond het exacte deadlinemoment, met een lock die over die grens wacht, en rond de
  overgang naar en van zomertijd.

### 4.6 Concept verwijderen en de logs (review 14)

- Hard verwijderen blijft (V8 4.6). Zeg het eerlijk: **een verwijderd concept komt niet terug**; de log
  bewaart naam en datum, niet de indeling.
- "Logs bevatten geen persoonsgegevens" (V8 14.4) gaat over **technische logs** (server, fouten). De
  `wijzigingen_log` is een bewuste auditlog en mag alleen noteren wie wat deed; kopieer er geen
  afmeldtoelichtingen in.

### 4.7 Dekkingsmatrix (review 23)

De matrix in `UX-FLOWS.md` bevat nog de oorspronkelijke zes testgevallen en mist R22 t/m R24. Werk hem
bij vóór fase 1: per regel en foutcode een verwijzing naar de servertest, de browsertest en de melding
of het scherm. Foutcodes die nog geen scherm hebben (bijvoorbeeld `vervanger_ongeldig`, `activiteit_niet_open`,
`al_afgemeld`, `niet_afgemeld`, `geen_bezetter`, `activiteit_voorbij`, `alleen_concept`) worden als **gat**
gemeld, niet zelf bedacht (V8 12, 14.3). De poort per fase toetst alleen de onderdelen van die fase.

### 4.8 Ontwerpoverdracht aangevuld (review 24)

Aanvulling op `Design-overdracht.md`: per gebouwd scherm bewaart het pull request de voorbeelddata, de
viewport, de toestand, de screenshot en de beoordeelde afwijkingen. Handmatige controles per fase:
schermlezernaam en statusmelding, focus na een fout, zoom en reflow, toetsenbord op de keuzelijst met
aankruisvakjes en de schakelaar. Respecteer `prefers-reduced-motion`. Nul axe-overtredingen is nodig
maar bewijst de norm niet.

## 5. Fase 2, pilot en wat later komt

### 5.1 Vóór fase 2

- **Versie van de activiteit (review 06).** `verwachte_bezetter` beschermt alleen plekken. Voeg
  `activiteiten.versie` toe, verhoog die bij elke wijziging die de getoonde activiteit raakt (velden,
  plekken, doelgroep), stuur `verwachte_versie` mee bij Opslaan en toets die na de lock. **Bevestig:** of
  dit `verwachte_bezetter` vervangt of ernaast komt, en welke melding de beheerder krijgt (het
  scherm `admin-fout-slot-gewijzigd.html` bestaat alleen voor `slot_gewijzigd`; een nieuwe foutcode
  heeft een tekst en vervolgstap nodig, V8 14.3).
- **Doelgroep (review 05).** Iedere ingedeelde interne deelnemer hoort bij de doelgroep van de
  activiteit. Toets dit bij ruilen, indelen en doelgroepwijzigingen op de eindtoestand. Een
  doelgroepwijziging met ingedeelden die daardoor toegang verliezen wordt geweigerd, of de admin
  verwijdert ze expliciet in dezelfde opslag. **Bevestig** welke van de twee (nieuw scherm of tekst
  nodig). Externe helpers vallen buiten de doelgroep.
- **BA-6** (roltypen als tabel) is beslist vóór fase 2 (aanname: tabel `roltypen`).

### 5.2 Vóór de pilot (echte leden)

Eén korte pilotcheck, niet meer dan dit:

1. Echte deelnemers kunnen veilig inloggen; de inloglink kan opnieuw worden aangevraagd.
2. Beheer vereist MFA, met herstelroute bij een verloren toestel.
3. De noodzakelijke berichten komen aan, binnen de dagelijkse mailgrens (3.2); mislukte verzending is
   zichtbaar voor de beheerder.
4. Een back-up is teruggezet (3.4).
5. Twee beheerders hebben toegang tot GitHub, Supabase, Cloudflare, domein en betaling, en iemand
   anders dan de bouwer heeft de runbookstappen uitgevoerd.

### 5.3 Meldingen betrouwbaar (review 08), vóór de pilot

Klaarzetten in de transactie is nog geen verzenden. Een tabel `meldingen` met bericht-ID, ontvanger,
kanaal, status, pogingen en volgende poging; een terugkerende taak claimt berichten veilig en
verwerkt ze met begrensde pogingen; een vaste idempotentiesleutel per bericht naar Resend (volgens de review bewaart
Resend sleutels 24 uur, dus geen onbeperkte exactly-once; niet zelf nagelopen). Opslaan betekent "opgeslagen, berichten klaargezet";
bezorging krijgt een eigen status.

### 5.4 Bewust geparkeerd tot de bijbehorende fase

| Review | Onderwerp | Bij fase |
|---|---|---|
| 11, 12, 13 | Idempotentie en limieten bij bulk, Excel-parser, kopieerdetails (`bak_actief`, deadline opnieuw berekenen) | 9 |
| 16, 17, 18 | Agenda-feed: URL niet loggen, `Cache-Control: private`, alleen eigen diensten, `updated_at` en `SEQUENCE` toevoegen aan 3.2, iCal-escaping, "gekoppeld" pas na eerste aanvraag en leegmaken bij nieuw token | 7 |
| 20 | Eén tabel "welke gebeurtenis naar wie" voor meldingen; "push in de webapp" (V8 8.3) uit V8 halen of definiëren | 5 en 7 |

Niet overgenomen als te zwaar voor 42 leden: tokens gehasht opslaan, een limiet per token, een Web
Worker voor de Excel-import.

## 6. Open besluiten

| Besluit | Uiterlijk | Aanname tot dan |
|---|---|---|
| ~~Hosting: OpenNext of vinext~~ **Besloten 28-10-2026: OpenNext.** Alle drie proefroutes zijn op de echte Workers geslaagd; vinext is niet nodig (3.1) | — | — |
| ~~Migraties en Auth-instellingen online~~ **Besloten 29-10-2026: een job `migraties` in de workflow `uitrol`**, vóór de uitrol van de app, in een eigen omgeving `ontwikkel-database` (3.1, review F0-11 en PR20-06). In plaats van een Supabase-token gebruikt de job de verbinding met de database (`SUPABASE_DB_URL`): één geheim in plaats van een token plus het databasewachtwoord, en de CLI heeft dan geen `supabase link` nodig. Uitvoering: `Fase-1-plan.md` stap A, `docs/hosting.md` stap 13 | — | — |
| ~~Testopzet voor twee gelijktijdige sessies (bouwgids 14.5)~~ **Besloten 29-10-2026: naar fase 1**, bij de eerste schrijffunctie met een rij-lock (punt 11) | — | — |
| Wie de tweede beheerder wordt, en de repository naar een organisatie (5.2 punt 5, review F0-12) | vóór fase 1 | Alles op naam van de bouwer |
| Licentie van de code (8, review F0-13) | vóór fase 1 bekijken; besloten vóór de eerste bijdrage van iemand anders | Geen licentie: alle rechten voorbehouden |
| ~~Pilotmoment (V8 13.3)~~ **Besloten 29-10-2026: A, rond 14–22 november 2026**, met de opdrachtgever af te stemmen. Wat het naast de code vraagt en het voorgestelde beslismoment (6 november, anders B): `Fase-1-plan.md` 2.7 en 3 | — | — |
| Versie van de activiteit en doelgroepconflict: welke foutcode, welk scherm (5.1) | vóór fase 2 | Zie 5.1 |
| BA-6: roltypen als tabel | vóór fase 2 | Tabel `roltypen` |
| Kosten (±€25–30 per maand) en de herstelafspraak (3.4): akkoord van de opdrachtgever | vóór de pilot | Niet gevraagd; in de vrijdag-update meenemen |
| ~~Iconen voor de app~~ **Besloten 29-10-2026: de Central-iconen, buiten de publieke repo**, bij de uitrol binnengehaald uit een privébron; alleen als de licentie uitleveren door een site toestaat en de vereniging ze na de stage mag houden, anders een open set (`Fase-1-plan.md` 2.8) | vóór stap E van fase 1: de licentie nagaan | — |
| Licentie Central-iconen (V8 14.7): op wiens naam, mag een site ze uitleveren, blijft het na de stage toegestaan | vóór de eerste echte uitrol | Alleen in prototype en ontwikkelomgeving |
| ~~Is het programma 2026/2027 openbaar?~~ **Besloten 27-10-2026:** het mag in de publieke repo (bouwgids 13.5 en de seed). De vereniging zet haar programma elk seizoen zelf op haar website (2025/2026 staat op beringsekuus.nl/fotos/, nagekeken 27-10-2026); het bevat alleen data en namen van openbare activiteiten, geen personen | — | — |
| Logo en foto's: toestemming van de opdrachtgever (V8 14.7) | vóór de eerste echte uitrol | Alleen in prototype |
| Zes vragen aan de opdrachtgever (V8 15.1) | geen deadline | De aannames in V8 15.1 |

## 7. Rechtzettingen in V8

V8 wordt niet herschreven; deze lijst gaat naar V9, dat bij voorkeur na fase 1 komt, als de
datamodelkeuzes bewezen zijn en de fase-0-test is gedaan. Tot dan geldt dit bestand.

| V8 | Wat klopt niet | Zie |
|---|---|---|
| Inleiding | "Deze V3 verwerkt …" | historisch; bovenaan de actuele bronvolgorde zetten |
| 2.1, 2.2, hoofdstuk 10 (fase 0) | Cloudflare Pages; "circa €25 voorspelbaar"; "point-in-time recovery bij Pro"; "zie 9.4" (bedoeld: 8.4) | 3.1, 3.2 |
| 3.1, 9 | `id` leeg bij externe helpers | 4.1 |
| 3.1 | telefoon, e-mail en token in dezelfde rij als de naam | 4.2 |
| 3.2 | `updated_at` en `SEQUENCE` ontbreken, terwijl 4.7 ze vereist; "17 februari: drie" moet **9 februari** zijn (zie 13.4) | 5.4 |
| 5.4 | annuleren van een concept meldt "iedereen die niet was afgemeld", tegen R18 (geen melding bij een concept) | 5.4 |
| 6.1 | uitnodigingslink "14 dagen geldig": volgens de review is een Supabase-link standaard één uur geldig (niet zelf nagelopen, controleer in de Auth-instellingen); batches van 20 per minuut helpen niet tegen de daglimiet | 3.2 |
| 7.2, 10 | RLS en MFA in fase 3 | 4.3 |
| 7.3 | point-in-time recovery; back-ups pas in fase 8 | 3.4 |
| 14.7 | iconen en foto's "gebundeld in de app" terwijl de repo publiek is: de Central-iconen en foto's mogen niet in de repo | 3.3 |
| 8.3 | "push in de webapp" is niet gedefinieerd; "iedereen die niet is afgemeld" is te ruim bij een doelgroep | 5.4 |
| 14.5 | "R1 tot en met R21" moet **R24** zijn | — |

Bij tegenspraak tussen FO, V8 en dit bestand: dit bestand, dan V8, dan het FO (V8 15.3). Meld het verschil
in plaats van zelf te kiezen.

## 8. Bron van de documenten en beveiliging van de repository

**Besluit (de bouwer, 27-10-2026).** Er waren twee kopieën van de documenten: de ontwerpmap en deze
repository. Die liepen uit elkaar. Vanaf nu:

- **Technische afspraken** (`CLAUDE.md`, `SECURITY.md`, `README.md`, `docs/bouw/`, `docs/licenties.md`,
  `docs/README.md`): **de repository is de bron**. Wijzigen via een branch en een pull request. De versies in de
  ontwerpmap zijn archief.
- **Ontwerpdocumenten** (`docs/ux-flows/`, `docs/visueel/stijl.css` en `INDEX.md`, bouwgids en FO als `.docx`):
  **de ontwerpmap is de bron**. De repository krijgt een opgeschoonde kopie via het kopieerscript in de
  ontwerpmap, in een pull request. Niet in de repository met de hand wijzigen.
- Bouwgids V9 wordt markdown in de repository.

**Beveiliging van de repository (27-10-2026)**, naast secret scanning, push protection en de beschermde `main`:
Dependabot-meldingen en -beveiligingsupdates aan; GitHub Actions moeten op een volledige commit-SHA staan
(afgedwongen in de instellingen); privé melden van lekken aan, met uitleg in `SECURITY.md`.

**Nog open:** een licentie. Zonder licentie geldt "alle rechten voorbehouden". Kies pas na overleg met de
stagebegeleider en de vereniging wie eigenaar is van de code.

## 9. Grote versie-updates van TypeScript en ESLint

**Besluit (de bouwer, 27-10-2026).** Dependabot opende direct na het aanzetten pull requests voor TypeScript 7 en
ESLint 10. Die zijn gesloten. TypeScript 7 is een herbouwde compiler; het is niet zeker dat Next.js 16 en de
typebewuste lintregels ermee werken. ESLint 10 is net uit; `eslint-config-next` is met ESLint 9 getest.
Dependabot negeert grote versie-updates van `typescript` en `eslint` voortaan (`.github/dependabot.yml`); kleine
updates komen gewoon binnen. Een grote update gebeurt bewust, in een eigen pull request met de hele poort groen,
uiterlijk vóór het begin van fase 1 bekeken.

## 10. Supabase: regio, lokale database en standaardrechten

**Besluit (de bouwer, 27-10-2026).**

- Het ontwikkelproject `ledenplatform-ontwikkel` staat in West Europe (Londen, `eu-west-2`), op het gratis plan,
  met alleen verzonnen gegevens. Het pilotproject met echte leden komt in een **EU-regio (Frankfurt,
  `eu-central-1`)** op Pro: de regio van een bestaand project is niet te wijzigen, en een EU-regio maakt de
  AVG-uitleg eenvoudig.
- Ontwikkelen en testen gebeurt tegen een **lokale database** (Supabase-CLI in Docker), ook in GitHub. De online
  projecten worden pas gekoppeld bij het inloggen (stap D2) en het uitrollen (stap E).
- **Standaardrechten staan dicht** (eerste migratie): nieuwe tabellen, reeksen en functies in `public` krijgen
  geen rechten voor `anon` of `authenticated`, en functies niet voor iedereen (`PUBLIC`). `npm run test:db`
  faalt op een tabel zonder RLS en op een nieuwe tabel of functie die toch vanzelf bereikbaar is.
- **Ook los van wie iets maakte** (review F0-10, 28-10-2026): de standaardrechten hierboven gelden alleen voor
  objecten van de rol `postgres` (de migraties). Een extensie of een wijziging in het dashboard maakt objecten als
  `supabase_admin`, en die krijgen de ruime standaard van Supabase. Daarom toetst `test:db` ook het resultaat: geen
  functie in `public` uit te voeren voor `anon` of `authenticated`, elke `security definer`-functie met een vaste
  `search_path`, elke view met `security_invoker`, niets in `public` leesbaar zonder inloggen, en geen extensie in
  `public` (extensies horen in het schema `extensions`). Krijgt een functie of tabel in fase 1 bewust een recht, dan
  komt hij in die test op een lijst, met de reden.

## 11. Gelijktijdigheid: de testopzet schuift naar fase 1

**Besluit (de bouwer, 29-10-2026)** (review F0-02). Het Fase-0-plan vroeg in fase 0 al "de testopzet voor twee
gelijktijdige sessies" (bouwgids 14.5). Die is er niet, om twee redenen:

- **Het kan niet in pgTAP alleen.** Een pgTAP-test draait in één databasesessie. Een tweede sessie openen vanuit de
  database (`dblink`) lukt in Supabase niet als gewone rol: Supabase eist dan een wachtwoord dat lokaal niet wordt
  gecontroleerd, en weigert de verbinding (uitgeprobeerd 28-10-2026). De rol `postgres` is geen superuser.
- **Er is nog niets om tegen te testen.** De gelijktijdigheid gaat over de rij-lock op `activiteiten` in
  `ruil_dienst`, `meld_af`, `activiteit_opslaan` en de andere schrijffuncties (bouwgids 4.4). Die bestaan nog niet;
  een opzet tegen een proeftabel zou opnieuw moeten bij de eerste echte functie.

**Bijgewerkt 29-10-2026 (review van het datamodel, DM-08):** de eerste functies met een rij-lock komen al in fase 1
(`activiteit_opslaan`, `concept_verwijderen`), dus de opzet ook: twee sessies via `psql` in de databasecontainer, waarvan
één het concept publiceert en de ander tegelijk wijzigt of verwijdert, zonder nieuw pakket (`Datamodel-fase-1.md` punt 9).
**Gebouwd 29-10-2026** als `e2e/gelijktijdig.spec.ts` (Playwright-project `database`); bewezen dat hij rood wordt als de lock
uit de functies wordt gehaald.

**Plan (oorspronkelijk):** bij de eerste schrijffunctie met een rij-lock (fase 1 of 2) een Vitest-test die twee aanroepen tegelijk via
de Data API van de lokale Supabase doet (`supabase-js`, dat er al is), met een vertraging in de eerste, en controleert
dat de tweede wacht of `slot_gewijzigd` krijgt. Is dat te grof, dan een eigen testhelper met twee directe
databaseverbindingen; daarvoor is een pakket nodig (bijvoorbeeld `pg`), en dat wordt dan eerst voorgelegd.

De **databasetypen** uit dezelfde stap C zijn er wel (28-10-2026): `npm run types:db` maakt
`src/lib/supabase/database.types.ts`, en de poort keurt een bestand af dat niet bij de migraties past
(`controle:dbtypen`).

