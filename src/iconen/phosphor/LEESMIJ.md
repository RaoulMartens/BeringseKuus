# Iconen: Phosphor Icons

De iconen van de app komen uit [Phosphor Icons](https://phosphoricons.com), licentie MIT (`LICENSE.txt` in deze map).
Besluit 30-10-2026: een open set in plaats van de Central-iconen (die niet in een publieke repository mogen,
`Fase-1-plan.md` 2.3 en 2.8).

- **Bron:** `github.com/phosphor-icons/core`, map `assets`, commit `2b75f3ad12b420c9504ef05df8d2564a28f8500e`. Alleen de gebruikte iconen staan hier, niet de
  hele set (bouwgids 14.7): `regular/` (lijn 1,5 px, zoals het ontwerp) en `bold/` voor de iconen naast vette tekst.
- **Gebruik:** niet rechtstreeks. `scripts/maak-iconen.ts` maakt er `src/components/icoon/data.ts` van en de app toont ze
  met het onderdeel `Icoon` (`src/components/icoon/icoon.tsx`). Een bestand dat meer bevat dan één of meer `<path>`'s wordt
  geweigerd.
- **Een icoon erbij of wisselen:** zet het bestand onder zijn Phosphor-naam in `regular/` (en `bold/`), zet de Nederlandse
  naam in `ICONEN` in het script, draai `node scripts/maak-iconen.ts`, en voeg het toe aan niets anders: de test controleert
  dat elk bestand wordt gebruikt en elk gebruikt icoon zijn bestand heeft.
