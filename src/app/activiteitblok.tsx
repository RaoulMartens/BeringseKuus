// Een activiteit zoals een lid hem leest (UC-001): het kaartje met de tijdlijn, "belangrijk om te weten" en de rolbezetting.
// Het welkomscherm toont dit voor de eerstvolgende activiteit(en), het activiteitscherm in het programma voor één. De
// zijkolom "Jouw status" staat er los van, want die hoort bij alle activiteiten van het scherm samen.

import { Icoon } from '@/components/icoon/icoon';
import { Rolbezetting } from '@/components/rolbezetting/rolbezetting';
import type { StatusRegel } from '@/components/jouwstatus/jouwstatus';
import { Tijdlijnkaartje } from '@/components/tijdlijnkaartje/tijdlijnkaartje';
import { afmeldenHref, maakAanbod } from '@/lib/afmelden';
import { ruilHref } from '@/lib/ruilen';
import {
  groepeerRollen,
  isNogNietIngedeeld,
  maakJouwstatus,
  maakTijdlijn,
  nogNietIngevuld,
  statusZin,
  type LedenActiviteit,
} from '@/lib/ledenactiviteit';

import { trekAfmeldingIn } from './afmelden/acties';
import type { Indeling } from './ledenactiviteit';

import stijl from './activiteitblok.module.css';

interface Eigenschappen {
  activiteit: LedenActiviteit;
  indeling: Indeling;
  eigenLidId: string;
  /** De regel boven de naam ("Morgen, vrijdag 22 januari"); leeg als de kop van de pagina de dag al noemt. */
  dag?: string;
  /** Toon de naam als kop in het kaartje; niet als de naam al de <h1> van de pagina is. */
  metNaam: boolean;
  /** Waar "Al je diensten" op je eigen rij heen gaat (Mijn diensten); leeg op schermen zonder die ingang. */
  alleDienstenHref?: string;
}

export function Activiteitblok({
  activiteit,
  indeling,
  eigenLidId,
  dag,
  metNaam,
  alleDienstenHref,
}: Eigenschappen) {
  const groepen = groepeerRollen(indeling.plekken, eigenLidId);
  const ontbreekt = nogNietIngevuld(activiteit);
  const notitie = activiteit.notitie?.trim();

  return (
    <>
      <Tijdlijnkaartje
        dag={dag}
        naam={metNaam ? activiteit.naam : undefined}
        kop={metNaam ? 'h2' : undefined}
        stops={maakTijdlijn(activiteit)}
      />
      {notitie && (
        <section className={stijl.belangrijk}>
          <h2 className={stijl.belangrijkKop}>
            <Icoon naam="info" className={stijl.belangrijkIcoon} />
            Belangrijk om te weten
          </h2>
          <p className={stijl.belangrijkTekst}>{notitie}</p>
        </section>
      )}
      {ontbreekt && <p className={stijl.nogNiet}>{ontbreekt}</p>}
      <Rolbezetting
        activiteit={activiteit.naam}
        groepen={groepen}
        telefoon={indeling.telefoon}
        onderaan={isNogNietIngedeeld(groepen) ? 'De rest van de indeling volgt nog.' : undefined}
        eigenLink={alleDienstenHref ? { href: alleDienstenHref, tekst: 'Al je diensten' } : undefined}
      />
    </>
  );
}

/** De regel in het paneel "Jouw status" voor een activiteit. */
export function maakStatusRegel(
  activiteit: LedenActiviteit,
  indeling: Indeling,
  eigenLidId: string,
  beheren: boolean,
  nu: Date,
): StatusRegel {
  const groepen = groepeerRollen(indeling.plekken, eigenLidId);
  const status = maakJouwstatus(activiteit.naam, groepen, indeling.afgemeld);
  const zin = statusZin(status);
  // Welke knoppen er staan: afmelden zonder dienst, intrekken als je bent afgemeld, en een uitleg bij een beheerrol of dienst.
  const ev = indeling.plekken.find((plek) => plek.rol === 'eindverantwoordelijke');
  const aanbod = maakAanbod(
    activiteit,
    nu,
    indeling.afgemeld,
    status.rollen,
    ev ? { naam: ev.naam, telefoon: indeling.telefoon } : null,
  );
  return {
    id: activiteit.id,
    naam: activiteit.naam,
    soort: zin.soort,
    tekst: zin.tekst,
    ...(beheren ? { beheerHref: `/beheer/activiteiten/${activiteit.id}` } : {}),
    ...(aanbod.afmelden ? { afmeldHref: afmeldenHref(activiteit.id) } : {}),
    ...(aanbod.overdragen ? { overdragenHref: ruilHref(activiteit.id) } : {}),
    ...(aanbod.intrekken ? { intrekActie: trekAfmeldingIn } : {}),
    ...(aanbod.hulp ? { hulp: aanbod.hulp } : {}),
  };
}
