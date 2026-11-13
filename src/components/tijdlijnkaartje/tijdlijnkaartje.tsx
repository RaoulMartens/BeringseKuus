// Het activiteitkaartje (docs/visueel/stijl.css, sectie 12): de dag klein, de naam groot, en één tijdlijn van de avond in
// volgorde van gebeuren, met de plaats bij de stop waar je ze nodig hebt (waar je verzamelt, waar de bus vertrekt). Een
// lid leest hier wanneer en waar; wat niet is ingevuld, staat er niet (ontwerpregel).
//
// De stops staan onder elkaar, één regel per moment (tijd, wat, waar). De opbouw volgt de breedte van het kaartje zelf, niet die van
// het scherm (container query): naast een zijkolom is het kaartje smaller dan de pagina; dan komt de plaats onder tijd en wat.

import { useId } from 'react';

import { Icoon } from '@/components/icoon/icoon';
import type { Stop } from '@/lib/ledenactiviteit';

import stijl from './tijdlijnkaartje.module.css';

interface Eigenschappen {
  /** Een kleine regel boven de naam: "Morgen, vrijdag 22 januari". Weglaten als de kop van de pagina de dag al noemt. */
  dag?: string;
  /** Weglaten als de naam al de <h1> van de pagina is. */
  naam?: string;
  /** Het kopniveau van de naam. */
  kop?: 'h2';
  stops: Stop[];
}

/**
 * De plaats van een moment: de naam vet en het adres eronder. De locatie is één tekst ("Gemeenschapshuis De Kuus, Kerkstraat 12"); alles na
 * de eerste komma is het adres. Zonder komma staat er alleen de naam.
 */
function Plek({ plek }: { plek: string }) {
  const [naam = '', ...rest] = plek.split(',');
  const adres = rest.join(',').trim();
  return (
    <span className={stijl.plek}>
      <Icoon naam="locatie" className={stijl.plekIcoon} />
      <span className={stijl.plekNaam}>{naam.trim()}</span>
      {adres && ' '}
      {adres && <span className={stijl.plekAdres}>{adres}</span>}
    </span>
  );
}

export function Tijdlijnkaartje({ dag, naam, kop: Kop, stops }: Eigenschappen) {
  // Met een kop is het kaartje een eigen onderdeel van de pagina met de naam van de activiteit (twee activiteiten op één dag).
  const kopId = useId();
  return (
    <section className={stijl.kaartje} aria-labelledby={naam && Kop ? kopId : undefined}>
      <div className={stijl.boven}>
        {dag && <span className={stijl.dag}>{dag}</span>}
        {naam &&
          (Kop ? (
            <Kop id={kopId} className={stijl.naam}>
              {naam}
            </Kop>
          ) : (
            <p className={stijl.naam}>{naam}</p>
          ))}
        {stops.length > 0 && (
          <ol className={[stijl.stops, dag || naam ? stijl.metKop : ''].join(' ')}>
            {stops.map((stop, nummer) => (
              <li
                key={`${stop.tijd}-${stop.wat}`}
                className={[stijl.stop, nummer === 0 ? stijl.eerst : ''].join(' ')}
              >
                <span className={stijl.punt} aria-hidden="true" />
                <strong className={stijl.tijd}>{stop.tijd}</strong>
                <span className={stijl.wat}>
                  {stop.icoon && <Icoon naam={stop.icoon} className={stijl.watIcoon} />}
                  {stop.wat}
                </span>
                {stop.plek && <Plek plek={stop.plek} />}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
