// Het paneel "Jouw status" (docs/visueel, `.wf-status-zin`): wat er over jou bij de activiteit staat, op één plek in de
// zijkolom. Bij twee activiteiten op één dag staat er per activiteit een regel (UC-001 AF-8). Afmelden en je dienst
// overdragen komen in fase 3; tot dan staat hier alleen wat jij bent, en voor het bestuur de link naar beheer.

import Link from 'next/link';
import { useId } from 'react';

import { Icoon } from '@/components/icoon/icoon';

import stijl from './jouwstatus.module.css';

export interface StatusRegel {
  id: string;
  naam: string;
  soort: 'aanwezig' | 'afgemeld';
  tekst: string;
  /** Voor het bestuur: waar de activiteit te beheren is. */
  beheerHref?: string;
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
