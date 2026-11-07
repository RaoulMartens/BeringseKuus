// Het paneel "Jouw status" (docs/visueel/stijl.css, sectie 13g): wat er over jou bij de activiteit staat, op één plek in de
// zijkolom. Bij twee activiteiten op één dag staat er per activiteit een regel (UC-001 AF-8). Hier staan ook de knoppen
// Afmelden (naar de bevestigingspagina), Afmelding intrekken (direct, het kan terug) en Dienst overdragen, en voor het bestuur de
// link naar beheer. Welke knop er staat, beslist maakAanbod in src/lib/afmelden.ts.
//
// De opbouw volgt het visuele ontwerp: 1 de status is de kop (groot, in de kleur van de status), 2 de uitleg is klein en zacht,
// 3 de hoofdactie (Afmelden, rood; Afmelding intrekken, groen), 4 het alternatief (Dienst overdragen) apart onder een lijn, met
// een kleinere vraag erboven. Op een telefoon staan Afmelden en Dienst overdragen naast elkaar, zonder de uitleg en de vraag
// (visueel ontwerp, INDEX punt 69). De kop "Jouw status" is er voor een schermlezer en geeft het paneel zijn naam; zichtbaar is de
// status zelf de kop.

import Link from 'next/link';
import { useId } from 'react';

import { Icoon } from '@/components/icoon/icoon';
import { Knop } from '@/components/knop/knop';
import type { AfmeldActie } from '@/lib/afmelden';

import { Intrekformulier } from './intrekformulier';
import stijl from './jouwstatus.module.css';

export interface StatusRegel {
  id: string;
  naam: string;
  soort: 'aanwezig' | 'afgemeld';
  tekst: string;
  /** Voor het bestuur: waar de activiteit te beheren is. */
  beheerHref?: string;
  /** Waar Afmelden heen gaat; leeg als het lid zich hier niet kan afmelden. */
  afmeldHref?: string;
  /** Waar Dienst overdragen heen gaat; alleen met een dienst die het lid zelf kan overdragen. */
  overdragenHref?: string;
  /** De serveractie voor Afmelding intrekken; leeg als er niets in te trekken valt. */
  intrekActie?: AfmeldActie;
  /** Een korte uitleg als er geen knop is terwijl een lid er een zou verwachten (BOB, een dienst). */
  hulp?: string;
}

const UITLEG_AANWEZIG = 'Iedereen staat standaard op aanwezig; alleen afmeldingen worden vastgelegd.';
const UITLEG_INTREKKEN = 'Je kunt dit intrekken zolang de activiteit nog niet is geweest.';

function uitlegBij(regel: StatusRegel): string | null {
  if (regel.soort === 'aanwezig') return UITLEG_AANWEZIG;
  return regel.intrekActie ? UITLEG_INTREKKEN : null;
}

export function Jouwstatus({ regels }: { regels: StatusRegel[] }) {
  const meerdere = regels.length > 1;
  // Het paneel staat twee keer in de pagina (een telefoon toont de bovenste, een groot scherm de zijkolom): elk een eigen id.
  const kopId = useId();
  return (
    <section className={stijl.kaart} aria-labelledby={kopId}>
      <h2 id={kopId} className={stijl.verborgen}>
        Jouw status
      </h2>
      <ul className={stijl.regels}>
        {regels.map((regel) => {
          // Bij één activiteit staat de uitleg direct onder de status; bij meer staat de algemene uitleg één keer onderaan.
          const uitleg = meerdere ? null : uitlegBij(regel);
          // Naast elkaar alleen met de korte knopteksten van één activiteit; "Afmelden voor <naam>" past niet in een halve breedte.
          const naastElkaar = !meerdere && regel.afmeldHref && regel.overdragenHref;
          return (
            <li
              key={regel.id}
              className={[stijl.regel, naastElkaar ? stijl.tweeKnoppen : undefined].filter(Boolean).join(' ')}
            >
              <p
                className={[stijl.zin, regel.soort === 'afgemeld' ? stijl.afgemeld : stijl.aanwezig].join(
                  ' ',
                )}
              >
                <Icoon naam={regel.soort === 'afgemeld' ? 'fout' : 'succes'} className={stijl.icoon} />
                <span>
                  {meerdere && <strong>{regel.naam} — </strong>}
                  {regel.tekst}
                </span>
              </p>
              {uitleg && <p className={stijl.uitleg}>{uitleg}</p>}
              {regel.hulp && <p className={stijl.hulp}>{regel.hulp}</p>}
              {regel.afmeldHref && (
                <div className={stijl.knop}>
                  <Knop href={regel.afmeldHref} soort="negatief">
                    {meerdere ? `Afmelden voor ${regel.naam}` : 'Afmelden'}
                  </Knop>
                </div>
              )}
              {regel.intrekActie && (
                <div className={stijl.knop}>
                  <Intrekformulier
                    activiteitId={regel.id}
                    actie={regel.intrekActie}
                    soort="positief"
                    label={meerdere ? `Afmelding voor ${regel.naam} intrekken` : 'Afmelding intrekken'}
                  />
                </div>
              )}
              {regel.overdragenHref && (
                <div className={stijl.tweedeKeus}>
                  <p className={stijl.vraag}>Kun je wel komen, maar wil je alleen je dienst kwijt?</p>
                  <div className={stijl.knop}>
                    <Knop href={regel.overdragenHref} soort="secundair" icoon="wisselen">
                      {meerdere ? `Dienst overdragen voor ${regel.naam}` : 'Dienst overdragen'}
                    </Knop>
                  </div>
                </div>
              )}
              {regel.beheerHref && (
                <Link href={regel.beheerHref} className={stijl.beheer}>
                  {meerdere ? `${regel.naam} beheren` : 'Deze activiteit beheren'}
                  <Icoon naam="pijl-rechts" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {meerdere && <p className={stijl.uitleg}>{UITLEG_AANWEZIG}</p>}
    </section>
  );
}
