'use client';

// De lijst waaruit een lid kiest wie zijn dienst overneemt (UC-002 stap 3 en 4): leden die kunnen overnemen zijn te kiezen, de
// anderen staan er grijs bij met de reden. Het zoekveld is er voor wie in een lange lijst een naam zoekt; zonder JavaScript is
// het een gewone lijst met keuzerondjes die werkt met toetsenbord en schermlezer (fieldset en legenda). De lijst is
// voorlichting: wat kan en niet kan, beslist de database bij het bevestigen (ruil_dienst).

import { useState } from 'react';

import { redenTekst } from '@/lib/ruilen';

import stijl from './vervangerkeuze.module.css';

export interface Vervanger {
  id: string;
  naam: string;
  beschikbaar: boolean;
  /** 'afgemeld' of 'al_ingedeeld' als iemand niet te kiezen is. */
  reden: string | null;
}

export function Vervangerkeuze({
  vervangers,
  legenda = 'Kies wie je dienst overneemt',
}: {
  vervangers: Vervanger[];
  legenda?: string;
}) {
  const [zoek, zetZoek] = useState('');
  const gezocht = zoek.trim().toLowerCase();
  const zichtbaar = vervangers.filter((v) => gezocht === '' || v.naam.toLowerCase().includes(gezocht));

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
      <fieldset className={stijl.groep}>
        <legend className={stijl.legenda}>{legenda}</legend>
        <ul className={stijl.lijst}>
          {vervangers.map((v) => {
            const verborgen = !zichtbaar.includes(v);
            const redenId = `reden-${v.id}`;
            return (
              <li key={v.id} hidden={verborgen}>
                <label className={[stijl.optie, v.beschikbaar ? '' : stijl.uit].join(' ')}>
                  <input
                    type="radio"
                    name="vervanger"
                    value={v.id}
                    disabled={!v.beschikbaar}
                    // Alleen wat zichtbaar is mag verplicht zijn: een verborgen verplicht rondje houdt het formulier stil tegen (B5).
                    required={!verborgen}
                    aria-describedby={v.beschikbaar ? undefined : redenId}
                  />
                  <span className={stijl.naam}>{v.naam}</span>
                  {!v.beschikbaar && (
                    <span id={redenId} className={stijl.reden}>
                      {redenTekst(v.reden)}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
    </div>
  );
}
