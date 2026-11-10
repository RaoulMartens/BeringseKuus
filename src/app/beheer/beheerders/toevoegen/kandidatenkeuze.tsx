'use client';

// De lijst waaruit je kiest wie beheerder wordt (wireframe admin-beheerder-kiezen, consistentieregel "Iemand kiezen"): een
// zoekveld en daaronder alleen wie je kunt kiezen. Wie al beheerder is of geen account heeft, staat er niet. Zonder
// JavaScript is het een gewone lijst met links, dus het zoekveld is er alleen voor wie in een lange lijst een naam zoekt.
// Wat kan en niet kan, beslist de database bij het maken (beheerder_maken).

import { useState } from 'react';

import { Kaart } from '@/components/kaart/kaart';
import { Lijst, Lijstrij } from '@/components/lijst/lijst';
import type { Kandidaat } from '@/lib/beheerders';

import stijl from '../beheerders.module.css';

export function Kandidatenkeuze({ kandidaten }: { kandidaten: Kandidaat[] }) {
  const [zoek, zetZoek] = useState('');
  const gezocht = zoek.trim().toLowerCase();
  const zichtbaar = kandidaten.filter((k) => gezocht === '' || k.naam.toLowerCase().includes(gezocht));

  return (
    <div className={stijl.keuze}>
      <label className={stijl.zoeklabel}>
        <span className={stijl.label}>Zoek op naam</span>
        <input
          type="search"
          className={stijl.zoek}
          value={zoek}
          onChange={(e) => zetZoek(e.target.value)}
          placeholder="Typ een naam…"
          autoComplete="off"
        />
      </label>
      <p className={stijl.telling} role="status">
        {gezocht === ''
          ? ''
          : zichtbaar.length === 0
            ? 'Niemand gevonden.'
            : `${zichtbaar.length} ${zichtbaar.length === 1 ? 'lid' : 'leden'} gevonden.`}
      </p>
      {zichtbaar.length > 0 && (
        <Kaart lijst>
          <Lijst zonderKop>
            {zichtbaar.map((k) => (
              <Lijstrij key={k.lidId} href={`/beheer/beheerders/toevoegen/${k.lidId}`}>
                <span className={stijl.regel}>
                  <strong className={stijl.naam}>{k.naam}</strong>
                </span>
              </Lijstrij>
            ))}
          </Lijst>
        </Kaart>
      )}
    </div>
  );
}
