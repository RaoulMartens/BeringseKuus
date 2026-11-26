'use client';

// De lijst met leden en het zoekveld erboven. Zoeken filtert op naam terwijl je typt, zonder de pagina te herladen; de lijst zelf komt van de
// server (leden_beheer_lijst), dit is alleen het filter. Elke regel is een link naar het lid.

import { useState } from 'react';

import { Kaart } from '@/components/kaart/kaart';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import { initialen } from '@/lib/wiekomter';

import stijl from './leden.module.css';

export interface Ledenregel {
  lidId: string;
  voornaam: string;
  achternaam: string;
  naam: string;
  /** De regel onder de naam: de groepen, of sinds wanneer het lid inactief is. */
  onder: string;
  /** Waar de regel naartoe gaat. */
  href: string;
}

export function Ledenzoeker({ titel, leden }: { titel: string; leden: Ledenregel[] }) {
  const [zoek, setZoek] = useState('');
  const gezocht = zoek.trim().toLowerCase();
  const zichtbaar = gezocht ? leden.filter((l) => l.naam.toLowerCase().includes(gezocht)) : leden;

  return (
    <Kaart titel={titel}>
      <label className={stijl.onder} htmlFor="zoek-lid">
        Zoek een lid
      </label>
      <input
        id="zoek-lid"
        type="search"
        className={stijl.zoek}
        autoComplete="off"
        value={zoek}
        onChange={(e) => setZoek(e.target.value)}
      />
      {zichtbaar.length === 0 ? (
        <p className={stijl.leeg}>Geen lid gevonden.</p>
      ) : (
        <Lijst>
          {zichtbaar.map((lid) => (
            <Lijstrij key={lid.lidId} href={lid.href}>
              <span className={stijl.rij}>
                <span className={stijl.bol} aria-hidden="true">
                  {initialen(lid.voornaam, lid.achternaam)}
                </span>
                <span className={stijl.tekst}>
                  <strong className={stijl.naam}>{lid.naam}</strong>
                  <span className={stijl.onder}>{lid.onder}</span>
                </span>
              </span>
            </Lijstrij>
          ))}
        </Lijst>
      )}
    </Kaart>
  );
}
