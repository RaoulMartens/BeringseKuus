# Licenties en bronnen

Alles wat in de repository of in de app staat heeft een bekende licentie (bouwgids 14.7). Een bestand zonder
vermelding hieronder komt niet in de hoofdcode; `scripts/controleer-repo.ts` faalt erop.

**Hoe vermelden.** Eén rij per bestand, met het pad zoals het in de repository staat (met `/`). Alle vier de
velden achter het bestand zijn verplicht: bron, licentie, licentiehouder en wie toestemming gaf. Past een veld
niet, schrijf dan `n.v.t.`; een leeg veld, `tbd`, `onbekend` of `?` telt als niet ingevuld. Een map
(`public/fonts/`) of patroon (`public/fonts/*.woff2`) mag als alle bestanden daarin dezelfde bron en licentie
hebben. De controle geldt voor afbeeldingen (ook svg-iconen), lettertypen, pdf, audio en video, en
spreadsheets of csv.

| Bestand of onderdeel | Soort | Bron | Licentie | Licentiehouder | Toestemming gegeven door |
|---|---|---|---|---|---|
| `public/fonts/Libron-*.woff2` | lettertype (titels) | github.com/nicoverbruggen/libron, release v0.32 (`Libron_Web.zip`), ongewijzigd | SIL Open Font License 1.1 (`public/fonts/LICENSE-Libron.txt`) | Nico Verbruggen (afgeleid van Newsreader, The Newsreader Project Authors) | n.v.t. (open licentie) |
| `public/fonts/Nunito-latin-variabel.woff2` | lettertype (tekst) | npm `@fontsource-variable/nunito` 5.3.0 (github.com/googlefonts/nunito), de Latijnse set | SIL Open Font License 1.1 (`public/fonts/LICENSE-Nunito.txt`) | The Nunito Project Authors | n.v.t. (open licentie) |
| `src/iconen/phosphor/regular/*.svg` | iconen | github.com/phosphor-icons/core, map `assets`, commit `2b75f3a` | MIT (`src/iconen/phosphor/LICENSE.txt`) | Phosphor Icons | n.v.t. (open licentie) |
| `src/iconen/phosphor/bold/*.svg` | iconen | github.com/phosphor-icons/core, map `assets`, commit `2b75f3a` | MIT (`src/iconen/phosphor/LICENSE.txt`) | Phosphor Icons | n.v.t. (open licentie) |

Niet in deze repository, bewust: de Central-iconen (licentie Iconists, vervangen door Phosphor, besluit 30-10-2026), foto's van de website van de
vereniging, het Excel-sjabloon met testgegevens.
