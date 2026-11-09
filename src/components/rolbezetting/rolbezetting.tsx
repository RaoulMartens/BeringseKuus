// De rolbezetting zoals een lid die ziet (docs/visueel/stijl.css, sectie 8, `.wf-rolblok`): de rol één keer, de namen
// eronder. Lege plekken zijn voor een lid onzichtbaar (R13), dus er staan alleen namen. Alleen de eindverantwoordelijke
// heeft een telefoonnummer (R10). Jezelf herken je aan "(jij)" en een vetter lettertype, niet alleen aan kleur.

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Icoon, type IcoonNaam } from '@/components/icoon/icoon';
import type { Rolgroep } from '@/lib/ledenactiviteit';

import stijl from './rolbezetting.module.css';

const ICOON: Record<string, IcoonNaam> = {
  eindverantwoordelijke: 'rol-eindverantwoordelijke',
  bob: 'rol-bob',
  werker: 'rol-werker',
  drankhaler: 'rol-drankhaler',
  fotograaf: 'rol-fotograaf',
};

interface Eigenschappen {
  groepen: Rolgroep[];
  /** Het telefoonnummer van de eindverantwoordelijke, als een lid dat mag zien. */
  telefoon: string | null;
  /** De activiteit waar de bezetting bij hoort: de naam van het onderdeel voor een schermlezer, want twee activiteiten op één dag hebben elk een rolbezetting. */
  activiteit: string;
  /** Zegt dat de indeling nog niet is gemaakt (UC-001 AF-7). */
  onderaan?: ReactNode;
  /** Een link op je eigen rij, bijvoorbeeld "Al je diensten" naar Mijn diensten (UC-007). Alleen als je zelf in de lijst staat. */
  eigenLink?: { href: string; tekst: string };
}

export function Rolbezetting({ groepen, telefoon, activiteit, onderaan, eigenLink }: Eigenschappen) {
  return (
    <section className={stijl.kaart} aria-label={`Rolbezetting ${activiteit}`}>
      <h2 className={stijl.titel}>Rolbezetting</h2>
      <div className={stijl.groepen}>
        {groepen.map((groep) => {
          // Tapper, buffet, ober, bonnenkassa en een eigen rol zijn allemaal werk: het icoon van de werker.
          const icoon = ICOON[groep.rol] ?? 'rol-werker';
          return (
            <div key={groep.rol} className={stijl.blok}>
              <span className={stijl.rol}>
                {icoon && <Icoon naam={icoon} className={stijl.rolIcoon} />}
                {groep.label}
              </span>
              <ul className={stijl.namen}>
                {groep.namen.map((naam) => (
                  <li key={naam.lidId} className={stijl.naam}>
                    {naam.jij ? <strong>{naam.naam} (jij)</strong> : <span>{naam.naam}</span>}
                    {naam.jij && eigenLink && (
                      <Link href={eigenLink.href} className={stijl.eigenLink}>
                        {eigenLink.tekst}
                      </Link>
                    )}
                    {groep.rol === 'eindverantwoordelijke' && telefoon && (
                      <span className={stijl.telefoon}>
                        <Icoon naam="telefoon" className={stijl.telefoonIcoon} />
                        <a href={`tel:${telefoon.replace(/[^+\d]/g, '')}`}>{telefoon}</a>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {onderaan && <p className={stijl.onderaan}>{onderaan}</p>}
    </section>
  );
}
