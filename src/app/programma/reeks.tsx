// Een reeks in het programma: dezelfde activiteit op meerdere opeenvolgende dagen (bijvoorbeeld het verkopen van
// donateurskaarten van maandag tot en met vrijdag) als één rij, met de losse dagen eronder. Zonder dit staat dezelfde naam vijf
// keer onder elkaar. De rij klapt open met <details>, dus het werkt met toetsenbord en schermlezer en zonder JavaScript.

import Link from 'next/link';

import { Datumblok } from '@/components/datumblok/datumblok';
import { Icoon } from '@/components/icoon/icoon';
import { dagTekst, programmaLink, reeksDatum, reeksRegel, type Reeks } from '@/lib/programma';

import programma from './programma.module.css';
import stijl from './reeks.module.css';
import { Rijstatus } from './rijstatus';

export function Reeksrij({
  reeks,
  vandaag,
  geweest,
  zichtbaarAlsLid,
}: {
  reeks: Reeks;
  vandaag: string;
  geweest: boolean;
  /** De id's van de activiteiten die dit lid als lid ziet; wat hij als lid niet ziet, opent in beheer. */
  zichtbaarAlsLid: Set<string>;
}) {
  const eerste = dagTekst(reeks.activiteiten[0]?.datum ?? vandaag);
  const laatste = dagTekst(reeks.activiteiten[reeks.activiteiten.length - 1]?.datum ?? vandaag);
  const regel = reeksRegel(reeks);
  const periode = reeksDatum(reeks);

  return (
    <li className={stijl.reeks}>
      <details className={stijl.details}>
        <summary className={[stijl.samenvatting, geweest ? stijl.uit : undefined].filter(Boolean).join(' ')}>
          <span className={programma.rijInhoud}>
            <Datumblok
              weekdag={`${eerste.weekdag}–${laatste.weekdag}`}
              dag={`${eerste.dag}–${laatste.dag}`}
              lang={periode}
              vandaag={reeks.activiteiten.some((a) => a.datum === vandaag)}
            />
            <span className={programma.kolom}>
              <span className={programma.tekst}>
                <strong className={programma.naam}>{reeks.naam}</strong>
                {regel && <span className={programma.regel}>{regel}</span>}
              </span>
              {reeks.status !== 'gepubliceerd' && (
                <span className={programma.label}>
                  <Rijstatus status={reeks.status} />
                </span>
              )}
            </span>
          </span>
          <Icoon naam="chevron-omlaag" className={stijl.chevron} />
        </summary>
        <ul className={stijl.dagen}>
          {reeks.activiteiten.map((activiteit) => (
            <li key={activiteit.id}>
              <Link
                href={programmaLink(activiteit, zichtbaarAlsLid.has(activiteit.id))}
                className={[stijl.dag, geweest ? stijl.uit : undefined].filter(Boolean).join(' ')}
              >
                <span>{dagTekst(activiteit.datum).lang}</span>
                <Icoon naam="chevron-rechts" className={stijl.chevronRechts} />
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}
