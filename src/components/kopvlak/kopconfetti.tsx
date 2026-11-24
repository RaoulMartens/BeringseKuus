'use client';

// De canvas met de confetti in het kopvlak (zie confetti.ts). Een klein onderdeel dat in de browser draait; het kopvlak zelf blijft
// een gewoon serveronderdeel. Het canvas staat achter de tekst en is voor een schermlezer verborgen. Heeft de browser geen WebGL, dan
// doet dit niets en blijft de CSS-confetti van het kopvlak staan.

import { useEffect, useRef } from 'react';

import { maakConfetti } from './confetti';
import stijl from './kopvlak.module.css';

export function Kopconfetti() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const kop = el?.parentElement;
    if (!el || !kop) return;
    // De tekst van het kopvlak staat direct na het canvas: daar dimt de confetti voor weg.
    const tekst = el.nextElementSibling instanceof HTMLElement ? el.nextElementSibling : null;
    const confetti = maakConfetti(el, kop, tekst);
    if (!confetti) return;

    kop.dataset.confetti = 'aan';
    const opnieuw = (): void => confetti.teken();
    const grootte = new ResizeObserver(opnieuw);
    grootte.observe(kop);
    // De breedte van de titel hangt van het lettertype af: opnieuw tekenen als de lettertypen er zijn.
    void document.fonts.ready.then(opnieuw);
    // Een ander thema (of andere kleuren) verandert de themakleuren: opnieuw lezen.
    const thema = new MutationObserver(opnieuw);
    thema.observe(document.documentElement, { attributes: true });

    return () => {
      grootte.disconnect();
      thema.disconnect();
      delete kop.dataset.confetti;
    };
  }, []);

  return <canvas ref={canvas} className={stijl.confetti} aria-hidden="true" />;
}
