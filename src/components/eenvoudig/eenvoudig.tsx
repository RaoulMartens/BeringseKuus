// De kale omlijsting van de pagina's die nog niet in het echte ontwerp zijn (inloggen, de MFA-schermen, de foutpagina's):
// een eenvoudige kop met twee links en wat ruimte. Zodra een scherm zijn eigen bovenbalk en kopvlak krijgt, verlaat het
// deze omlijsting. De omlijsting zit niet in de gedeelde lay-out, omdat een scherm in het ontwerp over de volle breedte
// loopt (bovenbalk en kopvlak) en geen kale kop erboven wil.

import Link from 'next/link';
import type { ReactNode } from 'react';

import stijl from './eenvoudig.module.css';

export function Eenvoudig({ children }: { children: ReactNode }) {
  return (
    <div className={stijl.kader}>
      <header>
        <nav aria-label="Hoofdmenu">
          <Link href="/">Ledenplatform</Link> · <Link href="/inloggen">Inloggen</Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
