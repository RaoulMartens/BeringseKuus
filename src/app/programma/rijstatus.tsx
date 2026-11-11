// Het label van een rij in het programma ("Concept", "Geannuleerd"). Een gepubliceerde activiteit heeft er geen. Op een groot
// scherm staat het rechts van de tekst, op een telefoon eronder (zie .rijInhoud in programma.module.css).

import { Statuslabel } from '@/components/statuslabel/statuslabel';
import type { ActiviteitStatus } from '@/lib/programma';

export function Rijstatus({ status }: { status: ActiviteitStatus }) {
  if (status === 'concept')
    return (
      <Statuslabel status="concept" compactOpTelefoon>
        Concept
      </Statuslabel>
    );
  if (status === 'geannuleerd')
    return (
      <Statuslabel status="geannuleerd" compactOpTelefoon>
        Geannuleerd
      </Statuslabel>
    );
  return null;
}
