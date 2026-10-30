import '@/styles/tokens.css';
import '@/styles/lettertypen.css';
import './globals.css';

import type { Metadata } from 'next';
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
      <body>{children}</body>
    </html>
  );
}
