// Een activiteit zoals een lid hem leest (UC-001): het kaartje met de tijdlijn, "belangrijk om te weten" en de rolbezetting.
// Het welkomscherm toont dit voor de eerstvolgende activiteit(en), het activiteitscherm in het programma voor één. De
// zijkolom "Jouw status" staat er los van, want die hoort bij alle activiteiten van het scherm samen.

import { Icoon } from '@/components/icoon/icoon';
import { Rolbezetting } from '@/components/rolbezetting/rolbezetting';
import type { StatusRegel } from '@/components/jouwstatus/jouwstatus';
import { Tijdlijnkaartje } from '@/components/tijdlijnkaartje/tijdlijnkaartje';
import {
  groepeerRollen,
  isNogNietIngedeeld,
  maakJouwstatus,
  maakTijdlijn,
  nogNietIngevuld,
  statusZin,
  type LedenActiviteit,
} from '@/lib/ledenactiviteit';

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
}

export function Activiteitblok({ activiteit, indeling, eigenLidId, dag, metNaam }: Eigenschappen) {
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
): StatusRegel {
  const groepen = groepeerRollen(indeling.plekken, eigenLidId);
  const zin = statusZin(maakJouwstatus(activiteit.naam, groepen, indeling.afgemeld));
  return {
    id: activiteit.id,
    naam: activiteit.naam,
    soort: zin.soort,
    tekst: zin.tekst,
    ...(beheren ? { beheerHref: `/beheer/activiteiten/${activiteit.id}` } : {}),
  };
}
