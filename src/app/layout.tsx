import './globals.css';

import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Ledenplatform',
  description: 'Ledenplatform voor een carnavalsvereniging (in aanbouw).',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
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
