import type { Metadata } from 'next';

import { eisBeheer } from '@/lib/beheer';

export const metadata: Metadata = { title: 'Beheer – Ledenplatform' };

// Tijdelijk: de beheerschermen komen in fase 2. Deze pagina bestaat nu om te bewijzen dat de toegang werkt (stap D).
export default async function Beheer() {
  await eisBeheer();
  return (
    <main>
      <h1>Beheer</h1>
      <p>Je bent ingelogd als beheerder.</p>
    </main>
  );
}
