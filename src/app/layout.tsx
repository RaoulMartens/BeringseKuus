import './globals.css';

import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Ledenplatform',
  description: 'Ledenplatform voor een carnavalsvereniging (in aanbouw).',
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Elke pagina wordt per aanvraag gemaakt: alleen dan krijgen de scripts de nonce uit de CSP (src/middleware.ts).
  await connection();
  return (
    <html lang="nl">
      <body>
        <header>
          <nav aria-label="Hoofdmenu">
            <Link href="/">Ledenplatform</Link> · <Link href="/inloggen">Inloggen</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
