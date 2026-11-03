'use client';

// De rolbezetting van een activiteit (UC-004 stap 6, "Rolbezetting op het activiteitscherm zelf"): per rol de plekken, bezet
// of leeg. De beheerder voegt lege plekken toe en haalt lege plekken weg; wie er op een plek staat, kiezen komt in de
// volgende stap. Er is geen getalveld: het aantal plekken is het aantal regels. Wat de beheerder wijzigt, blijft op het
// scherm staan tot Opslaan en gaat dan in één keer naar de server (activiteit_opslaan, BG 4.4): als formulierwaarden
// plek_toevoegen ("werker:n1") en plek_weghalen (het id van de plek).
//
// De eindverantwoordelijke is vast: precies één plek, geen kruisje en geen plus (R21).

import { useId, useState } from 'react';

import { Icoon } from '@/components/icoon/icoon';
import { Knop } from '@/components/knop/knop';
import type { ToevoegbareRol } from '@/lib/activiteitformulier';

import stijl from './plekken.module.css';

export interface BestaandePlek {
  id: string;
  rol: string;
  /** Wie er staat; leeg als de plek leeg is. */
  bezetter: string | null;
}

export interface Eindverantwoordelijke {
  /** Wie er staat; leeg als de plek nog leeg is of de activiteit nog niet bestaat. */
  naam: string | null;
  telefoon: string | null;
  /** De activiteit bestaat nog niet: de plek komt er bij het opslaan. */
  nieuw: boolean;
}

const ROLLEN: { rol: ToevoegbareRol; kop: string; toevoegen: string; enkelvoud: string }[] = [
  { rol: 'werker', kop: 'Werker', toevoegen: '+ werker-plek', enkelvoud: 'werker' },
  { rol: 'drankhaler', kop: 'Drankhaler', toevoegen: '+ drankhaler-plek', enkelvoud: 'drankhaler' },
  { rol: 'fotograaf', kop: 'Fotograaf', toevoegen: '+ fotograaf-plek', enkelvoud: 'fotograaf' },
  { rol: 'bob', kop: 'BOB', toevoegen: '+ BOB-plek', enkelvoud: 'BOB' },
];

interface Eigenschappen {
  bestaand: BestaandePlek[];
  /** Wat de beheerder al had gewijzigd (na een fout komt het terug): ids van weggehaalde plekken en nieuwe plekken als "rol:naam". */
  beginWeggehaald?: string[];
  beginToegevoegd?: string[];
  eindverantwoordelijke: Eindverantwoordelijke;
  /** Een fout bij de plekken, na het versturen. */
  fout?: string;
}

interface NieuwePlek {
  tijdelijk: string;
  rol: ToevoegbareRol;
}

/** De nieuwe plekken uit de formulierwaarden "werker:n1"; wat niet klopt, wordt overgeslagen (de server controleert ook). */
function leesNieuwePlekken(waarden: string[]): NieuwePlek[] {
  return waarden.flatMap((waarde) => {
    const [rol, tijdelijk] = waarde.split(':');
    const bekend = ROLLEN.find((r) => r.rol === rol);
    return bekend && tijdelijk ? [{ rol: bekend.rol, tijdelijk }] : [];
  });
}

export function Plekken({
  bestaand,
  beginWeggehaald = [],
  beginToegevoegd = [],
  eindverantwoordelijke,
  fout,
}: Eigenschappen) {
  const [weggehaald, zetWeggehaald] = useState<string[]>(beginWeggehaald);
  const [nieuw, zetNieuw] = useState<NieuwePlek[]>(() => leesNieuwePlekken(beginToegevoegd));
  const [teller, zetTeller] = useState(1);
  const basis = useId().replace(/[^A-Za-z0-9]/g, '');

  function voegToe(rol: ToevoegbareRol) {
    zetNieuw((vorige) => [...vorige, { tijdelijk: `n${basis}${teller}`, rol }]);
    zetTeller((vorige) => vorige + 1);
  }

  return (
    <div className={stijl.plekken}>
      <p className={stijl.uitleg}>
        Voeg plekken toe of haal lege plekken weg. Wie er op een plek staat, kies je in een volgende stap.
      </p>

      {ROLLEN.map(({ rol, kop, toevoegen, enkelvoud }) => {
        const vast = bestaand.filter((plek) => plek.rol === rol && !weggehaald.includes(plek.id));
        const toegevoegd = nieuw.filter((plek) => plek.rol === rol);
        const aantal = vast.length + toegevoegd.length;
        return (
          <section key={rol} aria-labelledby={`rol-${rol}`} className={stijl.rol}>
            <h3 id={`rol-${rol}`} className={stijl.rolkop}>
              {kop}
            </h3>
            {aantal > 0 && (
              <ul className={stijl.lijst}>
                {vast.map((plek, nummer) => (
                  <li key={plek.id} className={stijl.plek}>
                    {plek.bezetter ? (
                      <span className={stijl.naam}>{plek.bezetter}</span>
                    ) : (
                      <>
                        <span className={stijl.leeg}>Leeg</span>
                        <button
                          type="button"
                          className={stijl.weg}
                          aria-label={`Lege plek ${nummer + 1} van ${enkelvoud} weghalen`}
                          onClick={() => zetWeggehaald((vorige) => [...vorige, plek.id])}
                        >
                          <Icoon naam="kruis" />
                        </button>
                      </>
                    )}
                  </li>
                ))}
                {toegevoegd.map((plek, nummer) => (
                  <li key={plek.tijdelijk} className={stijl.plek}>
                    <span className={stijl.leeg}>Nieuwe plek, leeg</span>
                    <button
                      type="button"
                      className={stijl.weg}
                      aria-label={`Nieuwe plek ${nummer + 1} van ${enkelvoud} weghalen`}
                      onClick={() =>
                        zetNieuw((vorige) => vorige.filter((p) => p.tijdelijk !== plek.tijdelijk))
                      }
                    >
                      <Icoon naam="kruis" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Knop soort="tekst" onClick={() => voegToe(rol)}>
              {toevoegen}
            </Knop>
          </section>
        );
      })}

      <section aria-labelledby="rol-eindverantwoordelijke" className={stijl.rol}>
        <h3 id="rol-eindverantwoordelijke" className={stijl.rolkop}>
          Eindverantwoordelijke *
        </h3>
        <p className={stijl.vast}>
          {eindverantwoordelijke.nieuw ? (
            'Deze plek is er na het opslaan.'
          ) : eindverantwoordelijke.naam ? (
            <>
              {eindverantwoordelijke.naam}
              {eindverantwoordelijke.telefoon && ` — ${eindverantwoordelijke.telefoon}`}
            </>
          ) : (
            <span className={stijl.leeg}>Leeg</span>
          )}
        </p>
      </section>

      {weggehaald.map((id) => (
        <input key={id} type="hidden" name="plek_weghalen" value={id} />
      ))}
      {nieuw.map((plek) => (
        <input
          key={plek.tijdelijk}
          type="hidden"
          name="plek_toevoegen"
          value={`${plek.rol}:${plek.tijdelijk}`}
        />
      ))}
      {fout && (
        <p role="alert" className={stijl.fout}>
          {fout}
        </p>
      )}
    </div>
  );
}
