import type { ReactNode } from 'react';

import { NieuwLidProvider } from './nieuwlidstaat';

/** Het formulier en de bevestigingspagina van "Nieuw lid" delen wat er is ingevuld (nieuwlidstaat.tsx). */
export default function NieuwLidLayout({ children }: { children: ReactNode }) {
  return <NieuwLidProvider>{children}</NieuwLidProvider>;
}
