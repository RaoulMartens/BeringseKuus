// Het paneel "Jouw status" (docs/visueel, `.wf-status-zin`): wat er over jou bij de activiteit staat, op één plek in de
// zijkolom. Bij twee activiteiten op één dag staat er per activiteit een regel (UC-001 AF-8). Hier staan ook de knoppen
// Afmelden (naar de bevestigingspagina) en Afmelding intrekken (direct, het kan terug), en voor het bestuur de link naar
// beheer; met een dienst die een lid zelf kan overdragen ook Dienst overdragen. Welke knop er staat, beslist maakAanbod in src/lib/afmelden.ts.

import Link from 'next/link';
import { useId } from 'react';

import { Icoon } from '@/components/icoon/icoon';
import { Knop } from '@/components/knop/knop';
import type { AfmeldActie } from '@/lib/afmelden';

import { Intrekformulier } from './intrekformulier';
import stijl from './jouwstatus.module.css';

export interface StatusRegel {
  id: string;
  naam: string;
  soort: 'aanwezig' | 'afgemeld';
  tekst: string;
  /** Voor het bestuur: waar de activiteit te beheren is. */
  beheerHref?: string;
  /** Waar Afmelden heen gaat; leeg als het lid zich hier niet kan afmelden. */
  afmeldHref?: string;
  /** Waar Dienst overdragen heen gaat; alleen met een dienst die het lid zelf kan overdragen. */
  overdragenHref?: string;
  /** De serveractie voor Afmelding intrekken; leeg als er niets in te trekken valt. */
  intrekActie?: AfmeldActie;
  /** Een korte uitleg als er geen knop is terwijl een lid er een zou verwachten (BOB, een dienst). */
  hulp?: string;
}

export function Jouwstatus({ regels }: { regels: StatusRegel[] }) {
  const meerdere = regels.length > 1;
  // Het paneel staat twee keer in de pagina (een telefoon toont de bovenste, een groot scherm de zijkolom): elk een eigen id.
  const kopId = useId();
  return (
    <section className={stijl.kaart} aria-labelledby={kopId}>
      <h2 id={kopId} className={stijl.kop}>
        Jouw status
      </h2>
      <ul className={stijl.regels}>
        {regels.map((regel) => (
          <li key={regel.id} className={stijl.regel}>
            <p
              className={[stijl.zin, regel.soort === 'afgemeld' ? stijl.afgemeld : stijl.aanwezig].join(' ')}
            >
              <Icoon naam={regel.soort === 'afgemeld' ? 'info' : 'succes'} className={stijl.icoon} />
              <span>
                {meerdere && <strong>{regel.naam} — </strong>}
                {regel.tekst}
              </span>
            </p>
            {regel.hulp && <p className={stijl.hulp}>{regel.hulp}</p>}
            {regel.afmeldHref && (
              <div className={stijl.knop}>
                <Knop href={regel.afmeldHref} soort="secundair" vol>
                  {meerdere ? `Afmelden voor ${regel.naam}` : 'Afmelden'}
                </Knop>
              </div>
            )}
            {regel.overdragenHref && (
              <>
                <p className={stijl.hulp}>Kun je wel komen, maar wil je alleen je dienst kwijt?</p>
                <div className={stijl.knop}>
                  <Knop href={regel.overdragenHref} soort="secundair" vol>
                    {meerdere ? `Dienst overdragen voor ${regel.naam}` : 'Dienst overdragen'}
                  </Knop>
                </div>
              </>
            )}
            {regel.intrekActie && (
              <div className={stijl.knop}>
                <Intrekformulier
                  activiteitId={regel.id}
                  actie={regel.intrekActie}
                  label={meerdere ? `Afmelding voor ${regel.naam} intrekken` : 'Afmelding intrekken'}
                />
              </div>
            )}
            {regel.beheerHref && (
              <Link href={regel.beheerHref} className={stijl.beheer}>
                {meerdere ? `${regel.naam} beheren` : 'Deze activiteit beheren'}
                <Icoon naam="pijl-rechts" />
              </Link>
            )}
          </li>
        ))}
      </ul>
      <p className={stijl.uitleg}>
        Iedereen staat standaard op aanwezig; alleen afmeldingen worden vastgelegd.
      </p>
    </section>
  );
}
