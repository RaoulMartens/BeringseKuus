// Het kopvlak (docs/visueel/stijl.css, sectie 4 en 13f): een gekleurd vlak met de titel van het scherm. Dit is de <h1>:
// elke pagina heeft er precies één. De kleuren en het verloop komen uit het thema; titel en datum staan links, een actie
// (bijvoorbeeld "Terug") rechts.
//
// De confetti is de WebGL-versie van het ontwerp (Kopconfetti, een canvas achter de tekst); zonder WebGL blijft de simpele
// CSS-confetti staan, precies wat het ontwerp als terugval noemt. Het is versiering en voor schermlezers verborgen.

import type { ReactNode } from 'react';

import { Kopconfetti } from './kopconfetti';
import stijl from './kopvlak.module.css';

interface Eigenschappen {
  titel: string;
  /** Een kleine regel boven de titel, bijvoorbeeld de dag ("Vrijdag 22 januari"). */
  datum?: string;
  /** De grote begroeting op het welkomscherm; het kopvlak blijft even hoog. */
  groot?: boolean;
  /** Een actie rechts in het vlak, bijvoorbeeld een link. */
  children?: ReactNode;
}

export function Kopvlak({ titel, datum, groot, children }: Eigenschappen) {
  return (
    <div className={stijl.kop}>
      <Kopconfetti />
      <div className={stijl.tekst}>
        {datum && <p className={stijl.datum}>{datum}</p>}
        <h1 className={groot ? stijl.titelGroot : stijl.titel}>{titel}</h1>
      </div>
      {children && <div className={stijl.actie}>{children}</div>}
    </div>
  );
}
