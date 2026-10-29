import type { ReactNode } from 'react';

import { eisBeheer } from '@/lib/beheer';

// Een extra net onder elke pagina in beheer (review PR23-10). Een layout draait niet bij elke navigatie binnen beheer:
// de controle per pagina en per serveractie blijft nodig, en een test (beheer.test.ts) bewaakt dat ze er zijn.
export default async function BeheerLayout({ children }: Readonly<{ children: ReactNode }>) {
  await eisBeheer();
  return children;
}
