// Een lijst met rijen (docs/visueel/stijl.css, sectie 9). Een rij is een gewone regel of, met een href, een link over de
// hele rij met een pijltje aan het eind: dat laat zien dat je erop kunt klikken. Een gemarkeerde rij is "jouw" rij (jouw
// afmelding) in de themakleur; een uitgeschakelde rij is afgelopen of niet te kiezen (zachtere tekst).
//
// De lijst hoort onderaan een Kaart met `lijst`; `zonderKop` zegt dat er boven de lijst geen titel staat, zodat de eerste
// rij de bovenhoeken van de kaart volgt.

import Link from 'next/link';
import type { ReactNode } from 'react';

import { Icoon } from '@/components/icoon/icoon';

import stijl from './lijst.module.css';

export function Lijst({ zonderKop, children }: { zonderKop?: boolean; children: ReactNode }) {
  return (
    <ul className={[stijl.lijst, zonderKop ? stijl.zonderKop : undefined].filter(Boolean).join(' ')}>
      {children}
    </ul>
  );
}

interface RijEigenschappen {
  /** Maakt de hele rij een link. */
  href?: string;
  /** Jouw rij, in de themakleur. */
  gemarkeerd?: boolean;
  /** Afgelopen of niet te kiezen. */
  uitgeschakeld?: boolean;
  children: ReactNode;
}

export function Lijstrij({ href, gemarkeerd, uitgeschakeld, children }: RijEigenschappen) {
  const klasse = [
    stijl.rij,
    gemarkeerd ? stijl.gemarkeerd : undefined,
    uitgeschakeld ? stijl.uitgeschakeld : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={stijl.item}>
      {href !== undefined ? (
        <Link href={href} className={[klasse, stijl.link].join(' ')}>
          {children}
          <Icoon naam="chevron-rechts" className={stijl.chevron} />
        </Link>
      ) : (
        <div className={klasse}>{children}</div>
      )}
    </li>
  );
}
