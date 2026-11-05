// De wisselaar bovenaan het programma (UC-007): "Alle activiteiten" of "Mijn diensten", met hoeveel er komen. Het is dezelfde
// lijst anders gefilterd, dus een wisselaar en geen vierde item in de bovenbalk (ontwerpkeuze UC-007). Het is de component Tellers:
// de tegel van het gekozen filter heeft een ring, en een klik erop gaat terug naar alles (zelfde patroon als de tellers in beheer).

import { Tellers } from '@/components/tellers/tellers';

export function Programmawisselaar({
  aantalActiviteiten,
  aantalDiensten,
  actief,
}: {
  aantalActiviteiten: number;
  aantalDiensten: number;
  actief: 'alles' | 'mijn';
}) {
  return (
    <Tellers
      naam="Wat toont het programma"
      tellers={[
        {
          href: '/programma',
          aantal: aantalActiviteiten,
          label: 'komende activiteiten',
          actief: actief === 'alles',
        },
        {
          href: actief === 'mijn' ? '/programma' : '/programma/mijn',
          aantal: aantalDiensten,
          label: 'komende diensten',
          actief: actief === 'mijn',
        },
      ]}
    />
  );
}
