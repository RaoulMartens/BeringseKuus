import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Alleen voor het bestuur – Ledenplatform' };

// Een lid zonder beheerrechten dat een beheerpagina opent (wireframe alleen-bestuur).
export default function GeenToegang() {
  return (
    <main>
      <h1>Dit is alleen voor het bestuur</h1>
      <p>Beheer is bedoeld voor bestuursleden</p>
      <p>
        Alles wat een lid doet kan wel: het programma bekijken, je dienst ruilen en je afmelden. Denk je dat
        je hier toch bij hoort? Vraag het aan het bestuur.
      </p>
      <p>
        <Link href="/">Naar start</Link>
      </p>
    </main>
  );
}
