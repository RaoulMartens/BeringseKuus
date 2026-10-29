# Fase 1: plan

Stand 29-10-2026. **De bouwer heeft beslissing 2.1 tot en met 2.4 genomen** (29-10-2026); 2.5 en 2.6 zijn nog
voorstellen. Bron: bouwgids V8
hoofdstuk 3, 10 en 14; `Bouwbesluiten-2026-10-27.md` punt 1, 4 en 6; `Afname-fase-0.md` punt 4 ("Van fase 0 naar
fase 1"); `Design-overdracht.md`.

**Doel (V8 10, fase 1):** de database met het datamodel uit hoofdstuk 3, activiteiten aanmaken als concept (bestuur),
het programma en het welkomscherm (leden). Daarbij: groepen en doelgroep (3.6), verenigingsinstellingen (3.8), een
concept verwijderen (4.6), het beheeroverzicht met tellers en taken (5.6) en het programma 2026/2027 als seed (13.5).
Resultaat volgens V8: *leden zien het rooster.*

**Wat `Bouwbesluiten` daaraan toevoegt** (gaat voor bij tegenspraak met V8):

- `verenigingen` en `vereniging_id` op de tabellen met eigen verenigingsgegevens (1);
- elk lid een eigen `id`, het inlogaccount in `auth_user_id`, en één functie `huidig_lid()` (4.1);
- privégegevens (e-mail, telefoon, agendatoken) in een eigen tabel `leden_prive` (4.2);
- **rechten en negatieve tests vanaf het eerste gegeven**, niet pas in fase 3 (4.3);
- **MFA (`aal2`) voor het bestuur vanaf de eerste beheerfunctie**: dat is in deze fase (4.3);
- aanmaken via `activiteit_opslaan` zonder `activiteit_id`, met precies één lege plek eindverantwoordelijke (4.4);
- één tijdfunctie voor "bezig", "geweest" en deadline in `Europe/Amsterdam` (4.5);
- een eerlijke `wijzigingen_log` (4.6) en een bijgewerkte dekkingsmatrix (4.7);
- een **tweede review van het uitgewerkte datamodel en de rechten** door een schone chat, vóór de afronding (2).

**Niet in fase 1:** indelen en publiceren (fase 2), afmelden en ruilen (fase 3), ledenimport en uitnodigingen
(fase 4), meldingen en de echte agenda-feed (fase 7).

## 1. Stappen

Elke stap is een eigen pull request, met de hele poort groen. Raakt een stap migraties, inloggen, de middleware, de
workflows of de poort, dan krijgt hij een eigen review door een schone chat (`CLAUDE.md`, Werkwijze).

### Stap A: opruimen en voorwerk

1. **Gedaan (PR 19).** Proefcode weg (`Afname-fase-0.md` punt 4): `src/app/proef/`, `PROEF_AGENDA_TOKEN`, `scripts/agenda-testtoken.ts`
   en die controle, `src/taken/proef-taak.ts` met zijn tests, en een migratie die `proef_taak` en
   `proef_taak_bericht` verwijdert. `taken/worker.ts` blijft als lege taken-Worker tot fase 7.
2. Het besluit over migraties online uitvoeren (beslissing 2.2): een eigen pull request, na PR 19.
3. **Gedaan (PR 19).** Poortpunten vóór de eerste tabel (review PR14-02 en PR14-08): één fabriek per soort Supabase-client met een
   ESLint-regel die andere clients verbiedt; de rechtentests ook voor `authenticated` per tabel, met een lijst van
   bewust toegestane tabellen; een controle dat de schema's van de Data API niet veranderen.

### Stap B: datamodel en rechten op papier

`docs/bouw/Datamodel-fase-1.md`, **vóór er een migratie komt** (V8 12: "database en rechten eerst"):

- per tabel: kolommen, sleutels, `vereniging_id` of "afgeleid via ouder", en de rechten per rol (niet ingelogd, lid,
  bestuurslid met `aal2`, de service-rol);
- per functie: wie hem mag aanroepen, `security definer` of niet, vaste `search_path`, foutcodes, en wat hij in
  `wijzigingen_log` schrijft. In deze fase: `huidig_lid()`, de tijdfunctie, `activiteit_opslaan` (alleen aanmaken en
  velden van een concept), `concept_verwijderen`, en de leesfuncties voor programma, welkomscherm en beheeroverzicht;
- per regel en foutcode van deze fase: de test die hem bewijst (de dekkingsmatrix, `Bouwbesluiten` 4.7). Foutcodes
  zonder scherm worden als ontwerpgat gemeld;
- welke schermen deze fase bouwt (voorlopig, uit `docs/ux-flows/wireframes`): `welkom`, `welkom-leeg`, `welkom-twee`,
  `programma`, een activiteitscherm voor leden, `admin-activiteiten` met de tellers als filter, `admin-activiteit-nieuw`,
  `admin-activiteit-voor-wie-concept`, `admin-concept-verwijderen` en de meldingen na opslaan en verwijderen. De
  rolbezetting op het welkomscherm komt pas in fase 2; wat het welkomscherm in fase 1 toont, legt dit stuk vast.

Daarna de **verplichte review** door een schone chat (`Bouwbesluiten` 2), en het akkoord van de bouwer.

### Stap C: migraties, tests en seed

1. De migraties uit stap B, met per tabel en functie de rechten en de negatieve tests in pgTAP, in dezelfde migratie
   als het object (`Bouwbesluiten` 4.3).
2. De tijdfunctie met de tests rond middernacht, het deadlinemoment en de zomertijd (4.5).
3. `npm run types:db`; de poort controleert dat de typen bij de migraties passen.
4. De seed met het programma 2026/2027 (13.5), alleen voor de lokale en de ontwikkeldatabase, met verzonnen leden.
   Nooit echte persoonsgegevens (`Bouwbesluiten` 4.3, pilotvoorwaarde).

### Stap D: MFA voor het bestuur

Een bestuurslid stelt een authenticator-app in (TOTP) en voert bij het inloggen een code in; elke beheerfunctie eist
`aal2` in de database én in de middleware of pagina. **Ontwerpgat:** de wireframes hebben geen schermen voor MFA
(instellen met QR-code, code invoeren, toestel kwijt). Die maakt de ontwerper vóór deze stap (beslissing 2.5).

### Stap E: tokens en componentenset

Volgens `Design-overdracht.md` 3: tokens uit `stijl.css` als CSS-variabelen (ook het thema per vereniging), de
lettertypes Libron en Nunito met hun licentie, en de componenten die deze fase nodig heeft (Knop, Kaart, Kopvlak,
Bovenbalk, Veld met label en fout, Melding, Lijstrij, Tijdlijnkaartje, Statuspaneel, Keuzelijst met aankruisvakjes),
in alle toestanden. Iconen: beslissing 2.3.

### Stap F: schermen

De schermen uit stap B, met de teksten uit de wireframes en het uiterlijk uit de componenten. Per scherm: axe op 1200
en 375 px, een screenshot naast `docs/visueel/<scherm>.html`, afwijkingen in het pull request (`Design-overdracht.md`
4, `Bouwbesluiten` 4.8). Serveracties met invoer volgen beslissing 2.4.

### Stap G: afname

Zoals bij fase 0 (`Afname-fase-0.md`): review van de fase als geheel tegen hoofdstuk 14, de tweede review van het
datamodel en de rechten, de doorloop met toetsenbord, telefoon en schermlezer, de Supabase-adviseur, en de vergelijking
met het visuele ontwerp.

## 2. Beslissingen van de bouwer

| # | Beslissing | Opties | Uitkomst |
|---|---|---|---|
| 2.1 | Pilotmoment (V8 13.3) | A: rond 14–22 november 2026; B: zondag 3 januari 2027 (Verlovingsbal), mét afmelden en ruilen | **Besluit (de bouwer, 29-10-2026): A.** Het voorstel was B. A vraagt fase 0 tot en met 2 gereviewd vóór 14 november, plus alles uit de pilotcheck (punt 2.7). Met de opdrachtgever afstemmen. Voorstel: op vrijdag 6 november een beslismoment (punt 3) |
| 2.2 | Migraties online (review F0-11) | a: een job `migraties` in de workflow `uitrol`, vóór de uitrol van de app, met een eigen Supabase-token in de omgeving `ontwikkel`; b: met de hand `db push` vóór het samenvoegen, met een regel in het PR-sjabloon | **Besluit (de bouwer, 29-10-2026): a.** Vanaf fase 1 komt er bij bijna elke pull request een migratie; met de hand gaat het een keer mis. Prijs: één geheim erbij |
| 2.3 | Iconen (`Bouwbesluiten` 6) | a: een open set (bijvoorbeeld Lucide, ISC-licentie), wijkt af van het ontwerp; b: de Central-iconen buiten de publieke repo houden en bij het bouwen binnenhalen uit een privébron | **Besluit (de bouwer, 29-10-2026): b, de Central-iconen.** Het voorstel was a. Voorwaarden en aanpak: punt 2.8 |
| 2.4 | Invoer met een vast schema (14.4, review F0-07) | a: Zod (nieuw pakket, MIT, veel gebruikt, werkt in de Worker); b: een eigen klein patroon per serveractie | **Besluit (de bouwer, 29-10-2026): a, Zod.** Het pakket wordt vóór het toevoegen nagekeken (licentie, grootte in de bundel, onderhoud) |
| 2.5 | Ontwerpgaten vóór de schermen | MFA instellen en code invoeren; de inlogschermen; 404 en foutpagina; melding bij een storing (`UX-FLOWS.md`, "Ontwerpgaten uit de bouw") | De ontwerper (de bouwer) maakt de wireframes vóór stap D en F. Daarvoor kan Claude een eerste versie in de stijl van de andere wireframes klaarzetten, die de ontwerper beoordeelt en aanpast |
| 2.6 | Grote update van TypeScript 7 en ESLint 10 (`Bouwbesluiten` 9) | Nu, of na de pilot | **Na de pilot.** Next.js 16 en de typebewuste lintregels zijn met de huidige versies getest; midden in de bouw een nieuwe compiler is risico zonder winst voor de gebruiker. Kleine updates komen gewoon binnen |

### 2.7 Wat pilot A vraagt naast de code

Een pilot met echte leden vraagt de pilotcheck uit `Bouwbesluiten` 5.2, ook bij een klein testgroepje. Met pilot A
moet dit vóór 14 november klaar zijn:

| Wat | Waarom | Wie |
|---|---|---|
| Akkoord van de opdrachtgever op de kosten (±€25–30 per maand) | `Bouwbesluiten` 3.2: vóór de pilot | De bouwer, met de opdrachtgever |
| Een nieuw Supabase-project op Pro in Frankfurt | Nooit echte persoonsgegevens op het gratis plan; regio EU (`Bouwbesluiten` 3.2, 10) | De bouwer |
| Workers betaald plan ($5) | Rekentijd (`Bouwbesluiten` 3.1) | De bouwer |
| Een eigen domein met mail via Resend | Zonder eigen domein stuurt Resend alleen naar het adres van het account; leden krijgen dan geen inloglink | De bouwer, met de vereniging (wiens domein?) |
| MFA voor het bestuur, een teruggezette back-up, twee beheerders | `Bouwbesluiten` 5.2 | De bouwer (stap D), de tweede beheerder |
| De leden van het testgroepje in het systeem | Ledenimport is fase 4; voor een klein groepje zet de beheerder ze er met de hand in, met hun toestemming (AVG) | De bouwer |
| Fase 2 af (indelen en tonen wie waar staat) | Pilot A toont het programma en de indeling, zonder afmelden en ruilen (V8 13.3) | De bouwer |

### 2.8 De Central-iconen buiten de publieke repository

**Eerst nagaan (de bouwer), vóór stap E:** de licentie van Iconists. Mag een website de iconen uitleveren aan
bezoekers (ze staan dan als bestand op de site, en iedereen kan ze downloaden)? Op wiens naam staat de licentie, en mag
de vereniging ze na de stage blijven gebruiken (V8 14.7)? Is het antwoord op een van de twee nee, dan valt het terug op
optie a.

**Aanpak (voorstel, uit te werken in stap E):** de app verwijst naar iconen in `public/iconen/` (bijvoorbeeld via een
CSS-masker), maar de bestanden zelf staan **niet** in de publieke repo. Ze staan in een privérepository met alleen de
iconen die de app gebruikt. De job `uitrol` haalt ze daar op met een token dat alleen die repository mag lezen, en zet
ze bij de vaste bestanden vóór `wrangler deploy`. De poort en de browsertests draaien zonder iconen; een ontbrekend
icoon laat geen gat in de lay-out (vaste maat) en heeft altijd een tekst of een `aria-label` ernaast. `controle:repo`
blijft afkeuren als er toch een Central-icoon in de publieke repo komt.

Niet nu, wel vóór fase 1 klaar is (`Afname-fase-0.md` punt 4): de tweede beheerder en de repository naar een
organisatie, en de licentie van de code. Die raken de bouw niet, maar het is de goedkoopste fase om ze te regelen.

## 3. Planning

Pilot A (2.1) laat ruim twee weken voor fase 1 én fase 2, met reviews, plus punt 2.7. Dat lukt alleen als er
onderweg niets tegenvalt. Daarom stap A en B tegelijk met de voorbereiding van de pilot:

| Wat | Streefdatum |
|---|---|
| Stap A en B (met review); kosten, domein en Pro-project geregeld | zondag 1 november |
| Stap C, D en E | woensdag 4 november |
| Stap F en afname fase 1 | zaterdag 7 november |
| **Beslismoment: haalt fase 2 de 13e?** Zo niet, dan pilot B en de opdrachtgever laten weten | vrijdag 6 november (voorstel) |
| Fase 2 en de pilotcheck | woensdag 11 november |
| Pilot | 14–22 november |

Dit is een schatting, geen afspraak. Fase 3 (afmelden en ruilen) moet daarna nog vóór 10 januari 2027 (V8 13.3).

## 4. Risico's

| Risico | Wat dan |
|---|---|
| MFA in de Worker (Supabase `aal2` in de middleware) werkt anders dan lokaal | Vroeg bouwen (stap D vóór de beheerschermen) en meteen online proberen, zoals de proefroutes |
| Het datamodel blijkt in fase 2 of 3 niet te passen | Daarom stap B op papier, met review, vóór de eerste migratie; de testgevallen uit V8 12 lopen langs |
| Ontwerpgaten houden de schermen op | Beslissing 2.5; zonder wireframe geen scherm (V8 12, 14.3) |
| Rekentijd boven de 10 ms van het gratis plan | Nu al zo, zonder fouten (`Bouwbesluiten` 3.1). Bij de eerste fout: betaald plan |
| Echte gegevens in de ontwikkeldatabase | Nooit: alleen de seed met verzonnen leden (`Bouwbesluiten` 4.3) |
