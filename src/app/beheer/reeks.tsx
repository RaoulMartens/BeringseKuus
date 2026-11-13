// Een reeks in het beheeroverzicht: dezelfde activiteit op meerdere opeenvolgende dagen met dezelfde taak (bijvoorbeeld vijf
// concepten "Verkoop donateurskaarten", elk met dezelfde ontbrekende gegevens) als één rij, met de losse dagen eronder. Elke dag
// opent zijn eigen activiteit. Hetzelfde idee als in het programma (src/app/programma/reeks.tsx); de rij klapt open met
// <details>, dus het werkt met toetsenbord en schermlezer en zonder JavaScript.

import Link from 'next/link';

import { Icoon } from '@/components/icoon/icoon';
import { Statuslabel } from '@/components/statuslabel/statuslabel';
import type { OverzichtRegel } from '@/lib/beheeroverzicht';
import { periodeTekst } from '@/lib/programma';

import beheer from './beheer.module.css';
import stijl from './reeks.module.css';

export function Beheerreeks({ regels }: { regels: OverzichtRegel[] }) {
  const eerste = regels[0];
  const laatste = regels[regels.length - 1];
  if (!eerste || !laatste) return null;

  return (
    <li className={stijl.reeks}>
      <details className={stijl.details}>
        <summary className={stijl.samenvatting}>
          <span className={beheer.rijInhoud}>
            <span className={beheer.tekst}>
              <span className={beheer.dag}>{periodeTekst(eerste.datum, laatste.datum)}</span>
              <strong className={beheer.naam}>
                {eerste.naam}
                {eerste.tijd && <span className={beheer.tijd}> — {eerste.tijd}</span>}
              </strong>
              {eerste.taak && <span className={beheer.taak}>{eerste.taak}</span>}
              {!eerste.taak && eerste.aanwezigheid && (
                <span className={beheer.aanwezig}>{eerste.aanwezigheid}</span>
              )}
            </span>
            {eerste.status !== 'gepubliceerd' && (
              <span className={beheer.label}>
                <Statuslabel status={eerste.status} compactOpTelefoon>
                  {eerste.status === 'concept' ? 'Concept' : 'Geannuleerd'}
                </Statuslabel>
              </span>
            )}
          </span>
          <Icoon naam="chevron-omlaag" className={stijl.chevron} />
        </summary>
        <ul className={stijl.dagen}>
          {regels.map((regel) => (
            <li key={regel.id}>
              <Link href={`/beheer/activiteiten/${regel.id}`} className={stijl.dagRij}>
                <span>{regel.dag}</span>
                <Icoon naam="chevron-rechts" className={stijl.chevronRechts} />
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}
