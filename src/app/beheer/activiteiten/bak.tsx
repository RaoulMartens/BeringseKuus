'use client';

// De kaart Bak op het activiteitscherm (BA-8, R23; wireframe admin-activiteit-bewerken, kaart Bak): een schakelaar "Bak bijhouden bij
// deze activiteit" en, als hij aan staat, de plekken in de bak per kopje (prins en adjudant, vorst, Raad van Elf) met bij elke
// plek een keuzelijst met leden. Vooraf gevuld met de Raad van Elf. Alleen de beheerder wijzigt de bak; leden zien hem als lijst.
//
// Wat hier verandert gaat pas bij Opslaan door, samen met de rest van het scherm (alles of niets): de kaart zet de bak als tekst in
// een verborgen veld (`bak`), en de database controleert alles opnieuw (activiteit_opslaan_met_bak).

import { useState } from 'react';

import { Kaart } from '@/components/kaart/kaart';
import { Knop } from '@/components/knop/knop';
import { BAK_GROEPEN, BAK_PLEKNAAM, bakNaarTekst, beginBak, plekkenVan, type BakPlek } from '@/lib/bak';

import stijl from './bak.module.css';

export interface BakLid {
  id: string;
  naam: string;
}

interface Eigenschappen {
  begin: { actief: boolean; plekken: BakPlek[] };
  /** De leden van de Raad van Elf: daarmee wordt de bak gevuld als de beheerder hem aanzet. */
  raadsleden: string[];
  /** Wie er in een keuzelijst kan staan: leden van de vereniging (een externe helper kan niet in de bak). */
  leden: BakLid[];
  fout?: string;
}

export function Bak({ begin, raadsleden, leden, fout }: Eigenschappen) {
  const [actief, setActief] = useState(begin.actief);
  const [plekken, setPlekken] = useState<BakPlek[]>(begin.plekken);
  // Een plek zonder slot is nieuw; haal je hem weg, dan verdwijnt hij uit de lijst. Een plek mét slot gaat bij Opslaan weg.
  const [teller, setTeller] = useState(0);

  function zetAan(aan: boolean) {
    setActief(aan);
    // De eerste keer aanzetten: vooraf gevuld met de Raad van Elf. Wat er al stond blijft staan.
    if (aan && plekken.length === 0) setPlekken(beginBak(raadsleden));
  }

  function kies(index: number, bezetterId: string) {
    setPlekken((huidig) =>
      huidig.map((plek, i) =>
        i === index ? { ...plek, bezetterId: bezetterId === '' ? null : bezetterId } : plek,
      ),
    );
  }

  function haalWeg(index: number) {
    setPlekken((huidig) => huidig.filter((_, i) => i !== index));
  }

  function voegRaadslidToe() {
    setPlekken((huidig) => [
      ...huidig,
      { slotId: null, label: 'raadslid', bezetterId: null, verwacht: null },
    ]);
    setTeller((n) => n + 1);
  }

  return (
    <Kaart
      titel="Bak"
      ondertitel="Voor activiteiten waar mensen in de bak zitten, zoals de Bonte Avond. Alleen jij wijzigt de bak; leden zien wie erin zit."
    >
      <input type="hidden" name="bak" value={bakNaarTekst(actief, plekken)} />
      <div className={stijl.bak}>
        <label className={stijl.schakelaar}>
          <input type="checkbox" checked={actief} onChange={(e) => zetAan(e.target.checked)} />
          <span>Bak bijhouden bij deze activiteit</span>
        </label>
        {fout && (
          <p role="alert" className={stijl.fout}>
            {fout}
          </p>
        )}

        {actief && (
          <>
            <p className={stijl.uitleg}>
              Vooraf gevuld met de Raad van Elf. Kies bij elke plek wie erin zit; een plek zonder naam blijft
              leeg en is voor leden niet te zien.
            </p>
            {BAK_GROEPEN.map((groep) => {
              const eigen = plekkenVan(plekken, groep.labels);
              return (
                <div key={groep.titel} className={stijl.groep}>
                  <h3 className={stijl.kop}>{groep.titel}</h3>
                  {eigen.map((plek) => {
                    const index = plekken.indexOf(plek);
                    const id = `bak-plek-${index}-${teller}`;
                    return (
                      <div key={`${plek.slotId ?? 'nieuw'}-${index}`} className={stijl.rij}>
                        <label htmlFor={id} className={stijl.label}>
                          {BAK_PLEKNAAM[plek.label]}
                        </label>
                        <select
                          id={id}
                          className={stijl.select}
                          value={plek.bezetterId ?? ''}
                          onChange={(e) => kies(index, e.target.value)}
                        >
                          <option value="">Niemand</option>
                          {leden.map((lid) => (
                            <option key={lid.id} value={lid.id}>
                              {lid.naam}
                            </option>
                          ))}
                        </select>
                        {plek.label === 'raadslid' && (
                          <Knop soort="tekst" onClick={() => haalWeg(index)}>
                            Plek weghalen
                          </Knop>
                        )}
                      </div>
                    );
                  })}
                  {groep.labels.includes('raadslid') && (
                    <div>
                      <Knop soort="tekst" onClick={voegRaadslidToe}>
                        + plek erbij
                      </Knop>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </Kaart>
  );
}
