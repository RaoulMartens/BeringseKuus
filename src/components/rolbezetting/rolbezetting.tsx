// De rolbezetting zoals een lid die ziet (docs/visueel/stijl.css, sectie 8, `.wf-rolblok`): de rol één keer, de namen
// eronder. Lege plekken zijn voor een lid onzichtbaar (R13), dus er staan alleen namen. Alleen de eindverantwoordelijke
// heeft een telefoonnummer (R10). Jezelf herken je aan "(jij)" en een vetter lettertype, niet alleen aan kleur.

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Icoon, type IcoonNaam } from '@/components/icoon/icoon';
import type { Rolgroep } from '@/lib/ledenactiviteit';

import stijl from './rolbezetting.module.css';

const ICOON: Partial<Record<string, IcoonNaam>> = {
  eindverantwoordelijke: 'rol-eindverantwoordelijke',
  bob: 'rol-bob',
  werker: 'rol-werker',
  drankhaler: 'rol-drankhaler',
  fotograaf: 'rol-fotograaf',
  tapper: 'rol-tapper',
  buffet: 'rol-buffet',
  ober: 'rol-ober',
  bonnenkassa: 'rol-bonnenkassa',
};

/** Het icoon van een rol. Een rol die hier niet staat (een eigen rol) is werk: het icoon van de werker. */
export function rolIcoon(rol: string): IcoonNaam {
  return ICOON[rol] ?? 'rol-werker';
}

interface Eigenschappen {
  groepen: Rolgroep[];
  /** Het telefoonnummer van de eindverantwoordelijke, als een lid dat mag zien. */
  telefoon: string | null;
  /** De activiteit waar de bezetting bij hoort: de naam van het onderdeel voor een schermlezer, want twee activiteiten op één dag hebben elk een rolbezetting. */
  activiteit: string;
  /** Zegt dat de indeling nog niet is gemaakt (UC-001 AF-7). */
  onderaan?: ReactNode;
  /** De kop van de kaart; "Bak" voor de bak (BA-8), die dezelfde opmaak heeft maar geen diensten bevat. */
  titel?: string;
  /** Voor het bestuur: waar "Neem over" achter de naam van een ander naartoe gaat (een dienst overnemen). Zonder is er geen link. */
  overnemen?: (lidId: string) => string;
  /** Zonder icoon bij de kopjes: de kopjes van de bak (prins en adjudant, vorst, Raad van Elf) zijn geen diensten. */
  zonderIcoon?: boolean;
}

export function Rolbezetting({
  groepen,
  telefoon,
  activiteit,
  onderaan,
  titel = 'Rolbezetting',
  zonderIcoon = false,
  overnemen,
}: Eigenschappen) {
  return (
    <section className={stijl.kaart} aria-label={`${titel} ${activiteit}`}>
      <h2 className={stijl.titel}>{titel}</h2>
      <div className={stijl.groepen}>
        {groepen.map((groep) => {
          const icoon = zonderIcoon ? null : rolIcoon(groep.rol);
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
                    {overnemen && !naam.jij && groep.rol !== 'eindverantwoordelijke' && (
                      <Link
                        href={overnemen(naam.lidId)}
                        className={stijl.overnemen}
                        aria-label={`Neem de dienst van ${naam.naam} over`}
                      >
                        Neem over
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
