# Design-overdracht: van prototype naar code

Hoe het visuele ontwerp (`docs/visueel/`) in de gebouwde app komt. Dit stond niet in bouwgids V8.
Aanvulling bij `Bouwbesluiten-2026-10-27.md`; wordt bij fase 0 meegekopieerd naar de code-repository.

## 1. Wat is de bron

| Wat | Bron | Let op |
|---|---|---|
| Wat een scherm toont, teksten, foutcodes, gedrag | `docs/ux-flows/` (use-cases, wireframes) | Teksten letterlijk overnemen |
| Hoe het eruitziet: kleuren, lettertypes, maten, hoeken, toestanden | `docs/visueel/stijl.css` en `docs/visueel/INDEX.md` | **Dit is de waarheid** voor het uiterlijk |
| De schermen als beeld | `docs/visueel/*.html` | Referentie om naast te leggen, geen code om over te nemen |
| `code.txt` en de Figma-variabelen | alleen als achtergrond | **Verouderd** (snapshot 08-10-2026): zie hieronder |

**`code.txt` wijkt op deze punten af van de praktijk.** Bij verschil gelden `stijl.css` en `INDEX.md`:

- Titels: Libron (code.txt: Host Grotesk).
- Knoppen: kleur volgt de actie (groen, rood of wit); secondary alleen een rand (code.txt: primary donker neutraal).
- Hoeken: 6 / 14 / 20 / 28 px met squircle, 4 / 8 / 12 / 16 px als terugval (code.txt: 8 / 12 / 16).
- Kopvlak met verloop en confetti; bovenbalk in paginakleur; lijsten over de volle breedte; schakelaar voor de bak.

## 2. Wat de prototype-HTML níet is

De schermen in `docs/visueel/` zijn **gegenereerd** uit de wireframes door `bouw.py`. Gemeten op
`welkom.html`: 75 `div` en 66 `span`, en nul `button`, `h1`, `main` of `nav`. Een knop is een `div`
in een `a`. Dat botst met bouwgids 14.3 (echte elementen, landmarks, toetsenbord, axe nul overtredingen).

Daarom geldt: **de code neemt de HTML niet over, alleen het uiterlijk.** Bouw semantische componenten
die er met `stijl.css` hetzelfde uitzien. Wijkt het gedrag af (bijvoorbeeld een keuzelijst die met
Escape sluit), dan wint 14.3.

## 3. Aanpak

1. **Tokens uit `stijl.css`.** Haal kleuren, typografie, spacing, hoeken en schaduwen uit `stijl.css`
   naar één tokenbestand in de repo (CSS-variabelen). Geen kleur of maat hard in een component. Dit
   is ook de plek voor het thema per vereniging (primaire kleur, logo, naam, motto, groet).
2. **Componentenset vóór de schermen** (begin van fase 1). Bouw één keer: Knop (groen, rood, wit,
   secondary), Kaart, Kopvlak, Bovenbalk, Veld met label en foutmelding, Melding (info, succes,
   let-op, fout), Lijstrij, Tijdlijnkaartje (Verzamelen, Bus vertrekt, begint, afgelopen),
   Stappenbalk, Schakelaar, Keuzelijst met aankruisvakjes, Statuspaneel. Elk onderdeel in alle
   toestanden die `INDEX.md` noemt (hover, focus, uitgeschakeld, fout).
3. **Schermen bouwen met die componenten.** Per scherm: teksten uit de wireframe, uiterlijk via de
   componenten. Verzin geen eigen stijl; ontbreekt een onderdeel, voeg het toe aan de set en meld het.
4. **Lettertypes.** Libron (titels) en Nunito (rest) als bestanden in de repo, met de licentietekst
   (bouwgids 14.7). `docs/licenties.md` noemt de bron en de licentiehouder.
5. **Iconen.** Alleen de Central-iconen die de app gebruikt, niet de hele set (14.7).

## 4. Vergelijking als poortcontrole

Een scherm is pas klaar als het naast zijn visuele voorbeeld is gelegd:

- Playwright maakt van elk gebouwd scherm een screenshot op **1200 px** en **375 px**, in dezelfde
  toestand als het voorbeeld (de voorbeelddata staan in `CLAUDE.md` van de ontwerprepo).
- De bouwer legt die naast `docs/visueel/<scherm>.html` en beoordeelt. Bouwer en ontwerper zijn dezelfde
  persoon: laat de bevindingen daarom ook door de reviewer uit bouwgids hoofdstuk 11 lezen.
- Toegestane afwijkingen staan in het pull request, met reden. Standaardlijst:
  - squircle alleen in browsers die `corner-shape` ondersteunen, anders gewone afronding;
  - WebGL-confetti in het kopvlak: één gedeelde canvas, zonder WebGL een paar CSS-stippen;
  - semantische elementen in plaats van `div` (14.3), met hetzelfde uiterlijk.
- Pixelverschillen van een paar pixel door lettertypeweergave zijn geen afwijking.

Dit komt als extra punt in "Wanneer een fase af is" (14.6): *de schermen van de fase zijn vergeleken
met het visuele ontwerp op 1200 en 375 px; afwijkingen staan in het pull request.*

## 5. Wat het prototype nog niet beantwoordt

Uit `INDEX.md` ("Wat code.txt niet oplost" en "Wat nog niet gedaan is"). Bouw hier niet omheen, vraag van de bouwer:

- Laad-staat van knoppen, lege toestanden en foutstaten (UI Stack): niet ontworpen.
- Dark mode, motion: niet ontworpen.
- Icon-only-knoppen: randkleur niet beslist.
- Niet elk scherm is visueel nagelopen; reactie van de opdrachtgever op de visuele versie is er niet.
- De Android-agendaknop is niet op een echte Android getest.
- Toegankelijkheid: alleen kleurcombinaties zijn nagerekend; toetsenbord en schermlezer niet getest.

## 6. Rechten en licenties

De visuele map bevat de Central-iconen (licentie Iconists) en foto's van de website van de vereniging.
**De code-repository is publiek** (besluit 27-10-2026, `Bouwbesluiten` 3.3): `docs/visueel/` komt er dus
niet in, alleen `stijl.css` en de tokens (alleen CSS). Deel ook de ontwikkelomgeving niet zonder
wachtwoord. Zie bouwgids 14.7 en `docs/visueel/afbeeldingen/LEESMIJ.md`.

**Iconen.** De componentenset heeft iconen nodig, de Central-set mag niet in de publieke repo. Beslis vóór
fase 1: een open iconenset (het uiterlijk wijkt dan af van het ontwerp, een toegestane afwijking met
reden) of de Central-iconen buiten de repo houden en in de build binnenhalen. Tot dat besluit bouwt de
componentenset met een kleine, eigen wrapper voor iconen, zodat de bron later te wisselen is.

**De referentieschermen** voor de vergelijking (punt 4) staan in de stage-map, niet in de repo. De
Playwright-test in de repo vergelijkt daarom met screenshots die lokaal worden gemaakt uit de stage-map;
wat in de repo komt is alleen de lijst van schermen, toestanden en toegestane afwijkingen.
