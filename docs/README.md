# Over deze documenten

## Waar is de bron?

Er zijn twee soorten documenten, met elk een eigen bron. Wijzig een document alleen op zijn bron; anders gaat
de wijziging bij de volgende kopie verloren of lopen de versies uit elkaar.

| Documenten | Bron | Hoe wijzigen |
|---|---|---|
| **Technische afspraken:** `CLAUDE.md`, `SECURITY.md`, `README.md`, `docs/bouw/` (bouwbesluiten, fase-0-plan, ontwerpoverdracht), `docs/licenties.md`, dit bestand | **Deze repository** (sinds 27-10-2026) | Hier, via een branch en een pull request |
| **Ontwerpdocumenten:** `docs/ux-flows/` (use cases, UX-flows, wireframes), `docs/visueel/stijl.css` en `docs/visueel/INDEX.md`, de bouwgids en het FO (`.docx`) | De ontwerpmap van de bouwer. Die is niet openbaar: er staan gelicentieerde iconen, foto's en correspondentie in | Daar wijzigen; daarna met het kopieerscript uit de ontwerpmap een opgeschoonde kopie naar deze repository zetten, in een pull request. Niet hier met de hand wijzigen |

De opgeschoonde kopieën hebben persoonsnamen vervangen door rollen ("de opdrachtgever", "de bouwer").

De volgende bouwgids (V9) wordt markdown in deze repository; dan is de repository ook daarvoor de bron.

## Verwijzingen naar bestanden die hier niet staan

Verwijzingen naar bestanden die hier **niet** staan, wijzen naar de ontwerpmap en zijn in deze repository niet te
openen:

- `bouw.py`, `maak_artifact.py`, `maak_uitrol.py`: scripts waarmee de visuele schermen zijn gegenereerd;
- `code.txt`: een verouderde beschrijving van het designsysteem (`docs/visueel/stijl.css` en
  `docs/visueel/INDEX.md` gaan voor);
- `docs/versies/`, `docs/design/`, `docs/uitrol/`, `docs/communicatie/`, `prototype.html`: eerdere versies,
  ontwerpproeven, uitrolpakketten en correspondentie;
- `docs/visueel/afbeeldingen/` en `docs/visueel/iconen/`: foto's en iconen met een licentie die openbaar
  delen niet toestaat (bouwgids 14.7; zie `docs/licenties.md`).

## Volgorde bij tegenspraak

Eerst `docs/bouw/Bouwbesluiten-2026-10-27.md`, dan de bouwgids, dan het FO. Meld het verschil in plaats van zelf
te kiezen.
