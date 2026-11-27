'use client';

// De staat van "Nieuw lid" (UC-013 AF-4, wireframes admin-lid-nieuw en admin-lid-nieuw-bevestigen): het formulier en de bevestigingspagina zijn twee
// pagina's, maar delen wat er is ingevuld. Die staat staat in een layout om beide heen, zodat hij blijft staan als je van de ene naar de andere gaat
// (en terug via Annuleren). Er gaat niets naar de server tot "Toevoegen en uitnodigen" op de bevestigingspagina.

import { createContext, useActionState, useContext, useState, type ReactNode } from 'react';

import { voegLidToe, type LedenStaat } from '../acties';

export interface Waarden {
  voornaam: string;
  achternaam: string;
  email: string;
  telefoon: string;
  groepen: string[];
  aanmerkingen: string[];
}

const LEEG: Waarden = {
  voornaam: '',
  achternaam: '',
  email: '',
  telefoon: '',
  groepen: [],
  aanmerkingen: [],
};
const START: LedenStaat = { melding: null };

interface Kader {
  waarden: Waarden;
  zet: (deel: Partial<Waarden>) => void;
  /** Wat er nog nodig is, in woorden: leeg als het lid kan worden toegevoegd. */
  nodig: string[];
  staat: LedenStaat;
  voerUit: (formulier: FormData) => void;
  bezig: boolean;
}

const Staat = createContext<Kader | null>(null);

/** Genoeg om het scherm te laten kiezen tussen "nog niet compleet" en "klaar": een echte controle doet de database. */
function lijktOpAdres(tekst: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tekst.trim());
}

export function bepaalNodig(w: Waarden): string[] {
  return [
    ...(w.voornaam.trim() === '' ? ['voornaam'] : []),
    ...(w.achternaam.trim() === '' ? ['achternaam'] : []),
    ...(lijktOpAdres(w.email) ? [] : ['e-mailadres']),
    ...(w.groepen.length === 0 ? ['een groep'] : []),
  ];
}

export function NieuwLidProvider({ children }: { children: ReactNode }) {
  const [waarden, setWaarden] = useState<Waarden>(LEEG);
  const [staat, voerUit, bezig] = useActionState<LedenStaat, FormData>(voegLidToe, START);
  const kader: Kader = {
    waarden,
    zet: (deel) => setWaarden((vorige) => ({ ...vorige, ...deel })),
    nodig: bepaalNodig(waarden),
    staat,
    voerUit,
    bezig,
  };
  return <Staat.Provider value={kader}>{children}</Staat.Provider>;
}

export function useNieuwLid(): Kader {
  const kader = useContext(Staat);
  if (!kader) throw new Error('NieuwLidProvider ontbreekt: gebruik de layout van Nieuw lid.');
  return kader;
}
